/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { DuplicateTournamentDto } from './dto/duplicate-tournament.dto';
import {
  CreateTournamentPlayerDto,
  BulkTournamentPlayersDto,
  BulkTournamentPlayerRowDto,
  UpdateTournamentPlayerDto,
} from './dto/create-tournament-player.dto';
import { ScoreboardQueryDto } from './dto/scoreboard-query.dto';
import { SaveTournamentPairDto } from './dto/tournament-pair.dto';
import { VENUE_PUBLIC_OMIT } from '../venues/venues.service';
import {
  TournamentStatus,
  ScheduleType,
  MatchStatus,
  TournamentPermission,
  SportType,
  Gender,
  FavoriteType,
} from '@prisma/client';
import { MATCH_SCORING_INCLUDE } from '../categories/scoring/match-include';
import { normalizeMatchForBroadcast } from '../categories/scoring/normalize-match';
import {
  TournamentAccessService,
  ManageScope,
} from '../common/tournament-access/tournament-access.service';
import { ScheduleService } from './services/schedule.service';
import {
  TournamentsGateway,
  TournamentEventType,
} from './realtime/tournaments.gateway';
import { FavoritesService } from '../favorites/favorites.service';

@Injectable()
export class TournamentsService {
  constructor(
    private prisma: PrismaService,
    private access: TournamentAccessService,
    private scheduleService: ScheduleService,
    private gateway: TournamentsGateway,
    private favoritesService: FavoritesService
  ) {}

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove diacritics
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = this.generateSlug(name);
    let slug = base;
    let suffix = 1;
    while (await this.prisma.tournament.findUnique({ where: { slug } })) {
      slug = `${base}-${suffix++}`;
    }
    return slug;
  }

  async findMyTournaments(userId: string) {
    // Tournaments the user hosts, has been assigned to manage, OR is an umpire/referee for.
    // The filtered `managers` relation lets the client read the caller's granted permissions
    // (empty for hosted tournaments, where the host has every permission).
    return this.prisma.tournament.findMany({
      where: {
        OR: [
          { hostId: userId },
          { managers: { some: { userId } } },
          { umpires: { some: { userId } } },
        ],
      },
      include: {
        managers: {
          where: { userId },
          select: { permissions: true },
        },
        _count: {
          select: { categories: true, players: true, pairs: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * The requesting user's management access to a tournament: whether they are
   * the host or a system admin (both implicitly have every permission), and the
   * scopes granted to them as a manager. Used by the client to gate the manage UI.
   */
  async getMyAccess(idOrSlug: string, userId: string, role?: string) {
    const tournament = await this.prisma.tournament.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: { id: true, hostId: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    const isHost = tournament.hostId === userId;
    const isAdmin = role === 'ADMIN';
    let permissions: TournamentPermission[] = [];
    if (!isHost && !isAdmin) {
      const manager = await this.prisma.tournamentManager.findUnique({
        where: {
          tournamentId_userId: { tournamentId: tournament.id, userId },
        },
        select: { permissions: true },
      });
      permissions = manager?.permissions ?? [];
    }

    return { tournamentId: tournament.id, isHost, isAdmin, permissions };
  }

  async findAll(favoriteOnly?: boolean, userId?: string) {
    let favoriteIds: string[] | undefined;
    if (favoriteOnly) {
      favoriteIds = userId
        ? await this.favoritesService.getFavoritedTargetIds(
            userId,
            FavoriteType.TOURNAMENT
          )
        : [];
      if (favoriteIds.length === 0) return [];
    }

    const tournaments = await this.prisma.tournament.findMany({
      where: favoriteIds ? { id: { in: favoriteIds } } : undefined,
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        _count: {
          select: {
            players: true,
            pairs: true,
            categories: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const favoriteSet = favoriteOnly
      ? new Set(tournaments.map((t) => t.id))
      : userId
        ? await this.favoritesService.isFavoritedMap(
            userId,
            FavoriteType.TOURNAMENT,
            tournaments.map((t) => t.id)
          )
        : new Set<string>();

    return tournaments.map((t) => ({
      ...t,
      isFavorite: favoriteSet.has(t.id),
    }));
  }

  async findOne(idOrSlug: string) {
    // Try by id first, then by slug
    const tournament = await this.prisma.tournament.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        categories: {
          include: {
            _count: {
              select: {
                registrations: true,
                matches: true,
                groups: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        umpires: {
          orderBy: {
            createdAt: 'asc',
          },
        },
        scoringDevices: {
          orderBy: {
            createdAt: 'asc',
          },
        },
        courts: {
          orderBy: {
            courtNumber: 'asc',
          },
        },
        _count: {
          select: {
            players: true,
            pairs: true,
            categories: true,
          },
        },
      },
    });

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    return tournament;
  }

  async create(dto: CreateTournamentDto, hostId: string) {
    const { name, description, startDate, endDate, venueId } = dto;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date format');
    }

    if (start > end) {
      throw new BadRequestException('End date must not be before start date');
    }

    const slug = await this.uniqueSlug(name);

    const tournament = await this.prisma.tournament.create({
      data: {
        name,
        description: description?.trim() || null,
        slug,
        startDate: start,
        endDate: end,
        hostId,
        venueId: venueId || undefined,
        sportType: (dto.sportType ?? 'BADMINTON') as SportType,
        status: 'PREPARING',
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        venue: true,
        categories: true,
        umpires: true,
        scoringDevices: true,
        courts: {
          orderBy: {
            courtNumber: 'asc',
          },
        },
        _count: {
          select: {
            players: true,
            pairs: true,
            categories: true,
          },
        },
      },
    });

    return tournament;
  }

  /**
   * Deep-copies a tournament into a brand-new one owned by the same host.
   *
   * `format` (categories + their format config) is always copied. Everything
   * else is gated by the `copy` flags, with these dependencies:
   *   - group assignments & match participants require `teams`
   *   - per-match court assignments & court time slots require `venues`
   *
   * Per product decision, a duplicate always starts UNPLAYED: match structure
   * (groups, matches, brackets) is recreated by `schedule`, but scores, winners
   * and statuses are reset. The `matchResults` flag is therefore accepted for
   * API compatibility but never carries results over.
   *
   * Runs in a single transaction so a failure never leaves a half-built copy.
   */
  async duplicateTournament(
    id: string,
    dto: DuplicateTournamentDto,
    userId: string,
    role: string
  ) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date format');
    }
    if (start > end) {
      throw new BadRequestException('End date must not be before start date');
    }

    const source = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        categories: {
          include: {
            registrations: true,
            groups: { include: { registrations: true } },
            matches: { include: { participants: true } },
          },
        },
        tournamentVenues: true,
        courts: true,
        players: true,
        pairs: { include: { members: true } },
        scheduleConfig: {
          include: { timeSlots: { include: { courtSlots: true } } },
        },
      },
    });

    if (!source) {
      throw new NotFoundException('Tournament not found');
    }

    // Only the owner (or an admin) may duplicate a tournament.
    this.access.assertHostOrAdmin(source.hostId, userId, role);

    const copy = dto.copy || {};
    const copyVenues = copy.venues === true;
    const copyTeams = copy.teams === true;
    const copySchedule = copy.schedule === true;
    const copyHomePage = copy.customHomePage === true;

    const slug = await this.uniqueSlug(dto.name);

    // Old id -> new id maps, populated as we recreate each layer.
    const catMap = new Map<string, string>();
    const venueMap = new Map<string, string>();
    const courtMap = new Map<string, string>();
    const playerMap = new Map<string, string>();
    const pairMap = new Map<string, string>();
    const regMap = new Map<string, string>();
    const groupMap = new Map<string, string>();

    const newId = await this.prisma.$transaction(
      async (tx) => {
        // `as any` mirrors this service's existing Prisma access style and
        // sidesteps Json-field typing friction across the many models below.
        const db = tx as any;

        // 1) The new tournament shell.
        const newTournament = await db.tournament.create({
          data: {
            name: dto.name,
            slug,
            startDate: start,
            endDate: end,
            hostId: source.hostId,
            venueId: dto.venueId || null,
            status: 'PREPARING',
            sportType: source.sportType,
            isPublished: false,
            scheduleType: source.scheduleType ?? null,
            coverPhoto: copyHomePage ? source.coverPhoto : null,
            coverPhotoPublicId: copyHomePage ? source.coverPhotoPublicId : null,
            youtubeVideoUrls: copyHomePage ? source.youtubeVideoUrls : [],
          },
        });

        // 2) Categories + format config (always).
        for (const c of source.categories) {
          const nc = await db.category.create({
            data: {
              tournamentId: newTournament.id,
              name: c.name,
              type: c.type,
              registrationMode: c.registrationMode,
              teamSize: c.teamSize,
              format: c.format,
              hasGroupStage: c.hasGroupStage,
              averageMatchDuration: c.averageMatchDuration,
              groupCount: c.groupCount,
              winnersPerGroup: c.winnersPerGroup,
              playersPerGroup: c.playersPerGroup,
              matchFormat: c.matchFormat,
              eliminationMatchFormat: c.eliminationMatchFormat,
              thirdPlaceMatch: c.thirdPlaceMatch,
              pointsToWin: c.pointsToWin,
              winByTwo: c.winByTwo,
              pointCap: c.pointCap,
              knockoutPointsToWin: c.knockoutPointsToWin,
              knockoutWinByTwo: c.knockoutWinByTwo,
              knockoutPointCap: c.knockoutPointCap,
              finalPointsToWin: c.finalPointsToWin,
              finalWinByTwo: c.finalWinByTwo,
              finalPointCap: c.finalPointCap,
              formatConfig: c.formatConfig ?? undefined,
            },
          });
          catMap.set(c.id, nc.id);
        }

        // 3) Venues + courts.
        if (copyVenues) {
          for (const tv of source.tournamentVenues) {
            const ntv = await db.tournamentVenue.create({
              data: { tournamentId: newTournament.id, venueId: tv.venueId },
            });
            venueMap.set(tv.id, ntv.id);
          }
          for (const court of source.courts) {
            // Skip orphan courts (no venue link) so cloned tournaments don't
            // inherit dangling rows from messy source data.
            if (!court.tournamentVenueId) continue;
            const nc = await db.tournamentCourt.create({
              data: {
                tournamentId: newTournament.id,
                tournamentVenueId:
                  venueMap.get(court.tournamentVenueId) ?? null,
                courtNumber: court.courtNumber,
                courtName: court.courtName,
                status: 'AVAILABLE',
                notes: court.notes,
              },
            });
            courtMap.set(court.id, nc.id);
          }
        }

        // 4) Players, pairs, registrations.
        if (copyTeams) {
          for (const p of source.players) {
            const np = await db.tournamentPlayer.create({
              data: {
                tournamentId: newTournament.id,
                name: p.name,
                code: p.code,
                email: p.email,
                phone: p.phone,
                gender: p.gender,
                level: p.level,
                levelDescription: p.levelDescription,
                notes: p.notes,
                userId: p.userId,
              },
            });
            playerMap.set(p.id, np.id);
          }
          for (const pr of source.pairs) {
            const npr = await db.tournamentPair.create({
              data: {
                tournamentId: newTournament.id,
                name: pr.name,
                type: pr.type,
                notes: pr.notes,
              },
            });
            pairMap.set(pr.id, npr.id);
            const members = pr.members
              .filter((m) => playerMap.has(m.playerId))
              .map((m) => ({
                pairId: npr.id,
                playerId: playerMap.get(m.playerId)!,
                position: m.position,
              }));
            if (members.length) {
              await db.tournamentPairMember.createMany({ data: members });
            }
          }
          for (const c of source.categories) {
            for (const reg of c.registrations) {
              const nr = await db.categoryRegistration.create({
                data: {
                  categoryId: catMap.get(c.id)!,
                  tournamentPlayerId: reg.tournamentPlayerId
                    ? (playerMap.get(reg.tournamentPlayerId) ?? null)
                    : null,
                  tournamentPairId: reg.tournamentPairId
                    ? (pairMap.get(reg.tournamentPairId) ?? null)
                    : null,
                },
              });
              regMap.set(reg.id, nr.id);
            }
          }
        }

        // 5) Match structure (groups, matches, participants) + schedule config.
        //    Results are intentionally reset — the copy starts unplayed.
        if (copySchedule) {
          for (const c of source.categories) {
            for (const g of c.groups) {
              const ng = await db.categoryGroup.create({
                data: {
                  categoryId: catMap.get(c.id)!,
                  groupNumber: g.groupNumber,
                  name: g.name,
                },
              });
              groupMap.set(g.id, ng.id);
              if (copyTeams) {
                const groupRegs = g.registrations
                  .filter((gr) => regMap.has(gr.categoryRegistrationId))
                  .map((gr) => ({
                    groupId: ng.id,
                    categoryRegistrationId: regMap.get(
                      gr.categoryRegistrationId
                    )!,
                  }));
                if (groupRegs.length) {
                  await db.categoryGroupRegistration.createMany({
                    data: groupRegs,
                  });
                }
              }
            }
          }

          for (const c of source.categories) {
            for (const m of c.matches) {
              const nm = await db.categoryMatch.create({
                data: {
                  categoryId: catMap.get(c.id)!,
                  groupId: m.groupId ? (groupMap.get(m.groupId) ?? null) : null,
                  round: m.round,
                  matchNumber: m.matchNumber,
                  status: 'SCHEDULED',
                  startTime: m.startTime,
                  estimatedEndTime: m.estimatedEndTime,
                  scheduledDuration: m.scheduledDuration,
                  queueOrder: m.queueOrder,
                  isQueued: m.isQueued,
                  matchFormat: m.matchFormat,
                  notes: m.notes,
                  // Court assignment only survives when venues were copied.
                  courtId:
                    copyVenues && m.courtId
                      ? (courtMap.get(m.courtId) ?? null)
                      : null,
                  // Everything below is deliberately left at defaults (no
                  // score, no winner, unplayed) so the duplicate is fresh.
                },
              });
              if (copyTeams) {
                const participants = m.participants
                  .filter((p) => regMap.has(p.categoryRegistrationId))
                  .map((p) => ({
                    matchId: nm.id,
                    categoryRegistrationId: regMap.get(
                      p.categoryRegistrationId
                    )!,
                    position: p.position,
                  }));
                if (participants.length) {
                  await db.categoryMatchParticipant.createMany({
                    data: participants,
                  });
                }
              }
            }
          }

          if (source.scheduleConfig) {
            const sc = source.scheduleConfig;
            const priorities = Array.isArray(sc.categoryPriorities)
              ? (sc.categoryPriorities as string[])
                  .map((cid) => catMap.get(cid))
                  .filter((x): x is string => !!x)
              : sc.categoryPriorities;
            const nsc = await db.scheduleConfiguration.create({
              data: {
                tournamentId: newTournament.id,
                categoryPriorities: priorities,
                matchDurations: sc.matchDurations,
                keepScheduledMatches: sc.keepScheduledMatches,
              },
            });
            for (const ts of sc.timeSlots) {
              const nts = await db.scheduleTimeSlot.create({
                data: {
                  configId: nsc.id,
                  date: ts.date,
                  startTime: ts.startTime,
                  endTime: ts.endTime,
                  timeBuffer: ts.timeBuffer,
                },
              });
              // Court time slots only make sense once courts exist.
              if (copyVenues) {
                const courtSlots = ts.courtSlots
                  .filter((cs) => courtMap.has(cs.courtId))
                  .map((cs) => ({
                    timeSlotId: nts.id,
                    courtId: courtMap.get(cs.courtId)!,
                    constraints: this.remapSlotConstraints(
                      cs.constraints,
                      catMap,
                      groupMap
                    ),
                  }));
                if (courtSlots.length) {
                  await db.courtTimeSlot.createMany({ data: courtSlots });
                }
              }
            }
          }
        }

        return newTournament.id as string;
      },
      { maxWait: 20000, timeout: 120000 }
    );

    return this.findOne(newId);
  }

  /**
   * Court-slot constraints store category and group IDs; remap them to the new
   * tournament's IDs and drop any that weren't copied. Round names pass through.
   */
  private remapSlotConstraints(
    constraints: unknown,
    catMap: Map<string, string>,
    groupMap: Map<string, string>
  ): unknown {
    if (!constraints || typeof constraints !== 'object') {
      return constraints ?? null;
    }
    const c = constraints as {
      categories?: string[];
      rounds?: string[];
      groups?: string[];
    };
    const out: { categories?: string[]; rounds?: string[]; groups?: string[] } =
      { ...c };
    if (Array.isArray(c.categories)) {
      out.categories = c.categories
        .map((cid) => catMap.get(cid))
        .filter((x): x is string => !!x);
    }
    if (Array.isArray(c.groups)) {
      out.groups = c.groups
        .map((gid) => groupMap.get(gid))
        .filter((x): x is string => !!x);
    }
    return out;
  }

  async update(
    id: string,
    dto: UpdateTournamentDto,
    userId: string,
    role?: string
  ) {
    const existingTournament = await this.prisma.tournament.findUnique({
      where: { id },
    });

    if (!existingTournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (existingTournament.hostId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You can only update your own tournaments');
    }

    const updateData: {
      name?: string;
      description?: string | null;
      startDate?: Date;
      endDate?: Date;
      status?: TournamentStatus;
      sportType?: SportType;
      isPublished?: boolean;
      scheduleType?: ScheduleType;
      venueId?: string;
      coverPhoto?: string;
      coverPhotoPublicId?: string;
      youtubeVideoUrls?: string[];
      contactName?: string | null;
      contactEmail?: string | null;
      contactPhone?: string | null;
    } = {};

    if (dto.name !== undefined) {
      updateData.name = dto.name;
    }

    if (dto.description !== undefined) {
      const trimmed =
        typeof dto.description === 'string' ? dto.description.trim() : null;
      updateData.description = trimmed ? trimmed : null;
    }

    if (dto.startDate !== undefined) {
      const start = new Date(dto.startDate);
      if (isNaN(start.getTime())) {
        throw new BadRequestException('Invalid startDate format');
      }
      updateData.startDate = start;
    }

    if (dto.endDate !== undefined) {
      const end = new Date(dto.endDate);
      if (isNaN(end.getTime())) {
        throw new BadRequestException('Invalid endDate format');
      }
      updateData.endDate = end;
    }

    if (dto.status !== undefined) {
      updateData.status = dto.status as TournamentStatus;
    }

    if (dto.sportType !== undefined) {
      updateData.sportType = dto.sportType as SportType;
    }

    if (dto.isPublished !== undefined) {
      updateData.isPublished = dto.isPublished;
    }

    if (dto.scheduleType !== undefined) {
      updateData.scheduleType = dto.scheduleType as ScheduleType;
    }

    if (dto.venueId !== undefined) {
      updateData.venueId = dto.venueId;
    }

    if (dto.coverPhoto !== undefined) {
      updateData.coverPhoto = dto.coverPhoto;
    }

    if (dto.coverPhotoPublicId !== undefined) {
      updateData.coverPhotoPublicId = dto.coverPhotoPublicId;
    }

    if (dto.youtubeVideoUrls !== undefined) {
      updateData.youtubeVideoUrls = dto.youtubeVideoUrls;
    }

    if (dto.contactName !== undefined) {
      const trimmed =
        typeof dto.contactName === 'string' ? dto.contactName.trim() : null;
      updateData.contactName = trimmed ? trimmed : null;
    }

    if (dto.contactEmail !== undefined) {
      const trimmed =
        typeof dto.contactEmail === 'string' ? dto.contactEmail.trim() : null;
      updateData.contactEmail = trimmed ? trimmed : null;
    }

    if (dto.contactPhone !== undefined) {
      const trimmed =
        typeof dto.contactPhone === 'string' ? dto.contactPhone.trim() : null;
      updateData.contactPhone = trimmed ? trimmed : null;
    }

    // Validate date range only when dates are being changed
    if (updateData.startDate || updateData.endDate) {
      const finalStartDate =
        updateData.startDate ?? existingTournament.startDate;
      const finalEndDate = updateData.endDate ?? existingTournament.endDate;
      if (finalStartDate >= finalEndDate) {
        throw new BadRequestException('End date must be after start date');
      }
    }

    // Require complete team rosters when publishing the tournament. Incomplete
    // rosters are allowed while drafting; this is the gate before going public.
    if (updateData.isPublished === true && !existingTournament.isPublished) {
      await this.assertNoIncompleteTeamRegistrations(id);
    }

    const tournament = await this.prisma.tournament.update({
      where: { id },
      data: updateData,
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        _count: {
          select: {
            players: true,
            pairs: true,
            categories: true,
          },
        },
      },
    });

    // Keep the live queue consistent when the schedule type changes.
    if (dto.scheduleType !== undefined) {
      try {
        await this.scheduleService.syncQueueForScheduleType(
          id,
          dto.scheduleType as ScheduleType
        );
      } catch {
        // Queue sync is best-effort; the schedule type has already been saved.
      }
    }

    // When the tournament transitions to a terminal state, tell every spectator
    // (live overlays / scoreboards) so they can drop their socket and stop
    // consuming resources. Fire only on the actual transition, not on repeats.
    const becameTerminal =
      updateData.status !== undefined &&
      updateData.status !== existingTournament.status &&
      (updateData.status === TournamentStatus.FINISHED ||
        updateData.status === TournamentStatus.CANCELLED);
    if (becameTerminal) {
      this.gateway.notifyTournamentEvent(
        id,
        TournamentEventType.TOURNAMENT_ENDED,
        {
          status: updateData.status,
        }
      );
    }

    return tournament;
  }

  async remove(id: string, userId: string, role?: string) {
    const existingTournament = await this.prisma.tournament.findUnique({
      where: { id },
    });

    if (!existingTournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (existingTournament.hostId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You can only delete your own tournaments');
    }

    await this.prisma.tournament.delete({
      where: { id },
    });

    return { message: 'Tournament deleted successfully' };
  }

  // --- All Matches across categories ---
  async getAllMatches(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    const playerSelect = {
      id: true,
      tournamentId: true,
      name: true,
      code: true,
      gender: true,
      image: true,
    } as const;

    return this.prisma.categoryMatch.findMany({
      where: {
        category: { tournamentId },
      },
      omit: {
        // pointLog is large (100+ entries per match) and not used by public views
        pointLog: true,
        // Live-scoring internals not needed for read-only consumers
        scoreVersion: true,
        // Schedule management internals not consumed by the public API
        queueOrder: true,
        isQueued: true,
        scheduledDuration: true,
        autoAssignedAt: true,
        assignedBy: true,
      },
      include: {
        participants: {
          include: {
            categoryRegistration: {
              include: {
                player: { select: playerSelect },
                pair: {
                  select: {
                    id: true,
                    tournamentId: true,
                    name: true,
                    type: true,
                    notes: true,
                    createdAt: true,
                    updatedAt: true,
                    members: {
                      orderBy: { position: 'asc' },
                      select: {
                        id: true,
                        pairId: true,
                        playerId: true,
                        position: true,
                        player: { select: playerSelect },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        court: true,
        // group and category are excluded: consumers load categories separately,
        // and groupId is already present on the match row.
      },
      orderBy: [{ category: { createdAt: 'asc' } }, { matchNumber: 'asc' }],
    });
  }

  // --- Public live scoreboard ---
  async getScoreboard(idOrSlug: string, query: ScoreboardQueryDto) {
    const tournament = await this.prisma.tournament.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: { id: true, name: true, slug: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    const tournamentId = tournament.id;

    const status = (query.status ?? 'IN_PROGRESS') as MatchStatus;
    const includeFinished = query.includeFinished === 'true';
    const courtIds = query.courtIds
      ? query.courtIds
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const matches = await this.prisma.categoryMatch.findMany({
      where: {
        category: { tournamentId },
        status: includeFinished
          ? { in: [status, MatchStatus.FINISHED] }
          : status,
        ...(courtIds.length > 0 && { courtId: { in: courtIds } }),
      },
      include: MATCH_SCORING_INCLUDE,
      orderBy: [{ courtId: 'asc' }, { matchNumber: 'asc' }],
    });

    const normalized = matches.map((m) => normalizeMatchForBroadcast(m));

    // Group by court for the grid layout; matches without a court go to `ungrouped`.
    const courtMap = new Map<
      string,
      {
        court: (typeof normalized)[number]['court'];
        matches: typeof normalized;
      }
    >();
    const ungrouped: typeof normalized = [];
    for (const match of normalized) {
      if (!match.court) {
        ungrouped.push(match);
        continue;
      }
      const key = match.court.id;
      if (!courtMap.has(key)) {
        courtMap.set(key, { court: match.court, matches: [] });
      }
      courtMap.get(key)!.matches.push(match);
    }

    const courts = Array.from(courtMap.values()).sort(
      (a, b) => (a.court?.courtNumber ?? 0) - (b.court?.courtNumber ?? 0)
    );

    return {
      tournament,
      matches: normalized,
      courts,
      ungrouped,
    };
  }

  // --- Courts ---
  async getCourts(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    return this.prisma.tournamentCourt.findMany({
      where: { tournamentId },
      orderBy: { courtNumber: 'asc' },
    });
  }

  // --- Tournament Venues ---
  async getVenues(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    return (this.prisma as any).tournamentVenue.findMany({
      where: { tournamentId },
      include: {
        venue: { omit: VENUE_PUBLIC_OMIT },
        courts: { orderBy: { courtNumber: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addVenue(
    tournamentId: string,
    dto: {
      venueId?: string;
      name?: string;
      acronym?: string;
      placeId?: string;
      address?: string;
      lat?: number;
      lng?: number;
      district?: string;
      city?: string;
      courts?: { courtNumber: number; courtName?: string }[];
    }
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    let tournamentVenue: any;

    if (dto.venueId) {
      // ── Linked mode ──────────────────────────────────────────────────────
      const venue = await this.prisma.venue.findUnique({
        where: { id: dto.venueId },
      });
      if (!venue) throw new NotFoundException('Venue not found');

      // Upsert by (tournamentId, venueId)
      const existing = await (this.prisma as any).tournamentVenue.findFirst({
        where: { tournamentId, venueId: dto.venueId },
      });

      if (existing) {
        tournamentVenue = existing;
      } else {
        tournamentVenue = await (this.prisma as any).tournamentVenue.create({
          data: { tournamentId, venueId: dto.venueId },
        });
      }
    } else {
      // ── Inline mode ───────────────────────────────────────────────────────
      // Store address fields directly — no Venue record is created.
      if (!dto.name) throw new Error('name is required for inline venue mode');

      tournamentVenue = await (this.prisma as any).tournamentVenue.create({
        data: {
          tournamentId,
          venueId: null,
          name: dto.name,
          acronym: dto.acronym ?? null,
          placeId: dto.placeId ?? null,
          address: dto.address ?? null,
          lat: dto.lat ?? null,
          lng: dto.lng ?? null,
          district: dto.district ?? null,
          city: dto.city ?? null,
        },
      });
    }

    if (dto.courts && dto.courts.length > 0) {
      // Get the current courts for this venue (before deleting) to preserve their courtNumbers
      const currentCourts = await this.prisma.tournamentCourt.findMany({
        where: { tournamentVenueId: tournamentVenue.id },
        orderBy: { courtNumber: 'asc' },
      });

      // Get max courtNumber across the whole tournament BEFORE deletion
      const maxCourt = await this.prisma.tournamentCourt.aggregate({
        where: { tournamentId },
        _max: { courtNumber: true },
      });
      let nextCourtNumber = (maxCourt._max.courtNumber ?? 0) + 1;

      // Remove existing courts for this venue then recreate
      await this.prisma.tournamentCourt.deleteMany({
        where: { tournamentVenueId: tournamentVenue.id },
      });

      await this.prisma.tournamentCourt.createMany({
        data: dto.courts.map((c, index) => {
          // Reuse existing courtNumber for courts that already existed (by position)
          const existingCourtNumber = currentCourts[index]?.courtNumber;
          return {
            tournamentId,
            tournamentVenueId: tournamentVenue.id,
            courtNumber: existingCourtNumber ?? nextCourtNumber++,
            courtName: c.courtName,
          };
        }),
      });
    }

    return (this.prisma as any).tournamentVenue.findUnique({
      where: { id: tournamentVenue.id },
      include: {
        venue: true,
        courts: { orderBy: { courtNumber: 'asc' } },
      },
    });
  }

  async removeVenue(tournamentId: string, venueOrRecordId: string) {
    // Support both linked mode (venueId) and inline mode (tournamentVenue.id)
    const tournamentVenue = await (
      this.prisma as any
    ).tournamentVenue.findFirst({
      where: {
        tournamentId,
        OR: [{ venueId: venueOrRecordId }, { id: venueOrRecordId }],
      },
    });
    if (!tournamentVenue)
      throw new NotFoundException('Venue not linked to this tournament');

    // Hard-delete the courts that belonged to this venue so we don't leave
    // dangling "orphan" rows (tournamentVenueId = NULL). Match.courtId is
    // optional and will be set to NULL automatically by Prisma.
    await this.prisma.tournamentCourt.deleteMany({
      where: { tournamentVenueId: tournamentVenue.id },
    });

    await (this.prisma as any).tournamentVenue.delete({
      where: { id: tournamentVenue.id },
    });
    return { success: true };
  }

  /**
   * Throws if any TEAM-mode registration in the tournament has an incomplete
   * roster (pair missing or fewer than teamSize members). Used as the gate
   * before publishing a tournament.
   */
  private async assertNoIncompleteTeamRegistrations(tournamentId: string) {
    const registrations = await this.prisma.categoryRegistration.findMany({
      where: {
        category: { tournamentId, registrationMode: 'TEAM' },
      },
      include: {
        category: true,
        pair: { include: { members: true } },
      },
    });
    const incomplete = registrations.find(
      (registration) =>
        !registration.pair ||
        registration.pair.members.length < registration.category.teamSize
    );
    if (incomplete) {
      throw new BadRequestException(
        'Team roster is incomplete. Add all required members before publishing the tournament.'
      );
    }
  }

  async getPlayers(tournamentId: string) {
    return this.prisma.tournamentPlayer.findMany({
      where: { tournamentId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, image: true } },
        _count: { select: { registrations: true, pairMembers: true } },
      },
    });
  }

  async createPlayer(
    tournamentId: string,
    dto: CreateTournamentPlayerDto,
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
      scope: 'PARTICIPANTS',
    });

    if (!dto.name || dto.name.trim() === '') {
      throw new BadRequestException('Player name is required');
    }

    return this.prisma.tournamentPlayer.create({
      data: {
        tournamentId,
        name: dto.name,
        code: dto.code,
        email: dto.email,
        phone: dto.phone,
        gender: dto.gender,
        level: dto.level,
        levelDescription: dto.levelDescription,
        userId: dto.userId,
      },
    });
  }

  private normalizePlayerImportText(value?: string | null) {
    return typeof value === 'string' ? value.trim() : '';
  }

  private normalizePlayerImportKey(value?: string | null) {
    return this.normalizePlayerImportText(value).toLocaleLowerCase('vi-VN');
  }

  private normalizeTournamentPlayerGender(value?: string | null) {
    const raw = this.normalizePlayerImportText(value);
    if (!raw) return undefined;

    const normalized = raw
      .toLocaleLowerCase('vi-VN')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z]/g, '');

    if (normalized === 'male' || normalized === 'm' || normalized === 'nam') {
      return Gender.MALE;
    }
    if (normalized === 'female' || normalized === 'f' || normalized === 'nu') {
      return Gender.FEMALE;
    }
    if (normalized === 'other' || normalized === 'khac') {
      return Gender.OTHER;
    }
    if (
      normalized === 'prefernottosay' ||
      normalized === 'khongtietlo' ||
      normalized === 'khongmuontietlo'
    ) {
      return Gender.PREFER_NOT_TO_SAY;
    }

    return null;
  }

  private nextTournamentPlayerCode(usedCodes: Set<string>) {
    let maxNumber = 0;
    for (const code of usedCodes) {
      const match = /^VDV(\d+)$/i.exec(code);
      if (!match) continue;
      maxNumber = Math.max(maxNumber, Number(match[1]));
    }

    let nextNumber = maxNumber + 1;
    let nextCode = `VDV${String(nextNumber).padStart(3, '0')}`;
    while (usedCodes.has(nextCode.toLocaleLowerCase('vi-VN'))) {
      nextNumber += 1;
      nextCode = `VDV${String(nextNumber).padStart(3, '0')}`;
    }
    usedCodes.add(nextCode.toLocaleLowerCase('vi-VN'));
    return nextCode;
  }

  private validateBulkTournamentPlayerRows(
    rows: BulkTournamentPlayerRowDto[],
    existingPlayers: { code: string | null; name: string }[]
  ) {
    const existingCodeKeys = new Set(
      existingPlayers
        .map((player) => this.normalizePlayerImportKey(player.code))
        .filter(Boolean)
    );
    const existingNameKeys = new Set(
      existingPlayers
        .map((player) => this.normalizePlayerImportKey(player.name))
        .filter(Boolean)
    );
    const allCodeKeys = new Set(existingCodeKeys);
    const batchCodeKeys = new Set<string>();
    const batchNameKeys = new Set<string>();

    const previewRows = rows.map((row, index) => {
      const errors: string[] = [];
      const name = this.normalizePlayerImportText(row.name);
      const phone = this.normalizePlayerImportText(row.phone) || undefined;
      const inputCode = this.normalizePlayerImportText(row.code);
      const code = inputCode || this.nextTournamentPlayerCode(allCodeKeys);
      const codeKey = this.normalizePlayerImportKey(code);
      const nameKey = this.normalizePlayerImportKey(name);
      const gender = this.normalizeTournamentPlayerGender(row.gender);

      if (!name) {
        errors.push('Tên người chơi là bắt buộc');
      }
      if (gender === null) {
        errors.push('Giới tính không hợp lệ');
      }
      if (codeKey) {
        if (existingCodeKeys.has(codeKey)) {
          errors.push('Mã đã tồn tại trong giải đấu');
        }
        if (batchCodeKeys.has(codeKey)) {
          errors.push('Mã bị trùng trong danh sách import');
        }
        batchCodeKeys.add(codeKey);
        allCodeKeys.add(codeKey);
      }
      if (nameKey) {
        if (existingNameKeys.has(nameKey)) {
          errors.push('Tên đã tồn tại trong giải đấu');
        }
        if (batchNameKeys.has(nameKey)) {
          errors.push('Tên bị trùng trong danh sách import');
        }
        batchNameKeys.add(nameKey);
      }

      return {
        lineNumber: row.lineNumber ?? index + 1,
        code,
        name,
        gender: gender ?? undefined,
        phone,
        valid: errors.length === 0,
        errors,
      };
    });

    return {
      rows: previewRows,
      canCreate:
        previewRows.length > 0 && previewRows.every((row) => row.valid),
      total: previewRows.length,
      validCount: previewRows.filter((row) => row.valid).length,
      errorCount: previewRows.filter((row) => !row.valid).length,
    };
  }

  async previewBulkPlayers(
    tournamentId: string,
    dto: BulkTournamentPlayersDto,
    userId: string,
    role?: string
  ) {
    await this.assertTournamentOwnership(
      tournamentId,
      userId,
      role,
      'PARTICIPANTS'
    );
    const existingPlayers = await this.prisma.tournamentPlayer.findMany({
      where: { tournamentId },
      select: { code: true, name: true },
    });

    return this.validateBulkTournamentPlayerRows(dto.rows, existingPlayers);
  }

  async createBulkPlayers(
    tournamentId: string,
    dto: BulkTournamentPlayersDto,
    userId: string,
    role?: string
  ) {
    await this.assertTournamentOwnership(
      tournamentId,
      userId,
      role,
      'PARTICIPANTS'
    );
    const existingPlayers = await this.prisma.tournamentPlayer.findMany({
      where: { tournamentId },
      select: { code: true, name: true },
    });
    const validation = this.validateBulkTournamentPlayerRows(
      dto.rows,
      existingPlayers
    );

    if (!validation.canCreate) {
      throw new BadRequestException({
        message: 'Bulk import contains invalid rows',
        ...validation,
      });
    }

    const createdPlayers = await this.prisma.$transaction(
      validation.rows.map((row) =>
        this.prisma.tournamentPlayer.create({
          data: {
            tournamentId,
            code: row.code,
            name: row.name,
            gender: row.gender,
            phone: row.phone,
          },
        })
      )
    );

    return {
      count: createdPlayers.length,
      players: createdPlayers,
    };
  }

  async getPlayer(id: string) {
    const player = await this.prisma.tournamentPlayer.findUnique({
      where: { id },
    });
    if (!player) throw new NotFoundException('Player not found');
    return player;
  }

  async getPlayerMatches(id: string) {
    return this.prisma.categoryMatch.findMany({
      where: {
        participants: {
          some: {
            categoryRegistration: {
              OR: [
                { player: { id } },
                { pair: { members: { some: { playerId: id } } } },
              ],
            },
          },
        },
      },
      include: {
        category: true,
        court: true,
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
      },
    });
  }

  private async assertTournamentOwnership(
    tournamentId: string,
    userId: string,
    role: string | undefined,
    scope: ManageScope
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
      scope,
    });
    return tournament;
  }

  private async validatePairPlayers(tournamentId: string, playerIds: string[]) {
    const players = await this.prisma.tournamentPlayer.findMany({
      where: { id: { in: playerIds }, tournamentId },
    });
    if (players.length !== playerIds.length) {
      throw new BadRequestException(
        'All pair members must belong to this tournament'
      );
    }
  }

  async getPairs(tournamentId: string) {
    return this.prisma.tournamentPair.findMany({
      where: { tournamentId },
      include: {
        members: {
          include: { player: true },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPair(
    tournamentId: string,
    dto: SaveTournamentPairDto,
    userId: string,
    role?: string
  ) {
    await this.assertTournamentOwnership(
      tournamentId,
      userId,
      role,
      'PARTICIPANTS'
    );
    await this.validatePairPlayers(tournamentId, dto.playerIds);
    return this.prisma.tournamentPair.create({
      data: {
        tournamentId,
        name: dto.name,
        type: dto.type as any,
        notes: dto.notes,
        members: {
          create: dto.playerIds.map((playerId, index) => ({
            playerId,
            position: index + 1,
          })),
        },
      },
      include: {
        members: {
          include: { player: true },
          orderBy: { position: 'asc' },
        },
      },
    });
  }

  async getPair(id: string) {
    const pair = await this.prisma.tournamentPair.findUnique({
      where: { id },
      include: {
        members: {
          include: { player: true },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!pair) throw new NotFoundException('Pair not found');
    return pair;
  }

  async updatePair(
    id: string,
    dto: SaveTournamentPairDto,
    userId: string,
    role?: string
  ) {
    const pair = await this.getPair(id);
    await this.assertTournamentOwnership(
      pair.tournamentId,
      userId,
      role,
      'PARTICIPANTS'
    );
    await this.validatePairPlayers(pair.tournamentId, dto.playerIds);
    return this.prisma.$transaction(async (tx) => {
      await tx.tournamentPairMember.deleteMany({ where: { pairId: id } });
      return tx.tournamentPair.update({
        where: { id },
        data: {
          name: dto.name,
          type: dto.type as any,
          notes: dto.notes,
          members: {
            create: dto.playerIds.map((playerId, index) => ({
              playerId,
              position: index + 1,
            })),
          },
        },
        include: {
          members: {
            include: { player: true },
            orderBy: { position: 'asc' },
          },
        },
      });
    });
  }

  async deletePair(id: string, userId: string, role?: string) {
    const pair = await this.getPair(id);
    await this.assertTournamentOwnership(
      pair.tournamentId,
      userId,
      role,
      'PARTICIPANTS'
    );
    await this.prisma.tournamentPair.delete({ where: { id } });
    return { message: 'Pair deleted successfully' };
  }

  async getPairMatches(id: string) {
    await this.getPair(id);
    return this.prisma.categoryMatch.findMany({
      where: {
        participants: {
          some: { categoryRegistration: { tournamentPairId: id } },
        },
      },
      include: {
        category: true,
        court: true,
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
      },
    });
  }

  async updatePlayer(
    id: string,
    dto: UpdateTournamentPlayerDto,
    userId: string,
    role?: string
  ) {
    const player = await this.getPlayer(id);
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: player.tournamentId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    await this.access.assertManageAccess({
      tournamentId: player.tournamentId,
      hostId: tournament.hostId,
      userId,
      role,
      scope: 'PARTICIPANTS',
    });

    return this.prisma.tournamentPlayer.update({
      where: { id },
      data: dto,
    });
  }

  async deletePlayer(id: string, userId: string, role?: string) {
    const player = await this.getPlayer(id);
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: player.tournamentId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    await this.access.assertManageAccess({
      tournamentId: player.tournamentId,
      hostId: tournament.hostId,
      userId,
      role,
      scope: 'PARTICIPANTS',
    });

    await this.prisma.tournamentPlayer.delete({ where: { id } });
    return { message: 'Player deleted successfully' };
  }
}
