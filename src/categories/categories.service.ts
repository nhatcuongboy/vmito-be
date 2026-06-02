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
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateCategoryRegistrationDto } from './dto/create-category-registration.dto';
import { ConvertLegacyRegistrationDto } from '../tournaments/dto/tournament-pair.dto';
import { CreateCategoryMatchDto } from './dto/create-category-match.dto';
import { EndCategoryMatchDto } from './dto/end-category-match.dto';
import { UpdateMatchScoreDto } from './dto/update-match-score.dto';
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
  PointLogEntry,
  MatchFormatValue,
  Side,
} from './scoring/badminton-scoring';
import {
  normalizeMatchForBroadcast,
  NormalizableMatch,
} from './scoring/normalize-match';
import { MATCH_SCORING_INCLUDE } from './scoring/match-include';

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
    private tournamentsGateway: TournamentsGateway
  ) {}

  // ─── Helpers ───────────────────────────────────────────────

  private async getCategoryWithOwnership(
    categoryId: string,
    userId: string,
    role?: string
  ) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: { tournament: { select: { hostId: true } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (category.tournament.hostId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You can only manage your own tournaments');
    }
    return category;
  }

  private async getMatchWithOwnership(
    matchId: string,
    userId: string,
    role?: string
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
    if (match.category.tournament.hostId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You can only manage your own tournaments');
    }
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
    if (!isHost && !isAdmin && !isAssignedReferee) {
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
    category: { matchFormat: MatchFormat | null };
  }): MatchFormatValue {
    return (match.matchFormat ??
      match.category.matchFormat ??
      'BEST_OF_1') as MatchFormatValue;
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
    const sets = this.parseSets(match.sets);
    const log = this.parsePointLog(match.pointLog);

    let newLog: PointLogEntry[];
    if (dto.delta === 1) {
      // Validate the point is allowed (throws if the match is already decided).
      try {
        applyDelta(sets, dto.side, 1, format, isDoubles);
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

    const newSets = rebuildFromLog(newLog, format, isDoubles);
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
    const log = this.parsePointLog(match.pointLog);
    if (log.length === 0) return match;

    const newLog = log.slice(0, -1);
    const newSets = rebuildFromLog(newLog, format, isDoubles);
    return this.persistAndBroadcastScore(
      match,
      newSets,
      newLog,
      isDoubles,
      TournamentEventType.TOURNAMENT_MATCH_SCORE_UPDATED
    );
  }

  /** Assign a tournament umpire as the referee for a match (host/admin only). */
  async assignReferee(
    matchId: string,
    refereeId: string,
    userId: string,
    role?: string
  ) {
    const match = await this.getMatchWithOwnership(matchId, userId, role);
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
    await this.getMatchWithOwnership(matchId, userId, role);
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
    if (tournament.hostId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You can only manage your own tournaments');
    }

    const type = dto.type as CategoryType;
    const registrationConfig = registrationConfigForType(
      type,
      dto.registrationMode,
      dto.teamSize
    );

    return this.prisma.category.create({
      data: {
        tournamentId,
        name: dto.name,
        type,
        ...registrationConfig,
        ...(dto.format && {
          format: dto.format as CategoryFormat,
          hasGroupStage: dto.format !== 'SINGLE_ELIMINATION',
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
    const category = await this.getCategoryWithOwnership(id, userId, role);

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

    return this.prisma.category.update({
      where: { id },
      data: updateData,
      include: {
        tournament: { select: { id: true, name: true } },
        _count: {
          select: { registrations: true, matches: true, groups: true },
        },
      },
    });
  }

  async remove(id: string, userId: string, role?: string) {
    await this.getCategoryWithOwnership(id, userId, role);
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
      role
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

  async deleteRegistration(
    categoryId: string,
    registrationId: string,
    userId: string,
    role?: string
  ) {
    await this.getCategoryWithOwnership(categoryId, userId, role);

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
      role
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
      role
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
    await this.getCategoryWithOwnership(categoryId, userId, role);

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
    await this.getCategoryWithOwnership(categoryId, userId, role);

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
    await this.getCategoryWithOwnership(categoryId, userId, role);

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

    await this.assertRegistrationReady(categoryRegistrationId);

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
    await this.getCategoryWithOwnership(categoryId, userId, role);

    const group = await this.prisma.categoryGroup.findUnique({
      where: { id: groupId },
    });
    if (!group || group.categoryId !== categoryId) {
      throw new NotFoundException('Group not found in this category');
    }

    await Promise.all(
      categoryRegistrationIds.map((id) => this.assertRegistrationReady(id))
    );

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
    await this.getCategoryWithOwnership(categoryId, userId, role);

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
    await Promise.all(regIds.map((id) => this.assertRegistrationReady(id)));

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
    await this.getCategoryWithOwnership(categoryId, userId, role);

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
      role
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
    await Promise.all(regIds.map((id) => this.assertRegistrationReady(id)));

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
    await this.getCategoryWithOwnership(categoryId, userId, role);
    await Promise.all(
      dto.participants.map((participant) =>
        this.assertRegistrationReady(participant.categoryRegistrationId)
      )
    );

    return this.prisma.categoryMatch.create({
      data: {
        categoryId,
        groupId: dto.groupId,
        round: dto.round,
        matchNumber: dto.matchNumber,
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
      startTime?: string;
      matchFormat?: string;
      groupId?: string;
    },
    userId: string,
    role?: string
  ) {
    await this.getMatchWithOwnership(id, userId, role);

    return this.prisma.categoryMatch.update({
      where: { id },
      data: {
        ...(data.courtId !== undefined && { courtId: data.courtId }),
        ...(data.round !== undefined && { round: data.round }),
        ...(data.matchNumber !== undefined && {
          matchNumber: data.matchNumber,
        }),
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
    await this.getMatchWithOwnership(id, userId, role);
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

    const updated = await this.prisma.categoryMatch.update({
      where: { id },
      data: { status: 'IN_PROGRESS', startTime: new Date() },
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
        player1Score,
        player2Score,
        player3Score,
        player4Score,
        notes: dto.notes,
      },
      include: MATCH_SCORING_INCLUDE,
    });

    // Auto-advance winner in elimination rounds
    if (updatedMatch.round !== 'GROUP' && dto.winnerId && !dto.isDraw) {
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

    this.broadcastMatch(
      updatedMatch,
      TournamentEventType.TOURNAMENT_MATCH_ENDED
    );
    return updatedMatch;
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

    // Extract point values from formatConfig (supports both RR and RR→SE configs)
    const config = category.formatConfig as Record<string, unknown> | null;
    const rrConfig = (config?.roundRobin as Record<string, unknown>) ?? config;
    const pointsEarning =
      (rrConfig?.pointsEarning as string) ?? 'match_results';

    // When tiebreakers_only mode, all point values are 0
    const isTiebreakersOnly = pointsEarning === 'tiebreakers_only';
    const winPoints = isTiebreakersOnly
      ? 0
      : ((rrConfig?.winPoints as number) ?? 2);
    const tiePoints = isTiebreakersOnly
      ? 0
      : ((rrConfig?.tiePoints as number) ?? 1);
    const lossPoints = isTiebreakersOnly
      ? 0
      : ((rrConfig?.lossPoints as number) ?? 0);
    const gameWinPoints = isTiebreakersOnly
      ? 0
      : ((rrConfig?.gameWinPoints as number) ?? 0);
    const gameLossPoints = isTiebreakersOnly
      ? 0
      : ((rrConfig?.gameLossPoints as number) ?? 0);

    // Configurable tiebreaker order
    const tiebreakerOrder = (rrConfig?.tiebreakers as Array<{
      id: string;
    }>) ?? [
      { id: 'total_points' },
      { id: 'game_differential' },
      { id: 'total_wins' },
      { id: 'point_differential' },
    ];

    const groupRegs = await this.prisma.categoryGroupRegistration.findMany({
      where: { groupId },
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

    const finishedMatches = await this.prisma.categoryMatch.findMany({
      where: { groupId, status: 'FINISHED' },
      include: { participants: true },
    });

    // Build standings map
    const standingsMap = new Map<
      string,
      {
        categoryRegistrationId: string;
        registration: (typeof groupRegs)[0]['categoryRegistration'];
        matchesPlayed: number;
        matchesWon: number;
        matchesLost: number;
        matchesDrawn: number;
        points: number;
        pointsFor: number;
        pointsAgainst: number;
        pointDifference: number;
        gamesWon: number;
        gamesLost: number;
        gameDifference: number;
        rank: number;
      }
    >();

    for (const gr of groupRegs) {
      standingsMap.set(gr.categoryRegistrationId, {
        categoryRegistrationId: gr.categoryRegistrationId,
        registration: gr.categoryRegistration,
        matchesPlayed: 0,
        matchesWon: 0,
        matchesLost: 0,
        matchesDrawn: 0,
        points: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDifference: 0,
        gamesWon: 0,
        gamesLost: 0,
        gameDifference: 0,
        rank: 0,
      });
    }

    // Process matches
    for (const match of finishedMatches) {
      const p1 = match.participants.find((p) => p.position === 1);
      const p2 = match.participants.find((p) => p.position === 2);
      if (!p1 || !p2) continue;

      const s1 = standingsMap.get(p1.categoryRegistrationId);
      const s2 = standingsMap.get(p2.categoryRegistrationId);
      if (!s1 || !s2) continue;

      s1.matchesPlayed++;
      s2.matchesPlayed++;

      s1.pointsFor += match.player1Score || 0;
      s1.pointsAgainst += match.player2Score || 0;
      s2.pointsFor += match.player2Score || 0;
      s2.pointsAgainst += match.player1Score || 0;

      // Count games from sets data
      if (match.sets && Array.isArray(match.sets)) {
        for (const set of match.sets as Array<{
          player1Score?: number;
          player2Score?: number;
        }>) {
          const p1Score = set.player1Score ?? 0;
          const p2Score = set.player2Score ?? 0;
          if (p1Score > p2Score) {
            s1.gamesWon++;
            s2.gamesLost++;
          } else if (p2Score > p1Score) {
            s2.gamesWon++;
            s1.gamesLost++;
          }
        }
        // Add game-level points
        s1.points +=
          s1.gamesWon * gameWinPoints + s1.gamesLost * gameLossPoints;
        s2.points +=
          s2.gamesWon * gameWinPoints + s2.gamesLost * gameLossPoints;
      }

      if (match.isDraw) {
        s1.matchesDrawn++;
        s2.matchesDrawn++;
        s1.points += tiePoints;
        s2.points += tiePoints;
      } else if (match.winnerId === p1.categoryRegistrationId) {
        s1.matchesWon++;
        s2.matchesLost++;
        s1.points += winPoints;
        s2.points += lossPoints;
      } else if (match.winnerId === p2.categoryRegistrationId) {
        s2.matchesWon++;
        s1.matchesLost++;
        s2.points += winPoints;
        s1.points += lossPoints;
      }
    }

    // Calculate differences and sort
    const standings = Array.from(standingsMap.values());
    standings.forEach((s) => {
      s.pointDifference = s.pointsFor - s.pointsAgainst;
      s.gameDifference = s.gamesWon - s.gamesLost;
    });

    // Dynamic tiebreaker sort based on configured order
    standings.sort((a, b) => {
      for (const tb of tiebreakerOrder) {
        let result = 0;
        switch (tb.id) {
          case 'total_points':
            result = b.points - a.points;
            break;
          case 'total_wins':
            result = b.matchesWon - a.matchesWon;
            break;
          case 'head_to_head':
            result = this.compareHeadToHead(a, b, finishedMatches);
            break;
          case 'game_differential':
            result = b.gameDifference - a.gameDifference;
            break;
          case 'point_differential':
            result = b.pointDifference - a.pointDifference;
            break;
          case 'points_for':
            result = b.pointsFor - a.pointsFor;
            break;
          case 'points_against':
            result = a.pointsAgainst - b.pointsAgainst;
            break;
        }
        if (result !== 0) return result;
      }
      return 0;
    });

    standings.forEach((s, i) => (s.rank = i + 1));

    return { group, standings };
  }

  private compareHeadToHead(
    a: { categoryRegistrationId: string },
    b: { categoryRegistrationId: string },
    matches: Array<{
      winnerId: string | null;
      isDraw: boolean;
      participants: Array<{ categoryRegistrationId: string; position: number }>;
    }>
  ): number {
    const h2hMatches = matches.filter((m) => {
      const ids = m.participants.map((p) => p.categoryRegistrationId);
      return (
        ids.includes(a.categoryRegistrationId) &&
        ids.includes(b.categoryRegistrationId)
      );
    });

    if (h2hMatches.length === 0) return 0;

    let aWins = 0;
    let bWins = 0;
    for (const m of h2hMatches) {
      if (m.isDraw) continue;
      if (m.winnerId === a.categoryRegistrationId) aWins++;
      else if (m.winnerId === b.categoryRegistrationId) bWins++;
    }

    if (aWins > bWins) return -1;
    if (bWins > aWins) return 1;
    return 0;
  }

  async calculateGroupStandings(
    categoryId: string,
    groupId: string,
    userId: string,
    role?: string
  ) {
    await this.getCategoryWithOwnership(categoryId, userId, role);
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
    await this.getCategoryWithOwnership(categoryId, userId, role);

    const groups = await this.prisma.categoryGroup.findMany({
      where: { categoryId },
      orderBy: { groupNumber: 'asc' },
    });

    if (groups.length === 0) {
      throw new BadRequestException('No groups exist. Create groups first.');
    }

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

  async completeGroupStage(categoryId: string, userId: string, role?: string) {
    const category = await this.getCategoryWithOwnership(
      categoryId,
      userId,
      role
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
    await Promise.all(
      registrationIds.map((id) => this.assertRegistrationReady(id))
    );
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    const n = registrationIds.length;
    const bracketSize = this.nextPowerOf2(n);
    const totalRounds = Math.log2(bracketSize);

    // Use elimination-specific match format if configured, otherwise fall back to category default
    const bracketMatchFormat =
      category?.eliminationMatchFormat ?? category?.matchFormat;

    // Standard seeding to separate top seeds
    const seedOrder = this.generateStandardSeeding(bracketSize);

    // Place registrations into seeded slots (null = BYE)
    const slots: (string | null)[] = (
      new Array(bracketSize) as (string | null)[]
    ).fill(null);
    for (let i = 0; i < n; i++) {
      slots[seedOrder[i] - 1] = registrationIds[i];
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
            matchFormat: bracketMatchFormat,
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
            matchFormat: bracketMatchFormat,
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
            matchFormat: bracketMatchFormat,
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
          matchFormat: bracketMatchFormat,
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
    // Work backwards from Final
    const names: string[] = [];
    for (let i = totalRounds - 1; i >= 0; i--) {
      const matchesInRound = Math.pow(2, i);
      if (matchesInRound === 1) names.unshift('F');
      else if (matchesInRound === 2) names.unshift('SF');
      else if (matchesInRound === 4) names.unshift('QF');
      else names.unshift(`R${matchesInRound * 2}`);
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
    if (firstMatch.category.tournament.hostId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You can only manage your own tournaments');
    }

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
