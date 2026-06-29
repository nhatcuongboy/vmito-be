import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import {
  Prisma,
  CategoryType,
  CategoryRegistrationMode,
  CategoryFormat,
  MatchFormat,
  MatchStatus,
  SportType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateCategoryRegistrationDto } from './dto/create-category-registration.dto';
import { ConvertLegacyRegistrationDto } from '../tournaments/dto/tournament-pair.dto';
import { CreateCategoryMatchDto } from './dto/create-category-match.dto';
import { EndCategoryMatchDto } from './dto/end-category-match.dto';
import { UpdateMatchScoreDto } from './dto/update-match-score.dto';
import { UpdatePickleballServeDto } from './dto/update-pickleball-serve.dto';
import { UpdateSetScoreDto } from './dto/update-set-score.dto';
import {
  TournamentsGateway,
  TournamentEventType,
} from '../tournaments/realtime/tournaments.gateway';
import {
  applyDelta,
  rebuildFromLog,
  buildScoreString,
  totalsFromSets,
  MatchAlreadyDecidedError,
  ScoringSet,
  ScoringRules,
  PointLogEntry,
  MatchFormatValue,
  Side,
  isSetComplete,
} from './scoring/badminton-scoring';
import {
  normalizeMatchForBroadcast,
  NormalizableMatch,
} from './scoring/normalize-match';
import { MATCH_SCORING_INCLUDE } from './scoring/match-include';
import {
  computeStandings,
  resolveStandingsConfig,
  StandingsMatchInput,
} from './scoring/standings';
import {
  TournamentAccessService,
  ManageScope,
} from '../common/tournament-access/tournament-access.service';
import { getTournamentSportProfile } from '../tournaments/sport-profiles';

type TScoringStage = 'GROUP' | 'KNOCKOUT' | 'FINAL';

/**
 * Map a CategoryMatch.round label to its scoring stage.
 * - 'GROUP' (round-robin pool) → GROUP
 * - 'F' (final) and 'GF'/'GF2' (double-elim grand final) → FINAL
 * - everything else (R128/R64/R32/R16/QF/SF/3RD, UB-x/LB-x) → KNOCKOUT
 */
const stageOfRound = (round: string): TScoringStage => {
  if (round === 'GROUP') return 'GROUP';
  if (round === 'F' || round === 'GF' || round === 'GF2') return 'FINAL';
  return 'KNOCKOUT';
};

interface CategoryUpdateData {
  name?: string;
  type?: CategoryType;
  registrationMode?: CategoryRegistrationMode;
  teamSize?: number;
  hasGroupStage?: boolean;
  averageMatchDuration?: number;
  groupCount?: number;
  winnersPerGroup?: number;
  playersPerGroup?: number;
  matchFormat?: MatchFormat;
  format?: CategoryFormat;
  formatConfig?: object;
  eliminationMatchFormat?: MatchFormat;
  thirdPlaceMatch?: boolean;
  pointsToWin?: number;
  winByTwo?: boolean;
  pointCap?: number | null;
  knockoutPointsToWin?: number | null;
  knockoutWinByTwo?: boolean | null;
  knockoutPointCap?: number | null;
  finalPointsToWin?: number | null;
  finalWinByTwo?: boolean | null;
  finalPointCap?: number | null;
}

const DOUBLES_TYPES: CategoryType[] = [
  'MENS_DOUBLE',
  'WOMENS_DOUBLE',
  'MIXED_DOUBLE',
];

const registrationConfigForType = (
  type: CategoryType,
  mode?: string,
  teamSize?: number
) => {
  if (type === 'MENS_SINGLE' || type === 'WOMENS_SINGLE') {
    return { registrationMode: 'INDIVIDUAL' as const, teamSize: 1 };
  }
  if (DOUBLES_TYPES.includes(type)) {
    return { registrationMode: 'TEAM' as const, teamSize: 2 };
  }
  const registrationMode = (mode ?? 'TEAM') as CategoryRegistrationMode;
  return {
    registrationMode,
    teamSize:
      registrationMode === 'INDIVIDUAL' ? 1 : Math.max(2, teamSize ?? 2),
  };
};

@Injectable()
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    private tournamentsGateway: TournamentsGateway,
    private access: TournamentAccessService
  ) {}

  // ─── Helpers ───────────────────────────────────────────────

  private async getCategoryWithOwnership(
    categoryId: string,
    userId: string,
    role: string | undefined,
    scope: ManageScope
  ) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: { tournament: { select: { hostId: true } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    await this.access.assertManageAccess({
      tournamentId: category.tournamentId,
      hostId: category.tournament.hostId,
      userId,
      role,
      scope,
    });
    return category;
  }

  private async getMatchWithOwnership(
    matchId: string,
    userId: string,
    role: string | undefined,
    scope: ManageScope
  ) {
    const match = await this.prisma.categoryMatch.findUnique({
      where: { id: matchId },
      include: {
        category: { include: { tournament: { select: { hostId: true } } } },
        participants: true,
        court: true,
        group: true,
      },
    });
    if (!match) throw new NotFoundException('Match not found');
    await this.access.assertManageAccess({
      tournamentId: match.category.tournamentId,
      hostId: match.category.tournament.hostId,
      userId,
      role,
      scope,
    });
    return match;
  }

  // ─── Live scoring helpers ─────────────────────────────────

  /**
   * Like getMatchWithOwnership, but also authorizes the referee assigned to the
   * match (a TournamentUmpire linked to the requesting user). Used for
   * start/score/undo/end. Destructive/schedule ops keep getMatchWithOwnership.
   */
  private async getMatchForScoring(
    matchId: string,
    userId: string,
    role?: string
  ) {
    const match = await this.prisma.categoryMatch.findUnique({
      where: { id: matchId },
      include: MATCH_SCORING_INCLUDE,
    });
    if (!match) throw new NotFoundException('Match not found');
    const isHost = match.category.tournament.hostId === userId;
    const isAdmin = role === 'ADMIN';
    const isAssignedReferee =
      !!match.referee?.userId && match.referee.userId === userId;
    const isManager =
      isHost || isAdmin || isAssignedReferee
        ? false
        : await this.access.hasManageAccess({
            tournamentId: match.category.tournamentId,
            hostId: match.category.tournament.hostId,
            userId,
            role,
            scope: 'RESULTS',
          });
    if (!isHost && !isAdmin && !isAssignedReferee && !isManager) {
      throw new ForbiddenException(
        'You are not authorized to score this match'
      );
    }
    return match;
  }

  private isDoublesMatch(match: {
    category: { type: CategoryType };
    participants: Array<{
      categoryRegistration?: { pair?: unknown } | null;
    }>;
  }): boolean {
    if (DOUBLES_TYPES.includes(match.category.type)) return true;
    return match.participants.some((p) => p.categoryRegistration?.pair != null);
  }

  private matchFormatOf(match: {
    matchFormat: MatchFormat | null;
    category: {
      matchFormat: MatchFormat | null;
      tournament?: { sportType?: SportType | null } | null;
    };
  }): MatchFormatValue {
    const fallback = getTournamentSportProfile(
      match.category.tournament?.sportType
    ).defaultScoring.matchFormat;
    return (match.matchFormat ??
      match.category.matchFormat ??
      fallback) as MatchFormatValue;
  }

  /**
   * Resolve the per-set scoring rules for a match. Match-level overrides win
   * first; otherwise the category's per-stage override for the match's round
   * applies (final → knockout → base), with the base column as the ultimate
   * fallback (which itself defaults to BWF rules at the column level).
   */
  private scoringRulesOf(match: {
    round: string;
    pointsToWin: number | null;
    winByTwo: boolean | null;
    pointCap: number | null;
    category: {
      pointsToWin: number;
      winByTwo: boolean;
      pointCap: number | null;
      knockoutPointsToWin: number | null;
      knockoutWinByTwo: boolean | null;
      knockoutPointCap: number | null;
      finalPointsToWin: number | null;
      finalWinByTwo: boolean | null;
      finalPointCap: number | null;
      tournament?: { sportType?: SportType | null } | null;
    };
  }): ScoringRules {
    const stage = stageOfRound(match.round);
    const cat = match.category;
    const fallback = getTournamentSportProfile(
      cat.tournament?.sportType
    ).defaultScoring;

    const resolvePoints = (): number => {
      if (stage === 'FINAL') {
        return (
          cat.finalPointsToWin ??
          cat.knockoutPointsToWin ??
          cat.pointsToWin ??
          fallback.pointsToWin
        );
      }
      if (stage === 'KNOCKOUT') {
        return (
          cat.knockoutPointsToWin ?? cat.pointsToWin ?? fallback.pointsToWin
        );
      }
      return cat.pointsToWin ?? fallback.pointsToWin;
    };

    const resolveWinByTwo = (): boolean => {
      if (stage === 'FINAL') {
        return (
          cat.finalWinByTwo ??
          cat.knockoutWinByTwo ??
          cat.winByTwo ??
          fallback.winByTwo
        );
      }
      if (stage === 'KNOCKOUT') {
        return cat.knockoutWinByTwo ?? cat.winByTwo ?? fallback.winByTwo;
      }
      return cat.winByTwo ?? fallback.winByTwo;
    };

    const resolveCap = (): number | null => {
      if (stage === 'FINAL') {
        if (cat.finalPointCap !== null) return cat.finalPointCap;
        if (cat.knockoutPointCap !== null) return cat.knockoutPointCap;
        return cat.pointCap !== undefined ? cat.pointCap : fallback.pointCap;
      }
      if (stage === 'KNOCKOUT') {
        return cat.knockoutPointCap !== null
          ? cat.knockoutPointCap
          : cat.pointCap !== undefined
            ? cat.pointCap
            : fallback.pointCap;
      }
      return cat.pointCap !== undefined ? cat.pointCap : fallback.pointCap;
    };

    return {
      pointsToWin: match.pointsToWin ?? resolvePoints(),
      winByTwo: match.winByTwo ?? resolveWinByTwo(),
      pointCap:
        match.pointCap !== null && match.pointCap !== undefined
          ? match.pointCap
          : resolveCap(),
    };
  }

  private parseSets(raw: Prisma.JsonValue | undefined): ScoringSet[] {
    if (!Array.isArray(raw)) return [];
    const result: ScoringSet[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const s = item as Record<string, unknown>;
      const set: ScoringSet = {
        setNumber: Number(s.setNumber) || 0,
        player1Score: Number(s.player1Score) || 0,
        player2Score: Number(s.player2Score) || 0,
      };
      if (s.player3Score !== undefined) {
        set.player3Score = Number(s.player3Score) || 0;
      }
      if (s.player4Score !== undefined) {
        set.player4Score = Number(s.player4Score) || 0;
      }
      result.push(set);
    }
    return result;
  }

  private parsePointLog(raw: Prisma.JsonValue | undefined): PointLogEntry[] {
    if (!Array.isArray(raw)) return [];
    const result: PointLogEntry[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const e = item as Record<string, unknown>;
      if (e.side !== 1 && e.side !== 2) continue;
      result.push({
        side: e.side as Side,
        setNumber: Number(e.setNumber) || 1,
      });
    }
    return result;
  }

  /**
   * Persist a recomputed score with an optimistic-lock guard (scoreVersion),
   * then broadcast the normalized match to the tournament room.
   */
  private async persistAndBroadcastScore(
    match: { id: string; scoreVersion: number },
    newSets: ScoringSet[],
    newLog: PointLogEntry[],
    isDoubles: boolean,
    eventType: TournamentEventType,
    echo?: { clientId?: string; seq?: number }
  ) {
    const totals = totalsFromSets(newSets, isDoubles);
    const scoreStr = buildScoreString(newSets);

    const result = await this.prisma.categoryMatch.updateMany({
      where: { id: match.id, scoreVersion: match.scoreVersion },
      data: {
        sets: newSets as unknown as Prisma.InputJsonValue,
        pointLog: newLog as unknown as Prisma.InputJsonValue,
        score: scoreStr,
        player1Score: totals.player1Score,
        player2Score: totals.player2Score,
        player3Score: totals.player3Score ?? null,
        player4Score: totals.player4Score ?? null,
        scoreVersion: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new ConflictException('Score changed concurrently, please retry');
    }

    const updated = await this.prisma.categoryMatch.findUnique({
      where: { id: match.id },
      include: MATCH_SCORING_INCLUDE,
    });
    if (updated) this.broadcastMatch(updated, eventType, echo);
    return updated;
  }

  private broadcastMatch(
    match: NormalizableMatch,
    eventType: TournamentEventType,
    echo?: { clientId?: string; seq?: number }
  ) {
    const payload = normalizeMatchForBroadcast(match);
    if (!payload.tournamentId) return;
    this.tournamentsGateway.notifyTournamentEvent(
      payload.tournamentId,
      eventType,
      { match: payload, ...(echo ?? {}) }
    );
  }

  /** Point-by-point live score update (+1 / -1) by host/admin/assigned referee. */
  async updateMatchScore(
    id: string,
    dto: UpdateMatchScoreDto,
    userId: string,
    role?: string
  ) {
    const match = await this.getMatchForScoring(id, userId, role);
    if (match.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Score can only be updated while the match is in progress'
      );
    }

    const isDoubles = this.isDoublesMatch(match);
    const format = this.matchFormatOf(match);
    const rules = this.scoringRulesOf(match);
    const sets = this.parseSets(match.sets);
    const log = this.parsePointLog(match.pointLog);

    let newLog: PointLogEntry[];
    if (dto.delta === 1) {
      // Validate the point is allowed (throws if the match is already decided).
      try {
        applyDelta(sets, dto.side, 1, format, isDoubles, rules);
      } catch (e) {
        if (e instanceof MatchAlreadyDecidedError) {
          throw new BadRequestException(
            'Match is already decided. End the match or undo a point.'
          );
        }
        throw e;
      }
      const landingSetNumber =
        sets.length > 0 ? sets[sets.length - 1].setNumber : 1;
      newLog = [...log, { side: dto.side, setNumber: landingSetNumber }];
    } else {
      // Correction: drop the most recent point scored by that side.
      newLog = [...log];
      for (let i = newLog.length - 1; i >= 0; i--) {
        if (newLog[i].side === dto.side) {
          newLog.splice(i, 1);
          break;
        }
      }
    }

    const newSets = rebuildFromLog(newLog, format, isDoubles, rules);
    return this.persistAndBroadcastScore(
      match,
      newSets,
      newLog,
      isDoubles,
      TournamentEventType.TOURNAMENT_MATCH_SCORE_UPDATED,
      { clientId: dto.clientId, seq: dto.seq }
    );
  }

  /** Undo the most recent point (any side) by host/admin/assigned referee. */
  async undoLastPoint(id: string, userId: string, role?: string) {
    const match = await this.getMatchForScoring(id, userId, role);
    if (match.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Score can only be updated while the match is in progress'
      );
    }
    const isDoubles = this.isDoublesMatch(match);
    const format = this.matchFormatOf(match);
    const rules = this.scoringRulesOf(match);
    const log = this.parsePointLog(match.pointLog);
    if (log.length === 0) return match;

    const newLog = log.slice(0, -1);
    const newSets = rebuildFromLog(newLog, format, isDoubles, rules);
    return this.persistAndBroadcastScore(
      match,
      newSets,
      newLog,
      isDoubles,
      TournamentEventType.TOURNAMENT_MATCH_SCORE_UPDATED
    );
  }

  /**
   * Whether a match should track pickleball serve state: only PICKLEBALL
   * doubles. Badminton and pickleball singles never carry serve state.
   */
  private isPickleballDoubles(match: {
    category: {
      type: CategoryType;
      tournament?: { sportType?: SportType | null } | null;
    };
    participants: Array<{
      categoryRegistration?: { pair?: unknown } | null;
    }>;
  }): boolean {
    if (match.category.tournament?.sportType !== SportType.PICKLEBALL) {
      return false;
    }
    return this.isDoublesMatch(match);
  }

  /**
   * Update the pickleball doubles serve state (serving side + server number).
   * Only valid while a PICKLEBALL doubles match is in progress. Mirrors the
   * live-scoring authorization and broadcast so the public scoreboard updates
   * in realtime. V1 keeps this manual — the referee sets serve on rotation.
   */
  async updatePickleballServe(
    id: string,
    dto: UpdatePickleballServeDto,
    userId: string,
    role?: string
  ) {
    const match = await this.getMatchForScoring(id, userId, role);
    if (match.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Serve can only be updated while the match is in progress'
      );
    }
    if (match.category.tournament?.sportType !== SportType.PICKLEBALL) {
      throw new BadRequestException(
        'Serve tracking is only available for pickleball matches'
      );
    }
    if (!this.isDoublesMatch(match)) {
      throw new BadRequestException(
        'Serve tracking is only available for doubles matches'
      );
    }

    await this.prisma.categoryMatch.update({
      where: { id },
      data: {
        servingSide: dto.servingSide,
        serverNumber: dto.serverNumber,
      },
    });

    const updated = await this.prisma.categoryMatch.findUnique({
      where: { id },
      include: MATCH_SCORING_INCLUDE,
    });
    if (updated) {
      this.broadcastMatch(
        updated,
        TournamentEventType.TOURNAMENT_MATCH_SCORE_UPDATED,
        { clientId: dto.clientId, seq: dto.seq }
      );
    }
    return updated;
  }

  /**
   * Overwrite a single set's score by rewriting the point log. Preserves all
   * entries from earlier sets, synthesises an interleaved sequence for the
   * target set (alternating points so the set never auto-completes early),
   * and discards every entry that belonged to later sets.
   *
   * Only available while the match is IN_PROGRESS so the referee can correct
   * a misclick without ending/restarting the match. Already-finished matches
   * must be edited through the match end/result workflow instead.
   */
  async updateSetScore(
    id: string,
    setNumber: number,
    dto: UpdateSetScoreDto,
    userId: string,
    role?: string
  ) {
    const match = await this.getMatchForScoring(id, userId, role);
    if (match.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Score can only be updated while the match is in progress'
      );
    }

    const isDoubles = this.isDoublesMatch(match);
    const format = this.matchFormatOf(match);
    const rules = this.scoringRulesOf(match);
    const sets = this.parseSets(match.sets);
    if (sets.length === 0) {
      throw new BadRequestException('Match has no sets yet');
    }
    const latestSetNumber = sets[sets.length - 1].setNumber;
    if (
      !Number.isInteger(setNumber) ||
      setNumber < 1 ||
      setNumber > latestSetNumber
    ) {
      throw new BadRequestException(
        `setNumber must be between 1 and ${latestSetNumber}`
      );
    }

    const { player1Score, player2Score } = dto;
    if (!Number.isInteger(player1Score) || !Number.isInteger(player2Score)) {
      throw new BadRequestException('Scores must be integers');
    }
    if (player1Score < 0 || player2Score < 0) {
      throw new BadRequestException('Scores cannot be negative');
    }
    const maxScore = Math.max(player1Score, player2Score);
    const cap = rules.pointCap ?? Math.max(rules.pointsToWin, maxScore);
    if (player1Score > cap || player2Score > cap) {
      throw new BadRequestException(`Scores cannot exceed cap (${cap})`);
    }
    // Reject impossible cap-cap (both sides win — not a valid set state).
    if (
      rules.pointCap != null &&
      player1Score === rules.pointCap &&
      player2Score === rules.pointCap
    ) {
      throw new BadRequestException('Both sides cannot reach the cap');
    }
    // Past sets must end with a winner; the current (in-progress) set may be
    // any valid score (including 0-0 to reset).
    if (
      setNumber < latestSetNumber &&
      !isSetComplete(player1Score, player2Score, rules)
    ) {
      throw new BadRequestException(
        `Set ${setNumber} is not the current set and must be a completed set score`
      );
    }

    // Preserve entries for sets BEFORE the target, discard the rest.
    const log = this.parsePointLog(match.pointLog);
    const preserved = log.filter((entry) => entry.setNumber < setNumber);

    // Synthesise points for the target set by interleaving so the set never
    // auto-completes mid-fill (e.g. 21-19 becomes 19 pairs then 2× side1).
    const synthesised: PointLogEntry[] = [];
    const pairs = Math.min(player1Score, player2Score);
    for (let i = 0; i < pairs; i++) {
      synthesised.push({ side: 1, setNumber });
      synthesised.push({ side: 2, setNumber });
    }
    if (player1Score > player2Score) {
      for (let i = 0; i < player1Score - player2Score; i++) {
        synthesised.push({ side: 1, setNumber });
      }
    } else if (player2Score > player1Score) {
      for (let i = 0; i < player2Score - player1Score; i++) {
        synthesised.push({ side: 2, setNumber });
      }
    }

    const newLog = [...preserved, ...synthesised];
    const newSets = rebuildFromLog(newLog, format, isDoubles, rules);

    // Defensive: rebuild should land on the requested score for the target set.
    const rebuiltTarget = newSets.find((s) => s.setNumber === setNumber);
    if (
      !rebuiltTarget ||
      rebuiltTarget.player1Score !== player1Score ||
      rebuiltTarget.player2Score !== player2Score
    ) {
      throw new BadRequestException('Score combination is not reachable');
    }

    return this.persistAndBroadcastScore(
      match,
      newSets,
      newLog,
      isDoubles,
      TournamentEventType.TOURNAMENT_MATCH_SCORE_UPDATED,
      { clientId: dto.clientId, seq: dto.seq }
    );
  }

  /** Assign a tournament umpire as the referee for a match (host/admin only). */
  async assignReferee(
    matchId: string,
    refereeId: string,
    userId: string,
    role?: string
  ) {
    const match = await this.getMatchWithOwnership(
      matchId,
      userId,
      role,
      'SCHEDULE'
    );
    const umpire = await this.prisma.tournamentUmpire.findUnique({
      where: { id: refereeId },
      select: { id: true, tournamentId: true },
    });
    if (!umpire) throw new NotFoundException('Referee not found');
    if (umpire.tournamentId !== match.category.tournamentId) {
      throw new BadRequestException(
        'Referee belongs to a different tournament'
      );
    }
    const updated = await this.prisma.categoryMatch.update({
      where: { id: matchId },
      data: { refereeId },
      include: MATCH_SCORING_INCLUDE,
    });
    this.broadcastMatch(
      updated,
      TournamentEventType.TOURNAMENT_MATCH_REFEREE_ASSIGNED
    );
    return updated;
  }

  async unassignReferee(matchId: string, userId: string, role?: string) {
    await this.getMatchWithOwnership(matchId, userId, role, 'SCHEDULE');
    const updated = await this.prisma.categoryMatch.update({
      where: { id: matchId },
      data: { refereeId: null },
      include: MATCH_SCORING_INCLUDE,
    });
    this.broadcastMatch(
      updated,
      TournamentEventType.TOURNAMENT_MATCH_REFEREE_ASSIGNED
    );
    return updated;
  }

  /** Matches assigned to the requesting user (resolved via referee.userId). */
  async getMyAssignments(
    userId: string,
    filters: { tournamentId?: string; status?: string }
  ) {
    return this.prisma.categoryMatch.findMany({
      where: {
        referee: { userId },
        ...(filters.tournamentId && {
          category: { tournamentId: filters.tournamentId },
        }),
        ...(filters.status && {
          status: filters.status as MatchStatus,
        }),
      },
      include: MATCH_SCORING_INCLUDE,
      orderBy: [{ status: 'asc' }, { matchNumber: 'asc' }],
    });
  }

  // ─── Phase 2: Category CRUD under Tournament ──────────────

  async findByTournament(tournamentId: string) {
    return this.prisma.category.findMany({
      where: { tournamentId },
      include: {
        _count: {
          select: { registrations: true, matches: true, groups: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createCategory(
    tournamentId: string,
    dto: CreateCategoryDto,
    userId: string,
    role?: string
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    await this.access.assertManageAccess({
      tournamentId,
      hostId: tournament.hostId,
      userId,
      role,
      scope: 'STRUCTURE',
    });

    const type = dto.type as CategoryType;
    const registrationConfig = registrationConfigForType(
      type,
      dto.registrationMode,
      dto.teamSize
    );
    const defaultScoring = getTournamentSportProfile(
      tournament.sportType
    ).defaultScoring;

    return this.prisma.category.create({
      data: {
        tournamentId,
        name: dto.name,
        type,
        ...registrationConfig,
        matchFormat: (dto.matchFormat ??
          defaultScoring.matchFormat) as MatchFormat,
        pointsToWin: dto.pointsToWin ?? defaultScoring.pointsToWin,
        winByTwo: dto.winByTwo ?? defaultScoring.winByTwo,
        pointCap:
          dto.pointCap !== undefined ? dto.pointCap : defaultScoring.pointCap,
        ...(dto.format && {
          format: dto.format as CategoryFormat,
          hasGroupStage: dto.format !== 'SINGLE_ELIMINATION',
        }),
        ...(dto.knockoutPointsToWin !== undefined && {
          knockoutPointsToWin: dto.knockoutPointsToWin,
        }),
        ...(dto.knockoutWinByTwo !== undefined && {
          knockoutWinByTwo: dto.knockoutWinByTwo,
        }),
        ...(dto.knockoutPointCap !== undefined && {
          knockoutPointCap: dto.knockoutPointCap,
        }),
        ...(dto.finalPointsToWin !== undefined && {
          finalPointsToWin: dto.finalPointsToWin,
        }),
        ...(dto.finalWinByTwo !== undefined && {
          finalWinByTwo: dto.finalWinByTwo,
        }),
        ...(dto.finalPointCap !== undefined && {
          finalPointCap: dto.finalPointCap,
        }),
      },
      include: {
        _count: {
          select: { registrations: true, matches: true, groups: true },
        },
      },
    });
  }

  // ─── Existing: Category findOne / update / remove ─────────

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        tournament: { select: { id: true, name: true, hostId: true } },
        registrations: {
          include: {
            player: true,
            pair: {
              include: {
                members: {
                  include: { player: true },
                  orderBy: { position: 'asc' },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        groups: {
          include: {
            registrations: {
              include: {
                categoryRegistration: {
                  include: {
                    player: true,
                    pair: {
                      include: {
                        members: {
                          include: { player: true },
                          orderBy: { position: 'asc' },
                        },
                      },
                    },
                  },
                },
              },
            },
            _count: { select: { registrations: true, matches: true } },
          },
          orderBy: { groupNumber: 'asc' },
        },
        matches: {
          include: {
            participants: {
              include: {
                categoryRegistration: {
                  include: {
                    player: true,
                    pair: {
                      include: {
                        members: {
                          include: { player: true },
                          orderBy: { position: 'asc' },
                        },
                      },
                    },
                  },
                },
              },
            },
            court: true,
          },
          orderBy: { matchNumber: 'asc' },
        },
        _count: {
          select: { registrations: true, matches: true, groups: true },
        },
      },
    });

    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
    userId: string,
    role?: string
  ) {
    const category = await this.getCategoryWithOwnership(
      id,
      userId,
      role,
      'STRUCTURE'
    );

    const updateData: CategoryUpdateData = {};

    if (dto.name !== undefined) {
      updateData.name = dto.name;
    }
    if (
      dto.type !== undefined ||
      dto.registrationMode !== undefined ||
      dto.teamSize !== undefined
    ) {
      const type = (dto.type ?? category.type) as CategoryType;
      const config = registrationConfigForType(
        type,
        dto.registrationMode ?? category.registrationMode,
        dto.teamSize ?? category.teamSize
      );
      if (
        (type !== category.type ||
          config.registrationMode !== category.registrationMode ||
          config.teamSize !== category.teamSize) &&
        (await this.prisma.categoryRegistration.count({
          where: { categoryId: id },
        })) > 0
      ) {
        throw new BadRequestException(
          'Cannot change registration mode or team size after registrations exist'
        );
      }
      updateData.type = type;
      updateData.registrationMode = config.registrationMode;
      updateData.teamSize = config.teamSize;
    }
    if (dto.hasGroupStage !== undefined)
      updateData.hasGroupStage = dto.hasGroupStage;
    if (dto.averageMatchDuration !== undefined) {
      if (dto.averageMatchDuration < 0)
        throw new BadRequestException(
          'Average match duration must be non-negative'
        );
      updateData.averageMatchDuration = dto.averageMatchDuration;
    }
    if (dto.groupCount !== undefined) {
      if (dto.groupCount < 0)
        throw new BadRequestException('Group count must be non-negative');
      updateData.groupCount = dto.groupCount;
    }
    if (dto.winnersPerGroup !== undefined) {
      if (dto.winnersPerGroup < 0)
        throw new BadRequestException('Winners per group must be non-negative');
      updateData.winnersPerGroup = dto.winnersPerGroup;
    }
    if (dto.playersPerGroup !== undefined) {
      if (dto.playersPerGroup < 0)
        throw new BadRequestException('Players per group must be non-negative');
      updateData.playersPerGroup = dto.playersPerGroup;
    }
    if (dto.matchFormat !== undefined) {
      updateData.matchFormat = dto.matchFormat as MatchFormat;
    }
    if (dto.format !== undefined) {
      updateData.format = dto.format as CategoryFormat;
      // Auto-derive hasGroupStage from format
      updateData.hasGroupStage = dto.format !== 'SINGLE_ELIMINATION';
    }
    if (dto.formatConfig !== undefined) {
      updateData.formatConfig = dto.formatConfig;
    }
    if (dto.eliminationMatchFormat !== undefined) {
      updateData.eliminationMatchFormat =
        dto.eliminationMatchFormat as MatchFormat;
    }
    if (dto.thirdPlaceMatch !== undefined) {
      updateData.thirdPlaceMatch = dto.thirdPlaceMatch;
    }
    if (dto.pointsToWin !== undefined) {
      if (dto.pointsToWin < 1) {
        throw new BadRequestException('pointsToWin must be at least 1');
      }
      updateData.pointsToWin = dto.pointsToWin;
    }
    if (dto.winByTwo !== undefined) {
      updateData.winByTwo = dto.winByTwo;
    }
    if (dto.pointCap !== undefined) {
      if (dto.pointCap !== null && dto.pointCap < 1) {
        throw new BadRequestException('pointCap must be at least 1 or null');
      }
      updateData.pointCap = dto.pointCap;
    }
    if (dto.knockoutPointsToWin !== undefined) {
      if (dto.knockoutPointsToWin !== null && dto.knockoutPointsToWin < 1) {
        throw new BadRequestException(
          'knockoutPointsToWin must be at least 1 or null'
        );
      }
      updateData.knockoutPointsToWin = dto.knockoutPointsToWin;
    }
    if (dto.knockoutWinByTwo !== undefined) {
      updateData.knockoutWinByTwo = dto.knockoutWinByTwo;
    }
    if (dto.knockoutPointCap !== undefined) {
      if (dto.knockoutPointCap !== null && dto.knockoutPointCap < 1) {
        throw new BadRequestException(
          'knockoutPointCap must be at least 1 or null'
        );
      }
      updateData.knockoutPointCap = dto.knockoutPointCap;
    }
    if (dto.finalPointsToWin !== undefined) {
      if (dto.finalPointsToWin !== null && dto.finalPointsToWin < 1) {
        throw new BadRequestException(
          'finalPointsToWin must be at least 1 or null'
        );
      }
      updateData.finalPointsToWin = dto.finalPointsToWin;
    }
    if (dto.finalWinByTwo !== undefined) {
      updateData.finalWinByTwo = dto.finalWinByTwo;
    }
    if (dto.finalPointCap !== undefined) {
      if (dto.finalPointCap !== null && dto.finalPointCap < 1) {
        throw new BadRequestException(
          'finalPointCap must be at least 1 or null'
        );
      }
      updateData.finalPointCap = dto.finalPointCap;
    }

    const formatChanged =
      dto.matchFormat !== undefined ||
      dto.eliminationMatchFormat !== undefined ||
      dto.formatConfig !== undefined;

    const updated = await this.prisma.category.update({
      where: { id },
      data: updateData,
      include: {
        tournament: { select: { id: true, name: true } },
        _count: {
          select: { registrations: true, matches: true, groups: true },
        },
      },
    });

    // `matchFormat` is denormalized onto each match at generation time. When the
    // host changes the category's format afterwards, re-sync the still-unplayed
    // matches so the schedule/score badges and live scoring reflect the new
    // config — mirroring how the per-set scoring rules are always read live.
    if (formatChanged) {
      await this.syncScheduledMatchFormats(id);
    }

    return updated;
  }

  /**
   * Re-apply the category's per-round match format to its SCHEDULED matches.
   * Group matches inherit `category.matchFormat`; elimination rounds use the
   * elimination format (with `formatConfig.roundFormats` overrides). Matches
   * that are in progress or finished keep the format they were played under.
   */
  private async syncScheduledMatchFormats(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: {
        matchFormat: true,
        eliminationMatchFormat: true,
        formatConfig: true,
      },
    });
    if (!category) return;

    const formatForRound = this.buildFormatForRound(category);
    const groupFormat = category.matchFormat ?? MatchFormat.BEST_OF_1;

    const matches = await this.prisma.categoryMatch.findMany({
      where: { categoryId, status: 'SCHEDULED' },
      select: { id: true, round: true, groupId: true, matchFormat: true },
    });

    await Promise.all(
      matches.flatMap((m) => {
        const next =
          m.groupId || m.round === 'GROUP'
            ? groupFormat
            : formatForRound(m.round);
        if (m.matchFormat === next) return [];
        return [
          this.prisma.categoryMatch.update({
            where: { id: m.id },
            data: { matchFormat: next },
          }),
        ];
      })
    );
  }

  async remove(id: string, userId: string, role?: string) {
    await this.getCategoryWithOwnership(id, userId, role, 'STRUCTURE');
    await this.prisma.category.delete({ where: { id } });
    return { message: 'Category deleted successfully' };
  }

  // ─── Phase 3: Registration CRUD ───────────────────────────

  async getRegistrations(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) throw new NotFoundException('Category not found');

    return this.prisma.categoryRegistration.findMany({
      where: { categoryId },
      include: {
        player: true,
        pair: {
          include: {
            members: {
              include: { player: true },
              orderBy: { position: 'asc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getRegistration(categoryId: string, registrationId: string) {
    const registration = await this.prisma.categoryRegistration.findUnique({
      where: { id: registrationId },
      include: {
        category: true,
        player: true,
        pair: {
          include: {
            members: {
              include: { player: true },
              orderBy: { position: 'asc' },
            },
          },
        },
      },
    });
    if (!registration || registration.categoryId !== categoryId) {
      throw new NotFoundException('Registration not found in this category');
    }
    return registration;
  }

  async getRegistrationMatches(categoryId: string, registrationId: string) {
    await this.getRegistration(categoryId, registrationId);
    return this.prisma.categoryMatch.findMany({
      where: {
        categoryId,
        participants: {
          some: { categoryRegistrationId: registrationId },
        },
      },
      include: MATCH_SCORING_INCLUDE,
      orderBy: { matchNumber: 'asc' },
    });
  }

  async createRegistration(
    categoryId: string,
    dto: CreateCategoryRegistrationDto,
    userId: string,
    role?: string
  ) {
    const category = await this.getCategoryWithOwnership(
      categoryId,
      userId,
      role,
      'PARTICIPANTS'
    );
    if (
      (category.registrationMode === 'TEAM' && !dto.tournamentPairId) ||
      (category.registrationMode === 'INDIVIDUAL' && !dto.tournamentPlayerId)
    ) {
      throw new BadRequestException(
        `Category requires a ${category.registrationMode.toLowerCase()} registration`
      );
    }
    if (dto.tournamentPairId) {
      const pair = await this.prisma.tournamentPair.findUnique({
        where: { id: dto.tournamentPairId },
      });
      if (!pair || pair.tournamentId !== category.tournamentId) {
        throw new BadRequestException(
          'Pair must belong to the category tournament'
        );
      }
    }
    if (dto.tournamentPlayerId) {
      const player = await this.prisma.tournamentPlayer.findUnique({
        where: { id: dto.tournamentPlayerId },
      });
      if (!player || player.tournamentId !== category.tournamentId) {
        throw new BadRequestException(
          'Player must belong to the category tournament'
        );
      }
    }

    // Check for duplicate registration
    const existing = await this.prisma.categoryRegistration.findFirst({
      where: {
        categoryId,
        ...(dto.tournamentPlayerId
          ? { tournamentPlayerId: dto.tournamentPlayerId }
          : { tournamentPairId: dto.tournamentPairId }),
      },
    });
    if (existing) {
      throw new BadRequestException(
        'This player/pair is already registered in this category'
      );
    }

    return this.prisma.categoryRegistration.create({
      data: {
        categoryId,
        tournamentPlayerId: dto.tournamentPlayerId,
        tournamentPairId: dto.tournamentPairId,
      },
      include: {
        player: true,
        pair: {
          include: {
            members: {
              include: { player: true },
              orderBy: { position: 'asc' },
            },
          },
        },
      },
    });
  }

  /**
   * Create many registrations in one request. For TEAM categories each name
   * becomes a new (empty-roster) pair; for INDIVIDUAL categories each name
   * becomes a new player. Pairs/players and their registrations are created in
   * a single transaction so the client makes one round-trip instead of two
   * calls per row (avoids hammering the API with N parallel requests).
   */
  async bulkCreateRegistrations(
    categoryId: string,
    input: { names?: string[]; tournamentPlayerIds?: string[] },
    userId: string,
    role?: string
  ) {
    const category = await this.getCategoryWithOwnership(
      categoryId,
      userId,
      role,
      'PARTICIPANTS'
    );

    const cleaned = (input.names ?? [])
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    const requestedPlayerIds = Array.from(
      new Set((input.tournamentPlayerIds ?? []).filter((id) => id?.length > 0))
    );

    if (cleaned.length === 0 && requestedPlayerIds.length === 0) {
      throw new BadRequestException(
        'At least one name or player must be provided'
      );
    }

    const isTeam = category.registrationMode === 'TEAM';

    if (requestedPlayerIds.length > 0 && isTeam) {
      throw new BadRequestException(
        'Existing players can only be registered in individual categories'
      );
    }

    // Validate that the selected players belong to this tournament and skip the
    // ones that are already registered in this category.
    let newPlayerIds: string[] = [];
    if (requestedPlayerIds.length > 0) {
      const players = await this.prisma.tournamentPlayer.findMany({
        where: {
          id: { in: requestedPlayerIds },
          tournamentId: category.tournamentId,
        },
        select: { id: true },
      });
      if (players.length !== requestedPlayerIds.length) {
        throw new BadRequestException(
          'All selected players must belong to this tournament'
        );
      }

      const alreadyRegistered = await this.prisma.categoryRegistration.findMany({
        where: {
          categoryId,
          tournamentPlayerId: { in: requestedPlayerIds },
        },
        select: { tournamentPlayerId: true },
      });
      const registeredIds = new Set(
        alreadyRegistered
          .map((reg) => reg.tournamentPlayerId)
          .filter((id): id is string => Boolean(id))
      );
      newPlayerIds = requestedPlayerIds.filter((id) => !registeredIds.has(id));
    }

    const registrationInclude = {
      player: true,
      pair: {
        include: {
          members: {
            include: { player: true },
            orderBy: { position: 'asc' },
          },
        },
      },
    } satisfies Prisma.CategoryRegistrationInclude;

    return this.prisma.$transaction(
      async (tx) => {
        const created: Prisma.CategoryRegistrationGetPayload<{
          include: typeof registrationInclude;
        }>[] = [];
        for (const name of cleaned) {
          if (isTeam) {
            const pair = await tx.tournamentPair.create({
              data: {
                tournamentId: category.tournamentId,
                name,
                type: category.type,
              },
            });
            created.push(
              await tx.categoryRegistration.create({
                data: { categoryId, tournamentPairId: pair.id },
                include: registrationInclude,
              })
            );
          } else {
            const player = await tx.tournamentPlayer.create({
              data: { tournamentId: category.tournamentId, name },
            });
            created.push(
              await tx.categoryRegistration.create({
                data: { categoryId, tournamentPlayerId: player.id },
                include: registrationInclude,
              })
            );
          }
        }
        for (const playerId of newPlayerIds) {
          created.push(
            await tx.categoryRegistration.create({
              data: { categoryId, tournamentPlayerId: playerId },
              include: registrationInclude,
            })
          );
        }
        return created;
      },
      { timeout: 60000, maxWait: 10000 }
    );
  }

  async deleteRegistration(
    categoryId: string,
    registrationId: string,
    userId: string,
    role?: string
  ) {
    await this.getCategoryWithOwnership(
      categoryId,
      userId,
      role,
      'PARTICIPANTS'
    );

    const registration = await this.prisma.categoryRegistration.findUnique({
      where: { id: registrationId },
    });
    if (!registration || registration.categoryId !== categoryId) {
      throw new NotFoundException('Registration not found in this category');
    }

    // Remove group assignments first
    await this.prisma.categoryGroupRegistration.deleteMany({
      where: { categoryRegistrationId: registrationId },
    });

    await this.prisma.categoryRegistration.delete({
      where: { id: registrationId },
    });
    return { message: 'Registration removed successfully' };
  }

  async convertLegacyRegistrationToPair(
    categoryId: string,
    registrationId: string,
    dto: ConvertLegacyRegistrationDto,
    userId: string,
    role?: string
  ) {
    const category = await this.getCategoryWithOwnership(
      categoryId,
      userId,
      role,
      'PARTICIPANTS'
    );
    if (category.registrationMode !== 'TEAM') {
      throw new BadRequestException('Only team registrations can be converted');
    }
    const registration = await this.prisma.categoryRegistration.findUnique({
      where: { id: registrationId },
    });
    if (!registration || registration.categoryId !== categoryId) {
      throw new NotFoundException('Registration not found in this category');
    }
    if (registration.tournamentPairId) {
      throw new BadRequestException('Registration is already linked to a pair');
    }
    const players = await this.prisma.tournamentPlayer.findMany({
      where: {
        id: { in: dto.playerIds },
        tournamentId: category.tournamentId,
      },
    });
    if (players.length !== dto.playerIds.length) {
      throw new BadRequestException(
        'All pair members must belong to this tournament'
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const pair = await tx.tournamentPair.create({
        data: {
          tournamentId: category.tournamentId,
          name: dto.name,
          type: (dto.type ?? category.type) as CategoryType,
          notes: dto.notes,
          members: {
            create: dto.playerIds.map((playerId, index) => ({
              playerId,
              position: index + 1,
            })),
          },
        },
      });
      const updated = await tx.categoryRegistration.update({
        where: { id: registrationId },
        data: { tournamentPlayerId: null, tournamentPairId: pair.id },
        include: {
          player: true,
          pair: {
            include: {
              members: {
                include: { player: true },
                orderBy: { position: 'asc' },
              },
            },
          },
        },
      });
      if (registration.tournamentPlayerId) {
        const references = await tx.categoryRegistration.count({
          where: { tournamentPlayerId: registration.tournamentPlayerId },
        });
        if (references === 0) {
          await tx.tournamentPlayer.delete({
            where: { id: registration.tournamentPlayerId },
          });
        }
      }
      return updated;
    });
  }

  /**
   * Ensures a registration is ready for play: for TEAM categories the pair
   * must have its full roster (>= teamSize members).
   *
   * Roster completeness is NOT enforced when building the tournament structure
   * (assigning groups, generating group/bracket matches or the schedule) so
   * organizers can draft brackets early and fill rosters later. It is enforced
   * at play time (starting/ending a match) and before publishing.
   */
  private async assertRegistrationReady(registrationId: string) {
    const registration = await this.prisma.categoryRegistration.findUnique({
      where: { id: registrationId },
      include: {
        category: true,
        pair: { include: { members: true } },
      },
    });
    if (!registration) throw new NotFoundException('Registration not found');
    if (
      registration.category.registrationMode === 'TEAM' &&
      (!registration.pair ||
        registration.pair.members.length < registration.category.teamSize)
    ) {
      throw new BadRequestException(
        'Team roster is incomplete. Add all required members first.'
      );
    }
  }

  /** Ensures every participant of a match has a complete roster before play. */
  private async assertMatchRostersReady(
    participants: { categoryRegistrationId: string }[]
  ) {
    await Promise.all(
      participants.map((participant) =>
        this.assertRegistrationReady(participant.categoryRegistrationId)
      )
    );
  }

  /**
   * Later-round elimination matches are created as empty shells and only get
   * their two participants once both feeding matches finish (see advanceWinner).
   * Block starting/scoring such a match until both sides are determined —
   * otherwise we would record a "TBD vs TBD" result and possibly advance a
   * bogus winner. Group matches always carry both participants from the start,
   * so they are unaffected.
   */
  private assertMatchParticipantsResolved(match: {
    round: string;
    groupId: string | null;
    participants: unknown[];
  }) {
    const isElimination = match.round !== 'GROUP' && !match.groupId;
    if (isElimination && match.participants.length < 2) {
      throw new BadRequestException(
        'Match participants are not determined yet. Wait for the feeding matches to finish.'
      );
    }
  }

  // ─── Phase 4: Group CRUD ──────────────────────────────────

  async getGroups(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) throw new NotFoundException('Category not found');

    return this.prisma.categoryGroup.findMany({
      where: { categoryId },
      include: {
        registrations: {
          include: {
            categoryRegistration: {
              include: {
                player: true,
                pair: {
                  include: {
                    members: {
                      include: { player: true },
                      orderBy: { position: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
        _count: { select: { registrations: true, matches: true } },
      },
      orderBy: { groupNumber: 'asc' },
    });
  }

  async createGroups(categoryId: string, userId: string, role?: string) {
    const category = await this.getCategoryWithOwnership(
      categoryId,
      userId,
      role,
      'STRUCTURE'
    );

    const groupCount = category.groupCount;
    if (!groupCount || groupCount < 1) {
      throw new BadRequestException(
        'Category groupCount must be set before creating groups'
      );
    }

    const existingGroups = await this.prisma.categoryGroup.count({
      where: { categoryId },
    });
    if (existingGroups > 0) {
      throw new BadRequestException(
        'Groups already exist for this category. Delete them first.'
      );
    }

    const groupNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const groups: { categoryId: string; groupNumber: number; name: string }[] =
      [];
    for (let i = 0; i < groupCount; i++) {
      groups.push({
        categoryId,
        groupNumber: i + 1,
        name: `Group ${groupNames[i] || i + 1}`,
      });
    }

    await this.prisma.categoryGroup.createMany({ data: groups });

    return this.getGroups(categoryId);
  }

  async updateGroup(
    categoryId: string,
    groupId: string,
    data: { name?: string },
    userId: string,
    role?: string
  ) {
    await this.getCategoryWithOwnership(categoryId, userId, role, 'STRUCTURE');

    const group = await this.prisma.categoryGroup.findUnique({
      where: { id: groupId },
    });
    if (!group || group.categoryId !== categoryId) {
      throw new NotFoundException('Group not found in this category');
    }

    return this.prisma.categoryGroup.update({
      where: { id: groupId },
      data: { name: data.name },
      include: {
        _count: { select: { registrations: true, matches: true } },
      },
    });
  }

  async deleteGroup(
    categoryId: string,
    groupId: string,
    userId: string,
    role?: string
  ) {
    await this.getCategoryWithOwnership(categoryId, userId, role, 'STRUCTURE');

    const group = await this.prisma.categoryGroup.findUnique({
      where: { id: groupId },
    });
    if (!group || group.categoryId !== categoryId) {
      throw new NotFoundException('Group not found in this category');
    }

    await this.prisma.categoryGroup.delete({ where: { id: groupId } });
    return { message: 'Group deleted successfully' };
  }

  // ─── Phase 5: Group Registration Assignment ───────────────

  async assignRegistrationToGroup(
    categoryId: string,
    groupId: string,
    categoryRegistrationId: string,
    userId: string,
    role?: string
  ) {
    await this.getCategoryWithOwnership(
      categoryId,
      userId,
      role,
      'PARTICIPANTS'
    );

    const group = await this.prisma.categoryGroup.findUnique({
      where: { id: groupId },
    });
    if (!group || group.categoryId !== categoryId) {
      throw new NotFoundException('Group not found in this category');
    }

    const registration = await this.prisma.categoryRegistration.findUnique({
      where: { id: categoryRegistrationId },
    });
    if (!registration || registration.categoryId !== categoryId) {
      throw new NotFoundException('Registration not found in this category');
    }

    // Check if already assigned to this group
    const existing = await this.prisma.categoryGroupRegistration.findFirst({
      where: { groupId, categoryRegistrationId },
    });
    if (existing) {
      throw new BadRequestException(
        'Registration is already assigned to this group'
      );
    }

    return this.prisma.categoryGroupRegistration.create({
      data: { groupId, categoryRegistrationId },
      include: {
        categoryRegistration: {
          include: {
            player: true,
            pair: {
              include: {
                members: {
                  include: { player: true },
                  orderBy: { position: 'asc' },
                },
              },
            },
          },
        },
      },
    });
  }

  async bulkAssignRegistrations(
    categoryId: string,
    groupId: string,
    categoryRegistrationIds: string[],
    userId: string,
    role?: string
  ) {
    await this.getCategoryWithOwnership(
      categoryId,
      userId,
      role,
      'PARTICIPANTS'
    );

    const group = await this.prisma.categoryGroup.findUnique({
      where: { id: groupId },
    });
    if (!group || group.categoryId !== categoryId) {
      throw new NotFoundException('Group not found in this category');
    }

    const results = await this.prisma.$transaction(async (tx) => {
      const created: Awaited<
        ReturnType<typeof tx.categoryGroupRegistration.create>
      >[] = [];
      for (const regId of categoryRegistrationIds) {
        const rec = await tx.categoryGroupRegistration.create({
          data: { groupId, categoryRegistrationId: regId },
          include: {
            categoryRegistration: {
              include: {
                player: true,
                pair: {
                  include: {
                    members: {
                      include: { player: true },
                      orderBy: { position: 'asc' as const },
                    },
                  },
                },
              },
            },
          },
        });
        created.push(rec);
      }
      return created;
    });

    return results;
  }

  async autoAssignRegistrations(
    categoryId: string,
    options: { shuffle?: boolean; strategy?: string },
    userId: string,
    role?: string
  ) {
    await this.getCategoryWithOwnership(
      categoryId,
      userId,
      role,
      'PARTICIPANTS'
    );

    const registrations = await this.prisma.categoryRegistration.findMany({
      where: { categoryId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    const groups = await this.prisma.categoryGroup.findMany({
      where: { categoryId },
      orderBy: { groupNumber: 'asc' },
    });

    if (groups.length === 0) {
      throw new BadRequestException('No groups exist. Create groups first.');
    }

    // Clear existing assignments
    await this.prisma.categoryGroupRegistration.deleteMany({
      where: { groupId: { in: groups.map((g) => g.id) } },
    });

    const regIds = registrations.map((r) => r.id);

    // Optional shuffle (Fisher-Yates)
    const shuffle = options.shuffle !== false; // default true
    if (shuffle) {
      for (let i = regIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [regIds[i], regIds[j]] = [regIds[j], regIds[i]];
      }
    }

    // Distribute using strategy
    const assignments: Record<string, string[]> = {};
    groups.forEach((g) => (assignments[g.id] = []));

    const strategy = options.strategy || 'round-robin';

    if (strategy === 'sequential' || strategy === 'balanced') {
      const base = Math.floor(regIds.length / groups.length);
      const remainder = regIds.length % groups.length;
      let idx = 0;
      groups.forEach((group, gi) => {
        const count = base + (gi < remainder ? 1 : 0);
        assignments[group.id] = regIds.slice(idx, idx + count);
        idx += count;
      });
    } else {
      // round-robin (default)
      regIds.forEach((regId, i) => {
        const group = groups[i % groups.length];
        assignments[group.id].push(regId);
      });
    }

    // Create all assignments in a transaction
    const allAssignments: {
      groupId: string;
      categoryRegistrationId: string;
    }[] = [];
    for (const [gId, regIdList] of Object.entries(assignments)) {
      for (const categoryRegistrationId of regIdList) {
        allAssignments.push({ groupId: gId, categoryRegistrationId });
      }
    }

    // Use interactive transaction for creation
    const results = await this.prisma.$transaction(async (tx) => {
      const created: Awaited<
        ReturnType<typeof tx.categoryGroupRegistration.create>
      >[] = [];
      for (const a of allAssignments) {
        const rec = await tx.categoryGroupRegistration.create({
          data: {
            groupId: a.groupId,
            categoryRegistrationId: a.categoryRegistrationId,
          },
          include: {
            categoryRegistration: {
              include: {
                player: true,
                pair: {
                  include: {
                    members: {
                      include: { player: true },
                      orderBy: { position: 'asc' as const },
                    },
                  },
                },
              },
            },
          },
        });
        created.push(rec);
      }
      return created;
    });

    // Group results by groupId
    const grouped: Record<string, typeof results> = {};
    for (const result of results) {
      const gId = result.groupId;
      if (!grouped[gId]) grouped[gId] = [];
      grouped[gId].push(result);
    }

    return grouped;
  }

  async removeRegistrationFromGroup(
    categoryId: string,
    groupId: string,
    registrationId: string,
    userId: string,
    role?: string
  ) {
    await this.getCategoryWithOwnership(
      categoryId,
      userId,
      role,
      'PARTICIPANTS'
    );

    const groupReg = await this.prisma.categoryGroupRegistration.findFirst({
      where: { groupId, categoryRegistrationId: registrationId },
    });
    if (!groupReg) {
      throw new NotFoundException('Registration not found in this group');
    }

    await this.prisma.categoryGroupRegistration.delete({
      where: { id: groupReg.id },
    });
    return { message: 'Registration removed from group successfully' };
  }

  // ─── Phase 6: Round Robin Match Generation ────────────────

  async generateGroupMatches(
    categoryId: string,
    groupId: string,
    userId: string,
    role?: string
  ) {
    const category = await this.getCategoryWithOwnership(
      categoryId,
      userId,
      role,
      'STRUCTURE'
    );

    const group = await this.prisma.categoryGroup.findUnique({
      where: { id: groupId },
    });
    if (!group || group.categoryId !== categoryId) {
      throw new NotFoundException('Group not found in this category');
    }

    // Check if matches already exist for this group
    const existingMatches = await this.prisma.categoryMatch.count({
      where: { groupId },
    });
    if (existingMatches > 0) {
      throw new BadRequestException(
        'Matches already exist for this group. Delete them first.'
      );
    }

    const groupRegs = await this.prisma.categoryGroupRegistration.findMany({
      where: { groupId },
      orderBy: { createdAt: 'asc' },
    });

    if (groupRegs.length < 2) {
      throw new BadRequestException(
        'At least 2 registrations are needed to generate matches'
      );
    }

    const regIds = groupRegs.map((gr) => gr.categoryRegistrationId);

    // Generate round-robin matches: n*(n-1)/2
    const matchPairs: { reg1: string; reg2: string; matchNumber: number }[] =
      [];
    let matchNumber = 1;

    for (let i = 0; i < regIds.length; i++) {
      for (let j = i + 1; j < regIds.length; j++) {
        matchPairs.push({
          reg1: regIds[i],
          reg2: regIds[j],
          matchNumber: matchNumber++,
        });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const created: Awaited<ReturnType<typeof tx.categoryMatch.create>>[] = [];
      for (const mp of matchPairs) {
        const match = await tx.categoryMatch.create({
          data: {
            categoryId,
            groupId,
            round: 'GROUP',
            matchNumber: mp.matchNumber,
            status: 'SCHEDULED',
            matchFormat: category.matchFormat,
            participants: {
              create: [
                { categoryRegistrationId: mp.reg1, position: 1 },
                { categoryRegistrationId: mp.reg2, position: 2 },
              ],
            },
          },
          include: {
            participants: {
              include: {
                categoryRegistration: {
                  include: {
                    player: true,
                    pair: {
                      include: {
                        members: {
                          include: { player: true },
                          orderBy: { position: 'asc' as const },
                        },
                      },
                    },
                  },
                },
              },
            },
            court: true,
          },
        });
        created.push(match);
      }
      return created;
    });
  }

  async getGroupMatches(categoryId: string, groupId: string) {
    const group = await this.prisma.categoryGroup.findUnique({
      where: { id: groupId },
    });
    if (!group || group.categoryId !== categoryId) {
      throw new NotFoundException('Group not found in this category');
    }

    return this.prisma.categoryMatch.findMany({
      where: { categoryId, groupId },
      include: {
        participants: {
          include: {
            categoryRegistration: {
              include: {
                player: true,
                pair: {
                  include: {
                    members: {
                      include: { player: true },
                      orderBy: { position: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
        court: true,
      },
      orderBy: { matchNumber: 'asc' },
    });
  }

  // ─── Existing: getMatches ─────────────────────────────────

  async getMatches(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) throw new NotFoundException('Category not found');

    return this.prisma.categoryMatch.findMany({
      where: { categoryId },
      include: {
        participants: {
          include: {
            categoryRegistration: {
              include: {
                player: true,
                pair: {
                  include: {
                    members: {
                      include: { player: true },
                      orderBy: { position: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
        court: true,
        group: true,
      },
      orderBy: { matchNumber: 'asc' },
    });
  }

  // ─── Phase 7: Category Match Lifecycle ────────────────────

  async createMatch(
    categoryId: string,
    dto: CreateCategoryMatchDto,
    userId: string,
    role?: string
  ) {
    await this.getCategoryWithOwnership(categoryId, userId, role, 'STRUCTURE');

    return this.prisma.categoryMatch.create({
      data: {
        categoryId,
        groupId: dto.groupId,
        round: dto.round,
        matchNumber: dto.matchNumber,
        matchCode: dto.matchCode,
        status: 'SCHEDULED',
        courtId: dto.courtId,
        startTime: dto.startTime ? new Date(dto.startTime) : undefined,
        matchFormat: dto.matchFormat as MatchFormat | undefined,
        participants: {
          create: dto.participants.map((p) => ({
            categoryRegistrationId: p.categoryRegistrationId,
            position: p.position,
          })),
        },
      },
      include: {
        participants: {
          include: {
            categoryRegistration: {
              include: {
                player: true,
                pair: {
                  include: {
                    members: {
                      include: { player: true },
                      orderBy: { position: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
        court: true,
      },
    });
  }

  async getMatchById(id: string) {
    const match = await this.prisma.categoryMatch.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            categoryRegistration: {
              include: {
                player: true,
                pair: {
                  include: {
                    members: {
                      include: { player: true },
                      orderBy: { position: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
        court: true,
        group: true,
        category: true,
      },
    });
    if (!match) throw new NotFoundException('Match not found');
    return match;
  }

  async updateMatch(
    id: string,
    data: {
      courtId?: string;
      round?: string;
      matchNumber?: number;
      matchCode?: string;
      startTime?: string;
      matchFormat?: string;
      groupId?: string;
    },
    userId: string,
    role?: string
  ) {
    await this.getMatchWithOwnership(id, userId, role, 'SCHEDULE');

    return this.prisma.categoryMatch.update({
      where: { id },
      data: {
        ...(data.courtId !== undefined && { courtId: data.courtId }),
        ...(data.round !== undefined && { round: data.round }),
        ...(data.matchNumber !== undefined && {
          matchNumber: data.matchNumber,
        }),
        ...(data.matchCode !== undefined && { matchCode: data.matchCode }),
        ...(data.startTime !== undefined && {
          startTime: new Date(data.startTime),
        }),
        ...(data.matchFormat !== undefined && {
          matchFormat: data.matchFormat as MatchFormat,
        }),
        ...(data.groupId !== undefined && { groupId: data.groupId }),
      },
      include: {
        participants: {
          include: {
            categoryRegistration: {
              include: {
                player: true,
                pair: {
                  include: {
                    members: {
                      include: { player: true },
                      orderBy: { position: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
        court: true,
        group: true,
      },
    });
  }

  async deleteMatch(id: string, userId: string, role?: string) {
    await this.getMatchWithOwnership(id, userId, role, 'STRUCTURE');
    await this.prisma.categoryMatch.delete({ where: { id } });
    return { message: 'Match deleted successfully' };
  }

  async startMatch(id: string, userId: string, role?: string) {
    const match = await this.getMatchForScoring(id, userId, role);

    if (match.status !== 'SCHEDULED') {
      throw new BadRequestException(
        'Match can only be started from SCHEDULED status'
      );
    }

    this.assertMatchParticipantsResolved(match);
    await this.assertMatchRostersReady(match.participants);

    // Pickleball doubles opens at 0-0-2: side 1 serving, second server.
    // Everything else (badminton, pickleball singles) carries no serve state.
    const pickleballDoubles = this.isPickleballDoubles(match);

    const updated = await this.prisma.categoryMatch.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        startTime: new Date(),
        servingSide: pickleballDoubles ? 1 : null,
        serverNumber: pickleballDoubles ? 2 : null,
      },
      include: MATCH_SCORING_INCLUDE,
    });
    this.broadcastMatch(updated, TournamentEventType.TOURNAMENT_MATCH_STARTED);
    return updated;
  }

  async endMatch(
    id: string,
    dto: EndCategoryMatchDto,
    userId: string,
    role?: string
  ) {
    const match = await this.getMatchForScoring(id, userId, role);

    // Allow recording a result directly from SCHEDULED (host manual entry) or
    // from IN_PROGRESS (live scoring). A finished match cannot be re-ended.
    if (match.status !== 'IN_PROGRESS' && match.status !== 'SCHEDULED') {
      throw new BadRequestException(
        'Match can only be ended from SCHEDULED or IN_PROGRESS status'
      );
    }

    this.assertMatchParticipantsResolved(match);
    await this.assertMatchRostersReady(match.participants);

    // Auto-calculate total scores from sets if provided
    let { player1Score, player2Score, player3Score, player4Score } = dto;
    if (dto.sets && dto.sets.length > 0 && player1Score === undefined) {
      player1Score = dto.sets.reduce((sum, s) => sum + s.player1Score, 0);
      player2Score = dto.sets.reduce((sum, s) => sum + s.player2Score, 0);
      if (dto.sets.some((s) => s.player3Score !== undefined)) {
        player3Score = dto.sets.reduce(
          (sum, s) => sum + (s.player3Score || 0),
          0
        );
        player4Score = dto.sets.reduce(
          (sum, s) => sum + (s.player4Score || 0),
          0
        );
      }
    }

    const updatedMatch = await this.prisma.categoryMatch.update({
      where: { id },
      data: {
        status: 'FINISHED',
        startTime: match.startTime ?? new Date(),
        endTime: new Date(),
        score: dto.score,
        sets: dto.sets
          ? (JSON.parse(JSON.stringify(dto.sets)) as Prisma.InputJsonValue)
          : undefined,
        winnerId: dto.winnerId,
        isDraw: dto.isDraw || false,
        isForfeit: dto.isForfeit || false,
        player1Score,
        player2Score,
        player3Score,
        player4Score,
        player1Points: dto.player1Points,
        player2Points: dto.player2Points,
        notes: dto.notes,
        refereeName: dto.refereeName ?? null,
        // Serve state only applies to live matches.
        servingSide: null,
        serverNumber: null,
      },
      include: MATCH_SCORING_INCLUDE,
    });

    // Auto-advance winner in elimination rounds
    if (updatedMatch.round !== 'GROUP' && dto.winnerId && !dto.isDraw) {
      const category = await this.prisma.category.findUnique({
        where: { id: updatedMatch.categoryId },
        select: { format: true },
      });
      if (category?.format === CategoryFormat.DOUBLE_ELIMINATION) {
        await this.advanceDoubleElimination({
          id: updatedMatch.id,
          categoryId: updatedMatch.categoryId,
          round: updatedMatch.round,
          winnerId: updatedMatch.winnerId,
          winnerNextMatchId: updatedMatch.winnerNextMatchId,
          winnerNextSlot: updatedMatch.winnerNextSlot,
          loserNextMatchId: updatedMatch.loserNextMatchId,
          loserNextSlot: updatedMatch.loserNextSlot,
          participants: updatedMatch.participants.map((participant) => ({
            categoryRegistrationId: participant.categoryRegistrationId,
            position: participant.position,
          })),
        });
      } else {
        await this.advanceWinner({
          id: updatedMatch.id,
          categoryId: updatedMatch.categoryId,
          round: updatedMatch.round,
          matchNumber: updatedMatch.matchNumber,
          winnerId: updatedMatch.winnerId,
          participants: updatedMatch.participants.map((participant) => ({
            categoryRegistrationId: participant.categoryRegistrationId,
            position: participant.position,
          })),
        });
      }
    }

    this.broadcastMatch(
      updatedMatch,
      TournamentEventType.TOURNAMENT_MATCH_ENDED
    );
    return updatedMatch;
  }

  /**
   * Reset a match back to its initial (not-yet-played) state. Clears the result
   * (status → SCHEDULED, scores/sets/winner/forfeit), the live-scoring scratch
   * state (pointLog), and timing. For finished elimination matches we also undo
   * the auto-advancement so the downstream bracket doesn't keep a participant
   * that no longer has a result feeding it.
   */
  async resetMatchResult(id: string, userId: string, role?: string) {
    const match = await this.getMatchForScoring(id, userId, role);

    if (
      match.status === 'FINISHED' &&
      match.round !== 'GROUP' &&
      match.winnerId
    ) {
      const category = await this.prisma.category.findUnique({
        where: { id: match.categoryId },
        select: { format: true },
      });
      if (category?.format === CategoryFormat.DOUBLE_ELIMINATION) {
        await this.removeAdvancedDoubleElimination({
          id: match.id,
          categoryId: match.categoryId,
          round: match.round,
          winnerId: match.winnerId,
          winnerNextMatchId: match.winnerNextMatchId,
          winnerNextSlot: match.winnerNextSlot,
          loserNextMatchId: match.loserNextMatchId,
          loserNextSlot: match.loserNextSlot,
          participants: match.participants.map((participant) => ({
            categoryRegistrationId: participant.categoryRegistrationId,
            position: participant.position,
          })),
        });
      } else {
        await this.removeAdvancedWinner({
          id: match.id,
          categoryId: match.categoryId,
          round: match.round,
          winnerId: match.winnerId,
          participants: match.participants.map((participant) => ({
            categoryRegistrationId: participant.categoryRegistrationId,
            position: participant.position,
          })),
        });
      }
    }

    const updated = await this.prisma.categoryMatch.update({
      where: { id },
      data: {
        status: 'SCHEDULED',
        startTime: null,
        endTime: null,
        score: null,
        sets: Prisma.DbNull,
        winnerId: null,
        isDraw: false,
        isForfeit: false,
        player1Score: null,
        player2Score: null,
        player3Score: null,
        player4Score: null,
        player1Points: null,
        player2Points: null,
        pointLog: Prisma.DbNull,
        notes: null,
        refereeName: null,
        servingSide: null,
        serverNumber: null,
      },
      include: MATCH_SCORING_INCLUDE,
    });

    this.broadcastMatch(updated, TournamentEventType.TOURNAMENT_MATCH_ENDED);
    return updated;
  }

  /**
   * Reverse {@link advanceWinner}: remove the participant this match's winner
   * (and, for SF, its loser) placed into the next round / 3RD-place match.
   * Only removes from downstream matches that have not themselves started, so
   * an in-progress or finished later round is never corrupted.
   */
  private async removeAdvancedWinner(match: {
    id: string;
    categoryId: string;
    round: string;
    winnerId: string | null;
    participants: Array<{ categoryRegistrationId: string; position: number }>;
  }) {
    if (!match.winnerId) return;

    const roundMatches = await this.prisma.categoryMatch.findMany({
      where: {
        categoryId: match.categoryId,
        round: match.round,
        groupId: null,
      },
      orderBy: { matchNumber: 'asc' },
    });

    const matchIndex = roundMatches.findIndex((m) => m.id === match.id);
    if (matchIndex === -1) return;

    const roundOrder = this.getRoundOrder();
    const currentRoundIdx = roundOrder.indexOf(match.round);
    if (currentRoundIdx === -1 || currentRoundIdx >= roundOrder.length - 1) {
      return;
    }

    const nextRound = roundOrder[currentRoundIdx + 1];
    const nextRoundMatches = await this.prisma.categoryMatch.findMany({
      where: {
        categoryId: match.categoryId,
        round: nextRound,
        groupId: null,
      },
      orderBy: { matchNumber: 'asc' },
    });

    const nextMatchIndex = Math.floor(matchIndex / 2);
    const nextMatch = nextRoundMatches[nextMatchIndex];
    if (nextMatch && nextMatch.status === 'SCHEDULED') {
      const position = (matchIndex % 2) + 1;
      await this.prisma.categoryMatchParticipant.deleteMany({
        where: {
          matchId: nextMatch.id,
          position,
          categoryRegistrationId: match.winnerId,
        },
      });
    }

    // SF loser was placed into the 3RD-place match — undo that too.
    if (match.round === 'SF') {
      const thirdPlaceMatches = await this.prisma.categoryMatch.findMany({
        where: { categoryId: match.categoryId, round: '3RD', groupId: null },
        orderBy: { matchNumber: 'asc' },
      });
      const thirdPlaceMatch = thirdPlaceMatches[0];
      if (thirdPlaceMatch && thirdPlaceMatch.status === 'SCHEDULED') {
        const loser = match.participants.find(
          (p) => p.categoryRegistrationId !== match.winnerId
        );
        if (loser) {
          const loserPosition = (matchIndex % 2) + 1;
          await this.prisma.categoryMatchParticipant.deleteMany({
            where: {
              matchId: thirdPlaceMatch.id,
              position: loserPosition,
              categoryRegistrationId: loser.categoryRegistrationId,
            },
          });
        }
      }
    }
  }

  private async advanceWinner(match: {
    id: string;
    categoryId: string;
    round: string;
    matchNumber: number;
    winnerId: string | null;
    participants: Array<{ categoryRegistrationId: string; position: number }>;
  }) {
    if (!match.winnerId) return;

    // Get all matches in the same round to determine match index
    const roundMatches = await this.prisma.categoryMatch.findMany({
      where: {
        categoryId: match.categoryId,
        round: match.round,
        groupId: null, // elimination matches have no group
      },
      orderBy: { matchNumber: 'asc' },
    });

    const matchIndex = roundMatches.findIndex((m) => m.id === match.id);
    if (matchIndex === -1) return;

    // Determine next round
    const roundOrder = this.getRoundOrder();
    const currentRoundIdx = roundOrder.indexOf(match.round);
    if (currentRoundIdx === -1 || currentRoundIdx >= roundOrder.length - 1)
      return;

    const nextRound = roundOrder[currentRoundIdx + 1];

    // Find the next round match
    const nextRoundMatches = await this.prisma.categoryMatch.findMany({
      where: {
        categoryId: match.categoryId,
        round: nextRound,
        groupId: null,
      },
      orderBy: { matchNumber: 'asc' },
    });

    const nextMatchIndex = Math.floor(matchIndex / 2);
    if (nextMatchIndex >= nextRoundMatches.length) return;

    const nextMatch = nextRoundMatches[nextMatchIndex];
    const position = (matchIndex % 2) + 1; // 1 or 2

    // Check if participant already exists
    const existingParticipant =
      await this.prisma.categoryMatchParticipant.findFirst({
        where: { matchId: nextMatch.id, position },
      });

    if (!existingParticipant) {
      await this.prisma.categoryMatchParticipant.create({
        data: {
          matchId: nextMatch.id,
          categoryRegistrationId: match.winnerId,
          position,
        },
      });
    }

    // SF loser → 3RD place match
    if (match.round === 'SF') {
      const category = await this.prisma.category.findUnique({
        where: { id: match.categoryId },
      });
      if (category?.thirdPlaceMatch) {
        const thirdPlaceMatches = await this.prisma.categoryMatch.findMany({
          where: { categoryId: match.categoryId, round: '3RD', groupId: null },
          orderBy: { matchNumber: 'asc' },
        });
        if (thirdPlaceMatches.length > 0) {
          const loser = match.participants.find(
            (p) => p.categoryRegistrationId !== match.winnerId
          );
          if (loser) {
            const loserPosition = (matchIndex % 2) + 1;
            const existing =
              await this.prisma.categoryMatchParticipant.findFirst({
                where: {
                  matchId: thirdPlaceMatches[0].id,
                  position: loserPosition,
                },
              });
            if (!existing) {
              await this.prisma.categoryMatchParticipant.create({
                data: {
                  matchId: thirdPlaceMatches[0].id,
                  categoryRegistrationId: loser.categoryRegistrationId,
                  position: loserPosition,
                },
              });
            }
          }
        }
      }
    }
  }

  private getRoundOrder(): string[] {
    return ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'];
  }

  // ─── Phase 8: Standings Calculation ───────────────────────

  async getGroupStandings(categoryId: string, groupId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) throw new NotFoundException('Category not found');

    const group = await this.prisma.categoryGroup.findUnique({
      where: { id: groupId },
    });
    if (!group || group.categoryId !== categoryId) {
      throw new NotFoundException('Group not found in this category');
    }

    // Point values + tiebreaker config (supports both RR and RR→SE configs).
    const standingsConfig = resolveStandingsConfig(
      category.formatConfig as Record<string, unknown> | null
    );

    // Ordered by createdAt so the deterministic seed (entrant index) is stable.
    const groupRegs = await this.prisma.categoryGroupRegistration.findMany({
      where: { groupId },
      orderBy: { createdAt: 'asc' },
      include: {
        categoryRegistration: {
          include: {
            player: true,
            pair: {
              include: {
                members: {
                  include: { player: true },
                  orderBy: { position: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    // Cancelled matches are pulled in too so cancelledMatchPoints can apply.
    const settledMatches = await this.prisma.categoryMatch.findMany({
      where: { groupId, status: { in: ['FINISHED', 'CANCELLED'] } },
      include: { participants: true },
    });

    const matchInputs: StandingsMatchInput[] = settledMatches.map((m) => ({
      participants: m.participants.map((p) => ({
        categoryRegistrationId: p.categoryRegistrationId,
        position: p.position,
      })),
      player1Score: m.player1Score,
      player2Score: m.player2Score,
      player1Points: m.player1Points,
      player2Points: m.player2Points,
      sets: Array.isArray(m.sets)
        ? (m.sets as Array<{ player1Score?: number; player2Score?: number }>)
        : null,
      winnerId: m.winnerId,
      isDraw: m.isDraw,
      isForfeit: m.isForfeit,
      isCancelled: m.status === 'CANCELLED',
    }));

    const rows = computeStandings(
      groupRegs.map((gr) => ({
        categoryRegistrationId: gr.categoryRegistrationId,
      })),
      matchInputs,
      standingsConfig
    );

    // Re-attach the registration objects expected by the API response.
    const registrationById = new Map(
      groupRegs.map((gr) => [
        gr.categoryRegistrationId,
        gr.categoryRegistration,
      ])
    );
    const standings = rows.map((row) => ({
      ...row,
      registration: registrationById.get(row.categoryRegistrationId) ?? null,
    }));

    return { group, standings };
  }

  async calculateGroupStandings(
    categoryId: string,
    groupId: string,
    userId: string,
    role?: string
  ) {
    await this.getCategoryWithOwnership(categoryId, userId, role, 'RESULTS');
    return this.getGroupStandings(categoryId, groupId);
  }

  async getGroupWinners(categoryId: string, groupId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) throw new NotFoundException('Category not found');

    const { standings } = await this.getGroupStandings(categoryId, groupId);
    const winnersCount = category.winnersPerGroup || 2;

    return standings.slice(0, winnersCount);
  }

  async getStandings(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        groups: { orderBy: { groupNumber: 'asc' } },
      },
    });
    if (!category) throw new NotFoundException('Category not found');

    const results = await Promise.all(
      category.groups.map((group) =>
        this.getGroupStandings(categoryId, group.id)
      )
    );

    return results;
  }

  // ─── Bulk Group Match Generation ─────────────────────────

  async generateAllGroupMatches(
    categoryId: string,
    userId: string,
    role?: string
  ) {
    await this.getCategoryWithOwnership(categoryId, userId, role, 'STRUCTURE');

    const groups = await this.prisma.categoryGroup.findMany({
      where: { categoryId },
      orderBy: { groupNumber: 'asc' },
    });

    if (groups.length === 0) {
      throw new BadRequestException('No groups exist. Create groups first.');
    }

    // Re-generating must start from a clean slate: wipe ALL previously-generated
    // matches for this category (group stage + playoff shells), so stale matches
    // from an earlier configuration never linger. Cascades to participants and
    // nulls any court's currentMatch reference. Without this, leftover playoff
    // shells (groupId: null) survive the group deletion done client-side and
    // ensureEliminationShells would skip recreating them (idempotent guard).
    await this.prisma.categoryMatch.deleteMany({ where: { categoryId } });

    const results: Array<{ group: (typeof groups)[0]; matches: unknown[] }> =
      [];
    for (const group of groups) {
      const matches = await this.generateGroupMatches(
        categoryId,
        group.id,
        userId,
        role
      );
      results.push({ group, matches });
    }

    // Pre-create the playoff bracket as empty shells so it can be scheduled and
    // displayed (with seed/feeder labels) before the group stage finishes.
    await this.ensureEliminationShells(categoryId);

    return results;
  }

  // ─── Elimination Matches Query ──────────────────────────

  async getEliminationMatches(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) throw new NotFoundException('Category not found');

    return this.prisma.categoryMatch.findMany({
      where: { categoryId, groupId: null, round: { not: 'GROUP' } },
      include: {
        participants: {
          include: {
            categoryRegistration: {
              include: {
                player: true,
                pair: {
                  include: {
                    members: {
                      include: { player: true },
                      orderBy: { position: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
        court: true,
      },
      orderBy: { matchNumber: 'asc' },
    });
  }

  // ─── Phase 9: Elimination Bracket ─────────────────────────

  async getGroupStageCompletion(
    categoryId: string,
    userId: string,
    role?: string
  ) {
    const category = await this.getCategoryWithOwnership(
      categoryId,
      userId,
      role,
      'STRUCTURE'
    );

    const isRoundRobinToElimination =
      category.format === CategoryFormat.ROUND_ROBIN_TO_SE &&
      category.hasGroupStage;

    if (!isRoundRobinToElimination) {
      return {
        categoryId,
        categoryName: category.name,
        isEligible: false,
        isCompleted: false,
        canGenerateBracket: false,
        hasBracket: false,
        totalGroupMatches: 0,
        finishedGroupMatches: 0,
        unfinishedGroupMatches: 0,
      };
    }

    const [
      totalGroupMatches,
      finishedGroupMatches,
      eliminationMatchCount,
      eliminationParticipantCount,
    ] = await Promise.all([
      this.prisma.categoryMatch.count({
        where: { categoryId, round: 'GROUP' },
      }),
      this.prisma.categoryMatch.count({
        where: { categoryId, round: 'GROUP', status: 'FINISHED' },
      }),
      this.prisma.categoryMatch.count({
        where: {
          categoryId,
          round: { not: 'GROUP' },
        },
      }),
      this.prisma.categoryMatchParticipant.count({
        where: {
          match: {
            categoryId,
            round: { not: 'GROUP' },
          },
        },
      }),
    ]);

    const isCompleted =
      totalGroupMatches > 0 && finishedGroupMatches === totalGroupMatches;
    const hasBracket = eliminationMatchCount > 0;
    const hasGeneratedBracket = eliminationParticipantCount > 0;

    return {
      categoryId,
      categoryName: category.name,
      isEligible: true,
      isCompleted,
      canGenerateBracket: isCompleted && !hasGeneratedBracket,
      hasBracket,
      totalGroupMatches,
      finishedGroupMatches,
      unfinishedGroupMatches: totalGroupMatches - finishedGroupMatches,
    };
  }

  async completeGroupStage(categoryId: string, userId: string, role?: string) {
    const category = await this.getCategoryWithOwnership(
      categoryId,
      userId,
      role,
      'STRUCTURE'
    );

    if (category.hasGroupStage) {
      // Validate all group matches are finished
      const unfinishedMatches = await this.prisma.categoryMatch.count({
        where: {
          categoryId,
          round: 'GROUP',
          status: { not: 'FINISHED' },
        },
      });

      if (unfinishedMatches > 0) {
        throw new BadRequestException(
          `${unfinishedMatches} group match(es) are not finished yet`
        );
      }

      // Collect winners from all groups
      const groups = await this.prisma.categoryGroup.findMany({
        where: { categoryId },
        orderBy: { groupNumber: 'asc' },
      });

      const winnersPerGroup = category.winnersPerGroup || 2;
      const allWinners: string[] = [];

      // Interleave winners: all #1s first, then all #2s, etc.
      for (let rank = 0; rank < winnersPerGroup; rank++) {
        for (const group of groups) {
          const { standings } = await this.getGroupStandings(
            categoryId,
            group.id
          );
          if (standings[rank]) {
            allWinners.push(standings[rank].categoryRegistrationId);
          }
        }
      }

      if (allWinners.length < 2) {
        throw new BadRequestException(
          'Not enough winners to generate elimination bracket'
        );
      }

      // Fill the pre-created shells (preserving any assigned court/time). Fall
      // back to a full regen when shells are absent or no longer match.
      const filled = await this.fillEliminationBracket(categoryId, allWinners);
      if (filled) return this.getEliminationMatches(categoryId);
      return this.generateEliminationBracket(categoryId, allWinners);
    } else {
      // Direct elimination from all registrations
      const registrations = await this.prisma.categoryRegistration.findMany({
        where: { categoryId },
        orderBy: { createdAt: 'asc' },
      });

      if (registrations.length < 2) {
        throw new BadRequestException('At least 2 registrations are needed');
      }

      if (category.format === CategoryFormat.DOUBLE_ELIMINATION) {
        return this.generateDoubleEliminationBracket(
          categoryId,
          registrations.map((r) => r.id)
        );
      }

      return this.generateEliminationBracket(
        categoryId,
        registrations.map((r) => r.id)
      );
    }
  }

  private async generateEliminationBracket(
    categoryId: string,
    registrationIds: string[]
  ) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    const n = registrationIds.length;
    const bracketSize = this.nextPowerOf2(n);
    const totalRounds = Math.log2(bracketSize);

    // Use elimination-specific match format if configured, otherwise fall back to category default
    const bracketMatchFormat =
      category?.eliminationMatchFormat ?? category?.matchFormat;

    // Optional per-round overrides stored in formatConfig.roundFormats, keyed by
    // round label (F, SF, QF, R16, ..., 3RD). Falls back to bracketMatchFormat.
    const VALID_MATCH_FORMATS = new Set([
      'BEST_OF_1',
      'BEST_OF_3',
      'BEST_OF_5',
    ]);
    const formatConfig = category?.formatConfig as {
      roundFormats?: Record<string, string>;
    } | null;
    const roundFormats = formatConfig?.roundFormats ?? {};
    const formatForRound = (round: string): MatchFormat => {
      const override = roundFormats[round];
      const value =
        override && VALID_MATCH_FORMATS.has(override)
          ? override
          : bracketMatchFormat;
      return value as MatchFormat;
    };

    // Standard seeding to separate top seeds
    const seedOrder = this.generateStandardSeeding(bracketSize);

    // Place registrations into seeded slots (null = BYE).
    // seedOrder[pos] is the seed (1-based) that belongs at bracket position
    // `pos`, so the registration carrying that seed is placed there. This
    // spreads the top seeds across the bracket — e.g. group winners collected
    // as [1st A, 1st B, 2nd A, 2nd B] produce the cross-pool matchups
    // (1st A vs 2nd B) and (1st B vs 2nd A) instead of same-pool ones.
    const slots: (string | null)[] = (
      new Array(bracketSize) as (string | null)[]
    ).fill(null);
    for (let pos = 0; pos < bracketSize; pos++) {
      const seed = seedOrder[pos];
      slots[pos] = seed <= n ? registrationIds[seed - 1] : null;
    }

    // Determine round names
    const roundNames = this.determineRoundNames(totalRounds);

    // Delete any existing elimination matches
    await this.prisma.categoryMatch.deleteMany({
      where: { categoryId, groupId: null, round: { not: 'GROUP' } },
    });

    let globalMatchNumber =
      (await this.prisma.categoryMatch.count({ where: { categoryId } })) + 1;

    type BracketMatch = Awaited<
      ReturnType<typeof this.prisma.categoryMatch.create>
    >;
    const allCreatedMatches: BracketMatch[] = [];

    // Generate first round matches
    const firstRoundMatchCount = bracketSize / 2;
    const byeAdvances: { registrationId: string; matchIndex: number }[] = [];

    for (let i = 0; i < firstRoundMatchCount; i++) {
      const slot1 = slots[i * 2];
      const slot2 = slots[i * 2 + 1];

      if (slot1 && slot2) {
        // Real match
        const match = await this.prisma.categoryMatch.create({
          data: {
            categoryId,
            round: roundNames[0],
            matchNumber: globalMatchNumber++,
            status: 'SCHEDULED',
            matchFormat: formatForRound(roundNames[0]),
            participants: {
              create: [
                { categoryRegistrationId: slot1, position: 1 },
                { categoryRegistrationId: slot2, position: 2 },
              ],
            },
          },
          include: { participants: true, court: true },
        });
        allCreatedMatches.push(match);
      } else if (slot1 || slot2) {
        // BYE: create match marked as finished, winner advances
        const realPlayer = (slot1 || slot2)!;
        const match = await this.prisma.categoryMatch.create({
          data: {
            categoryId,
            round: roundNames[0],
            matchNumber: globalMatchNumber++,
            status: 'FINISHED',
            matchFormat: formatForRound(roundNames[0]),
            winnerId: realPlayer,
            score: 'BYE',
            participants: {
              create: [{ categoryRegistrationId: realPlayer, position: 1 }],
            },
          },
          include: { participants: true, court: true },
        });
        allCreatedMatches.push(match);
        byeAdvances.push({ registrationId: realPlayer, matchIndex: i });
      }
      // If both null (shouldn't happen with proper seeding), skip
    }

    // Generate subsequent round placeholder matches
    for (let round = 1; round < totalRounds; round++) {
      const matchesInRound = bracketSize / Math.pow(2, round + 1);
      for (let i = 0; i < matchesInRound; i++) {
        const match = await this.prisma.categoryMatch.create({
          data: {
            categoryId,
            round: roundNames[round],
            matchNumber: globalMatchNumber++,
            status: 'SCHEDULED',
            matchFormat: formatForRound(roundNames[round]),
          },
          include: { participants: true, court: true },
        });
        allCreatedMatches.push(match);
      }
    }

    // Generate 3rd place match if configured and bracket has at least SF
    if (category?.thirdPlaceMatch && totalRounds >= 2) {
      const thirdPlaceMatch = await this.prisma.categoryMatch.create({
        data: {
          categoryId,
          round: '3RD',
          matchNumber: globalMatchNumber++,
          status: 'SCHEDULED',
          matchFormat: formatForRound('3RD'),
        },
        include: { participants: true, court: true },
      });
      allCreatedMatches.push(thirdPlaceMatch);
    }

    // Advance BYE winners to their next round matches
    if (byeAdvances.length > 0 && totalRounds > 1) {
      const secondRoundMatches = allCreatedMatches.filter(
        (m) => m.round === roundNames[1]
      );

      for (const bye of byeAdvances) {
        const nextMatchIndex = Math.floor(bye.matchIndex / 2);
        if (nextMatchIndex < secondRoundMatches.length) {
          const position = (bye.matchIndex % 2) + 1;
          await this.prisma.categoryMatchParticipant.create({
            data: {
              matchId: secondRoundMatches[nextMatchIndex].id,
              categoryRegistrationId: bye.registrationId,
              position,
            },
          });
        }
      }
    }

    return allCreatedMatches;
  }

  // ─── Double Elimination Bracket ───────────────────────────

  /**
   * Generate a full double-elimination bracket: an upper (winners) bracket
   * identical to single-elim, a lower (losers) bracket that catches every
   * upper-bracket loser, and a grand final. When the category is configured as
   * a "true" double elimination, a bracket-reset match (GF2) is also created so
   * the lower-bracket champion must beat the upper-bracket champion twice.
   *
   * Routing is stored explicitly on every match via winnerNextMatchId/Slot and
   * loserNextMatchId/Slot so advancement never relies on positional index math
   * (which only works for a single bracket). The grand-final reset is resolved
   * dynamically in {@link advanceDoubleElimination}.
   */
  private async generateDoubleEliminationBracket(
    categoryId: string,
    registrationIds: string[]
  ) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    const n = registrationIds.length;
    const bracketSize = this.nextPowerOf2(n);
    const upperRounds = Math.log2(bracketSize); // R
    const formatForRound = this.buildFormatForRound(category);

    const fc = category?.formatConfig as {
      doubleElimination?: { isTrueDoubleElimination?: boolean };
    } | null;
    const isReset = fc?.doubleElimination?.isTrueDoubleElimination === true;

    // Seed registrations into the upper-bracket first-round slots (null = BYE).
    const seedOrder = this.generateStandardSeeding(bracketSize);
    const slots: (string | null)[] = (
      new Array(bracketSize) as (string | null)[]
    ).fill(null);
    for (let pos = 0; pos < bracketSize; pos++) {
      const seed = seedOrder[pos];
      slots[pos] = seed <= n ? registrationIds[seed - 1] : null;
    }

    // Wipe any previously generated elimination matches for this category.
    await this.prisma.categoryMatch.deleteMany({
      where: { categoryId, groupId: null, round: { not: 'GROUP' } },
    });

    let globalMatchNumber =
      (await this.prisma.categoryMatch.count({ where: { categoryId } })) + 1;

    type BracketMatch = Awaited<
      ReturnType<typeof this.prisma.categoryMatch.create>
    >;

    // Upper-bracket round labels (UB-QF / UB-SF / UB-F, etc).
    const ubNames = this.determineRoundNames(upperRounds).map((s) => `UB-${s}`);

    // Create the upper bracket: round 0 carries the seeded participants /
    // BYEs, later rounds are empty shells.
    const ub: BracketMatch[][] = [];
    for (let r = 0; r < upperRounds; r++) {
      const matchesInRound = bracketSize / Math.pow(2, r + 1);
      const roundMatches: BracketMatch[] = [];
      for (let i = 0; i < matchesInRound; i++) {
        let data: Prisma.CategoryMatchCreateInput = {
          category: { connect: { id: categoryId } },
          round: ubNames[r],
          matchNumber: globalMatchNumber++,
          status: 'SCHEDULED',
          bracketType: 'UPPER',
          matchFormat: formatForRound(ubNames[r]),
        };
        if (r === 0) {
          const slot1 = slots[i * 2];
          const slot2 = slots[i * 2 + 1];
          if (slot1 && slot2) {
            data = {
              ...data,
              participants: {
                create: [
                  { categoryRegistrationId: slot1, position: 1 },
                  { categoryRegistrationId: slot2, position: 2 },
                ],
              },
            };
          } else if (slot1 || slot2) {
            const realPlayer = (slot1 || slot2)!;
            data = {
              ...data,
              status: 'FINISHED',
              winnerId: realPlayer,
              score: 'BYE',
              participants: {
                create: [{ categoryRegistrationId: realPlayer, position: 1 }],
              },
            };
          }
        }
        const match = await this.prisma.categoryMatch.create({
          data,
          include: { participants: true, court: true },
        });
        roundMatches.push(match);
      }
      ub.push(roundMatches);
    }

    // Lower bracket: 2R-2 rounds. Match counts follow the canonical pattern —
    // round 0 pairs the first-round upper losers, "drop" (odd) rounds mix the
    // previous lower winners with the next batch of upper losers, and "minor"
    // (even) rounds halve via internal pairing.
    const lbRoundCount = Math.max(0, 2 * upperRounds - 2);
    const lbCounts: number[] = [];
    for (let k = 0; k < lbRoundCount; k++) {
      if (k === 0) lbCounts.push(bracketSize / 4);
      else if (k % 2 === 1) lbCounts.push(lbCounts[k - 1]);
      else lbCounts.push(lbCounts[k - 1] / 2);
    }
    const lb: BracketMatch[][] = [];
    for (let k = 0; k < lbRoundCount; k++) {
      const roundMatches: BracketMatch[] = [];
      const label = k === lbRoundCount - 1 ? 'LB-F' : `LB-${k + 1}`;
      for (let i = 0; i < lbCounts[k]; i++) {
        const match = await this.prisma.categoryMatch.create({
          data: {
            category: { connect: { id: categoryId } },
            round: label,
            matchNumber: globalMatchNumber++,
            status: 'SCHEDULED',
            bracketType: 'LOWER',
            matchFormat: formatForRound(label),
          },
          include: { participants: true, court: true },
        });
        roundMatches.push(match);
      }
      lb.push(roundMatches);
    }

    // Grand final (+ optional reset shell).
    const grandFinal = await this.prisma.categoryMatch.create({
      data: {
        category: { connect: { id: categoryId } },
        round: 'GF',
        matchNumber: globalMatchNumber++,
        status: 'SCHEDULED',
        bracketType: 'GF',
        matchFormat: formatForRound('GF'),
      },
      include: { participants: true, court: true },
    });
    let grandFinalReset: BracketMatch | null = null;
    if (isReset) {
      grandFinalReset = await this.prisma.categoryMatch.create({
        data: {
          category: { connect: { id: categoryId } },
          round: 'GF2',
          matchNumber: globalMatchNumber++,
          status: 'SCHEDULED',
          bracketType: 'GF',
          matchFormat: formatForRound('GF2'),
        },
        include: { participants: true, court: true },
      });
    }

    // ─── Wire up routing (winner/loser → next match + slot) ───
    const link = (
      matchId: string,
      data: {
        winnerNextMatchId?: string;
        winnerNextSlot?: number;
        loserNextMatchId?: string;
        loserNextSlot?: number;
      }
    ) => this.prisma.categoryMatch.update({ where: { id: matchId }, data });

    // Upper bracket winner/loser routing.
    for (let r = 0; r < upperRounds; r++) {
      for (let i = 0; i < ub[r].length; i++) {
        const isUpperFinal = r === upperRounds - 1;
        // Winner destination.
        const winnerNextMatchId = isUpperFinal
          ? grandFinal.id
          : ub[r + 1][Math.floor(i / 2)].id;
        const winnerNextSlot = isUpperFinal ? 1 : (i % 2) + 1;
        // Loser destination in the lower bracket.
        let loserNextMatchId: string | undefined;
        let loserNextSlot: number | undefined;
        if (lbRoundCount > 0) {
          if (r === 0) {
            // First-round losers pair up into LB round 0.
            loserNextMatchId = lb[0][Math.floor(i / 2)].id;
            loserNextSlot = (i % 2) + 1;
          } else {
            // Round m losers drop into LB drop-round (2m-1), slot 2.
            const lbRound = 2 * r - 1;
            loserNextMatchId = lb[lbRound][i].id;
            loserNextSlot = 2;
          }
        }
        await link(ub[r][i].id, {
          winnerNextMatchId,
          winnerNextSlot,
          loserNextMatchId,
          loserNextSlot,
        });
      }
    }

    // Lower bracket winner routing (losers are eliminated → no loserNext).
    for (let k = 0; k < lbRoundCount; k++) {
      const isLast = k === lbRoundCount - 1;
      for (let j = 0; j < lb[k].length; j++) {
        let winnerNextMatchId: string;
        let winnerNextSlot: number;
        if (isLast) {
          winnerNextMatchId = grandFinal.id;
          winnerNextSlot = 2;
        } else if (k % 2 === 0) {
          // Even (minor / first) round → next drop round, slot 1.
          winnerNextMatchId = lb[k + 1][j].id;
          winnerNextSlot = 1;
        } else {
          // Odd (drop) round → internal pairing in the next minor round.
          winnerNextMatchId = lb[k + 1][Math.floor(j / 2)].id;
          winnerNextSlot = (j % 2) + 1;
        }
        await link(lb[k][j].id, { winnerNextMatchId, winnerNextSlot });
      }
    }

    // Settle every BYE so single-fed downstream matches auto-advance and dead
    // (double-BYE) matches resolve before any real match is played.
    await this.settleByes(categoryId);

    void grandFinalReset; // reset shell is populated dynamically at the GF

    return this.getEliminationMatches(categoryId);
  }

  /**
   * Resolve BYE cascades across an explicitly-linked bracket. Repeatedly looks
   * for matches whose every feeder (matches pointing at it via winnerNext /
   * loserNext) is FINISHED: such a match auto-finishes when it holds a single
   * participant (BYE) or carries none (dead slot), pushing the result onward.
   */
  private async settleByes(categoryId: string): Promise<void> {
    // A bounded number of passes (one per round depth is plenty); guard against
    // any accidental cycle with a hard cap.
    for (let pass = 0; pass < 64; pass++) {
      const matches = await this.prisma.categoryMatch.findMany({
        where: { categoryId, groupId: null, round: { not: 'GROUP' } },
        include: { participants: true },
      });
      const byId = new Map(matches.map((m) => [m.id, m]));

      // Feeder count per match (how many upstream matches route into it).
      const feederTotal = new Map<string, number>();
      const feederDone = new Map<string, number>();
      for (const m of matches) {
        for (const target of [m.winnerNextMatchId, m.loserNextMatchId]) {
          if (!target || !byId.has(target)) continue;
          feederTotal.set(target, (feederTotal.get(target) ?? 0) + 1);
          if (m.status === 'FINISHED') {
            feederDone.set(target, (feederDone.get(target) ?? 0) + 1);
          }
        }
      }

      let changed = false;
      for (const m of matches) {
        if (m.status === 'FINISHED') continue;
        if (m.round === 'GF' || m.round === 'GF2') continue; // resolved at play
        const total = feederTotal.get(m.id) ?? 0;
        if (total === 0) continue; // first round; real matches handled at gen
        const done = feederDone.get(m.id) ?? 0;
        if (done < total) continue; // still waiting on a feeder

        if (m.participants.length === 1) {
          // BYE: the lone participant advances.
          const winnerId = m.participants[0].categoryRegistrationId;
          await this.prisma.categoryMatch.update({
            where: { id: m.id },
            data: { status: 'FINISHED', winnerId, score: 'BYE' },
          });
          if (m.winnerNextMatchId && m.winnerNextSlot) {
            await this.placeParticipant(
              m.winnerNextMatchId,
              winnerId,
              m.winnerNextSlot
            );
          }
          changed = true;
        } else if (m.participants.length === 0) {
          // Dead slot (both feeders were BYEs): finish with no winner so the
          // downstream "all feeders done" check can proceed.
          await this.prisma.categoryMatch.update({
            where: { id: m.id },
            data: { status: 'FINISHED', score: 'BYE' },
          });
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  /** Create a match participant at the given slot if it isn't taken yet. */
  private async placeParticipant(
    matchId: string,
    categoryRegistrationId: string,
    position: number
  ): Promise<void> {
    const existing = await this.prisma.categoryMatchParticipant.findFirst({
      where: { matchId, position },
    });
    if (existing) return;
    await this.prisma.categoryMatchParticipant.create({
      data: { matchId, categoryRegistrationId, position },
    });
  }

  /**
   * Advance a finished double-elimination match using its stored routing.
   * Sends the winner to winnerNext and the loser to loserNext, then resolves
   * the grand-final / bracket-reset specifics.
   */
  private async advanceDoubleElimination(match: {
    id: string;
    categoryId: string;
    round: string;
    winnerId: string | null;
    winnerNextMatchId: string | null;
    winnerNextSlot: number | null;
    loserNextMatchId: string | null;
    loserNextSlot: number | null;
    participants: Array<{ categoryRegistrationId: string; position: number }>;
  }): Promise<void> {
    if (!match.winnerId) return;
    const loser = match.participants.find(
      (p) => p.categoryRegistrationId !== match.winnerId
    );

    // Grand final: decide champion or trigger the reset match.
    if (match.round === 'GF') {
      const upperRep = match.participants.find((p) => p.position === 1);
      const resetMatch = await this.prisma.categoryMatch.findFirst({
        where: { categoryId: match.categoryId, round: 'GF2', groupId: null },
      });
      const lowerRepWon =
        !upperRep || upperRep.categoryRegistrationId !== match.winnerId;
      if (resetMatch && lowerRepWon) {
        // Lower-bracket champion forced a reset → replay with both finalists.
        for (const p of match.participants) {
          await this.placeParticipant(
            resetMatch.id,
            p.categoryRegistrationId,
            p.position
          );
        }
      } else if (resetMatch && !lowerRepWon) {
        // Upper-bracket champion won outright → the reset match is not played.
        await this.prisma.categoryMatch.update({
          where: { id: resetMatch.id },
          data: { status: 'CANCELLED' },
        });
      }
      return;
    }
    if (match.round === 'GF2') return; // reset winner is the champion

    // Normal upper/lower routing.
    if (match.winnerNextMatchId && match.winnerNextSlot) {
      await this.placeParticipant(
        match.winnerNextMatchId,
        match.winnerId,
        match.winnerNextSlot
      );
    }
    if (loser && match.loserNextMatchId && match.loserNextSlot) {
      await this.placeParticipant(
        match.loserNextMatchId,
        loser.categoryRegistrationId,
        match.loserNextSlot
      );
    }
  }

  /**
   * Reverse {@link advanceDoubleElimination}: pull the winner / loser this match
   * pushed into downstream matches, but only when those matches have not yet
   * started, so an in-progress or finished later match is never corrupted.
   */
  private async removeAdvancedDoubleElimination(match: {
    id: string;
    categoryId: string;
    round: string;
    winnerId: string | null;
    winnerNextMatchId: string | null;
    winnerNextSlot: number | null;
    loserNextMatchId: string | null;
    loserNextSlot: number | null;
    participants: Array<{ categoryRegistrationId: string; position: number }>;
  }): Promise<void> {
    if (!match.winnerId) return;
    const loser = match.participants.find(
      (p) => p.categoryRegistrationId !== match.winnerId
    );

    if (match.round === 'GF') {
      const resetMatch = await this.prisma.categoryMatch.findFirst({
        where: { categoryId: match.categoryId, round: 'GF2', groupId: null },
      });
      if (resetMatch && resetMatch.status !== 'FINISHED') {
        await this.prisma.categoryMatchParticipant.deleteMany({
          where: { matchId: resetMatch.id },
        });
        if (resetMatch.status === 'CANCELLED') {
          await this.prisma.categoryMatch.update({
            where: { id: resetMatch.id },
            data: { status: 'SCHEDULED' },
          });
        }
      }
      return;
    }
    if (match.round === 'GF2') return;

    if (match.winnerNextMatchId && match.winnerNextSlot) {
      const next = await this.prisma.categoryMatch.findUnique({
        where: { id: match.winnerNextMatchId },
      });
      if (next && next.status === 'SCHEDULED') {
        await this.prisma.categoryMatchParticipant.deleteMany({
          where: {
            matchId: match.winnerNextMatchId,
            position: match.winnerNextSlot,
            categoryRegistrationId: match.winnerId,
          },
        });
      }
    }
    if (loser && match.loserNextMatchId && match.loserNextSlot) {
      const next = await this.prisma.categoryMatch.findUnique({
        where: { id: match.loserNextMatchId },
      });
      if (next && next.status === 'SCHEDULED') {
        await this.prisma.categoryMatchParticipant.deleteMany({
          where: {
            matchId: match.loserNextMatchId,
            position: match.loserNextSlot,
            categoryRegistrationId: loser.categoryRegistrationId,
          },
        });
      }
    }
  }

  // Build the per-round match-format resolver (honours formatConfig.roundFormats).
  private buildFormatForRound(
    category: {
      eliminationMatchFormat?: unknown;
      matchFormat?: unknown;
      formatConfig?: unknown;
    } | null
  ): (round: string) => MatchFormat {
    const bracketMatchFormat = (category?.eliminationMatchFormat ??
      category?.matchFormat) as MatchFormat;
    const VALID_MATCH_FORMATS = new Set([
      'BEST_OF_1',
      'BEST_OF_3',
      'BEST_OF_5',
    ]);
    const roundFormats =
      (
        category?.formatConfig as {
          roundFormats?: Record<string, string>;
        } | null
      )?.roundFormats ?? {};
    return (round: string): MatchFormat => {
      const override = roundFormats[round];
      const value =
        override && VALID_MATCH_FORMATS.has(override)
          ? override
          : bracketMatchFormat;
      return value as MatchFormat;
    };
  }

  /**
   * Pre-create the whole elimination bracket as empty "shells" (0 participants)
   * so it can be scheduled and displayed (with seed/feeder labels) before the
   * group stage finishes. Idempotent: skips if any elimination match already
   * exists. Only applies to group-stage → playoff categories.
   */
  async ensureEliminationShells(categoryId: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category || !category.hasGroupStage) return;

    const groupCount = category.groupCount ?? 0;
    const winnersPerGroup = category.winnersPerGroup ?? 0;
    const n = groupCount * winnersPerGroup;
    if (n < 2) return;

    const existing = await this.prisma.categoryMatch.count({
      where: { categoryId, groupId: null, round: { not: 'GROUP' } },
    });
    if (existing > 0) return; // idempotent

    const bracketSize = this.nextPowerOf2(n);
    const totalRounds = Math.log2(bracketSize);
    if (totalRounds < 1) return;
    const roundNames = this.determineRoundNames(totalRounds);
    const formatForRound = this.buildFormatForRound(category);

    let globalMatchNumber =
      (await this.prisma.categoryMatch.count({ where: { categoryId } })) + 1;

    // First round (most matches) gets the lowest numbers, then later rounds,
    // matching the numbering generateEliminationBracket / feeder logic expect.
    for (let round = 0; round < totalRounds; round++) {
      const matchesInRound = bracketSize / Math.pow(2, round + 1);
      for (let i = 0; i < matchesInRound; i++) {
        await this.prisma.categoryMatch.create({
          data: {
            categoryId,
            round: roundNames[round],
            matchNumber: globalMatchNumber++,
            status: 'SCHEDULED',
            matchFormat: formatForRound(roundNames[round]),
          },
        });
      }
    }

    if (category.thirdPlaceMatch && totalRounds >= 2) {
      await this.prisma.categoryMatch.create({
        data: {
          categoryId,
          round: '3RD',
          matchNumber: globalMatchNumber++,
          status: 'SCHEDULED',
          matchFormat: formatForRound('3RD'),
        },
      });
    }
  }

  /**
   * Fill the existing first-round shell matches with the seeded advancing teams
   * WITHOUT deleting/recreating, so any court/time already assigned is kept.
   * Returns false when shells are absent or their count no longer matches the
   * bracket (e.g. config changed), so the caller can fall back to a full regen.
   */
  private async fillEliminationBracket(
    categoryId: string,
    registrationIds: string[]
  ): Promise<boolean> {
    const n = registrationIds.length;
    const bracketSize = this.nextPowerOf2(n);
    const totalRounds = Math.log2(bracketSize);
    const roundNames = this.determineRoundNames(totalRounds);

    const firstRoundMatches = await this.prisma.categoryMatch.findMany({
      where: { categoryId, groupId: null, round: roundNames[0] },
      orderBy: { matchNumber: 'asc' },
      include: { participants: true },
    });

    // No shells, or structure no longer matches → let caller regenerate.
    if (firstRoundMatches.length !== bracketSize / 2) return false;

    const seedOrder = this.generateStandardSeeding(bracketSize);
    const slots: (string | null)[] = (
      new Array(bracketSize) as (string | null)[]
    ).fill(null);
    for (let pos = 0; pos < bracketSize; pos++) {
      const seed = seedOrder[pos];
      slots[pos] = seed <= n ? registrationIds[seed - 1] : null;
    }

    const byeAdvances: { registrationId: string; matchIndex: number }[] = [];

    for (let i = 0; i < firstRoundMatches.length; i++) {
      const match = firstRoundMatches[i];
      if (match.participants.length > 0) continue; // already filled
      const slot1 = slots[i * 2];
      const slot2 = slots[i * 2 + 1];

      if (slot1 && slot2) {
        await this.prisma.categoryMatchParticipant.createMany({
          data: [
            { matchId: match.id, categoryRegistrationId: slot1, position: 1 },
            { matchId: match.id, categoryRegistrationId: slot2, position: 2 },
          ],
        });
      } else if (slot1 || slot2) {
        const realPlayer = (slot1 || slot2)!;
        await this.prisma.categoryMatchParticipant.create({
          data: {
            matchId: match.id,
            categoryRegistrationId: realPlayer,
            position: 1,
          },
        });
        await this.prisma.categoryMatch.update({
          where: { id: match.id },
          data: { status: 'FINISHED', winnerId: realPlayer, score: 'BYE' },
        });
        byeAdvances.push({ registrationId: realPlayer, matchIndex: i });
      }
    }

    // Advance BYE winners into the next round's existing shells.
    if (byeAdvances.length > 0 && totalRounds > 1) {
      const secondRoundMatches = await this.prisma.categoryMatch.findMany({
        where: { categoryId, groupId: null, round: roundNames[1] },
        orderBy: { matchNumber: 'asc' },
      });
      for (const bye of byeAdvances) {
        const nextMatchIndex = Math.floor(bye.matchIndex / 2);
        if (nextMatchIndex >= secondRoundMatches.length) continue;
        const position = (bye.matchIndex % 2) + 1;
        const existing = await this.prisma.categoryMatchParticipant.findFirst({
          where: { matchId: secondRoundMatches[nextMatchIndex].id, position },
        });
        if (!existing) {
          await this.prisma.categoryMatchParticipant.create({
            data: {
              matchId: secondRoundMatches[nextMatchIndex].id,
              categoryRegistrationId: bye.registrationId,
              position,
            },
          });
        }
      }
    }

    return true;
  }

  private nextPowerOf2(n: number): number {
    let p = 1;
    while (p < n) p *= 2;
    return p;
  }

  private generateStandardSeeding(bracketSize: number): number[] {
    let seeds = [1];
    while (seeds.length < bracketSize) {
      const newSeeds: number[] = [];
      const sumNeeded = seeds.length * 2 + 1;
      for (const seed of seeds) {
        newSeeds.push(seed);
        newSeeds.push(sumNeeded - seed);
      }
      seeds = newSeeds;
    }
    return seeds;
  }

  private determineRoundNames(totalRounds: number): string[] {
    // Ordered first round → Final, so names[0] is the earliest round (most
    // matches, where the advancing teams play) and names[last] is the Final.
    const names: string[] = [];
    for (let i = totalRounds - 1; i >= 0; i--) {
      const matchesInRound = Math.pow(2, i);
      if (matchesInRound === 1) names.push('F');
      else if (matchesInRound === 2) names.push('SF');
      else if (matchesInRound === 4) names.push('QF');
      else names.push(`R${matchesInRound * 2}`);
    }
    return names;
  }

  // ─── Bulk Schedule Update ──────────────────────────────────

  async bulkUpdateSchedule(
    updates: Array<{
      matchId: string;
      courtId?: string | null;
      startTime?: string | null;
      endTime?: string | null;
    }>,
    userId: string,
    role?: string
  ) {
    if (updates.length === 0) return [];

    // Verify ownership via the first match's tournament
    const firstMatch = await this.prisma.categoryMatch.findUnique({
      where: { id: updates[0].matchId },
      include: {
        category: { include: { tournament: { select: { hostId: true } } } },
      },
    });
    if (!firstMatch) throw new NotFoundException('Match not found');
    await this.access.assertManageAccess({
      tournamentId: (firstMatch.category as { tournamentId: string })
        .tournamentId,
      hostId: firstMatch.category.tournament.hostId,
      userId,
      role,
      scope: 'SCHEDULE',
    });

    const tournamentId = (firstMatch.category as { tournamentId: string })
      .tournamentId;

    return this.prisma.$transaction(async (tx) => {
      const results: Awaited<ReturnType<typeof tx.categoryMatch.update>>[] = [];
      for (const update of updates) {
        // Verify match belongs to same tournament
        const match = await tx.categoryMatch.findUnique({
          where: { id: update.matchId },
          include: { category: { select: { tournamentId: true } } },
        });
        if (!match) continue;
        if (match.category.tournamentId !== tournamentId) continue;

        // Calculate estimatedEndTime and scheduledDuration from startTime + endTime
        let estimatedEndTime: Date | null = null;
        let scheduledDuration: number | null = null;
        if (update.startTime && update.endTime) {
          estimatedEndTime = new Date(update.endTime);
          scheduledDuration = Math.round(
            (estimatedEndTime.getTime() -
              new Date(update.startTime).getTime()) /
              60000
          );
        }

        const updated = await tx.categoryMatch.update({
          where: { id: update.matchId },
          data: {
            ...(update.courtId !== undefined && {
              courtId: update.courtId || null,
            }),
            ...(update.startTime !== undefined && {
              startTime: update.startTime ? new Date(update.startTime) : null,
            }),
            ...(update.endTime !== undefined && {
              endTime: update.endTime ? new Date(update.endTime) : null,
            }),
            ...(estimatedEndTime && { estimatedEndTime }),
            ...(scheduledDuration !== null && { scheduledDuration }),
          },
          include: {
            participants: {
              include: {
                categoryRegistration: {
                  include: {
                    player: true,
                    pair: {
                      include: {
                        members: {
                          include: { player: true },
                          orderBy: { position: 'asc' as const },
                        },
                      },
                    },
                  },
                },
              },
            },
            court: true,
            group: true,
            category: true,
          },
        });
        results.push(updated);
      }
      return results;
    });
  }
}
