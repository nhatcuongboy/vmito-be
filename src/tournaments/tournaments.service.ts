/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import {
  CreateTournamentPlayerDto,
  UpdateTournamentPlayerDto,
} from './dto/create-tournament-player.dto';
import { ScoreboardQueryDto } from './dto/scoreboard-query.dto';
import { SaveTournamentPairDto } from './dto/tournament-pair.dto';
import { TournamentStatus, ScheduleType, MatchStatus } from '@prisma/client';
import { MATCH_SCORING_INCLUDE } from '../categories/scoring/match-include';
import { normalizeMatchForBroadcast } from '../categories/scoring/normalize-match';

@Injectable()
export class TournamentsService {
  constructor(private prisma: PrismaService) {}

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

  async findMyTournaments(hostId: string) {
    return this.prisma.tournament.findMany({
      where: { hostId },
      include: {
        _count: {
          select: { categories: true, players: true, pairs: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll() {
    const tournaments = await this.prisma.tournament.findMany({
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

    return tournaments;
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
    const { name, startDate, endDate, venueId } = dto;

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
        slug,
        startDate: start,
        endDate: end,
        hostId,
        venueId: venueId || undefined,
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
      startDate?: Date;
      endDate?: Date;
      status?: TournamentStatus;
      isPublished?: boolean;
      scheduleType?: ScheduleType;
      venueId?: string;
    } = {};

    if (dto.name !== undefined) {
      updateData.name = dto.name;
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

    if (dto.isPublished !== undefined) {
      updateData.isPublished = dto.isPublished;
    }

    if (dto.scheduleType !== undefined) {
      updateData.scheduleType = dto.scheduleType as ScheduleType;
    }

    if (dto.venueId !== undefined) {
      updateData.venueId = dto.venueId;
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

    return this.prisma.categoryMatch.findMany({
      where: {
        category: { tournamentId },
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
        category: true,
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
        venue: true,
        courts: { orderBy: { courtNumber: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addVenue(
    tournamentId: string,
    dto: {
      venueId: string;
      courts?: { courtNumber: number; courtName?: string }[];
    }
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    const venue = await this.prisma.venue.findUnique({
      where: { id: dto.venueId },
    });
    if (!venue) throw new NotFoundException('Venue not found');

    // Upsert: if already linked, update courts; otherwise create
    const existing = await (this.prisma as any).tournamentVenue.findUnique({
      where: { tournamentId_venueId: { tournamentId, venueId: dto.venueId } },
    });

    let tournamentVenue: any;
    if (existing) {
      tournamentVenue = existing;
    } else {
      tournamentVenue = await (this.prisma as any).tournamentVenue.create({
        data: { tournamentId, venueId: dto.venueId },
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

  async removeVenue(tournamentId: string, venueId: string) {
    const tournamentVenue = await (
      this.prisma as any
    ).tournamentVenue.findUnique({
      where: { tournamentId_venueId: { tournamentId, venueId } },
    });
    if (!tournamentVenue)
      throw new NotFoundException('Venue not linked to this tournament');

    // Courts with this venueId get tournamentVenueId set to null (SET NULL cascade)
    // Then delete the junction record
    await (this.prisma as any).tournamentVenue.delete({
      where: { id: tournamentVenue.id },
    });
    return { success: true };
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
    if (tournament.hostId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You can only modify your own tournaments');
    }

    if (!dto.name || dto.name.trim() === '') {
      throw new BadRequestException('Player name is required');
    }

    return this.prisma.tournamentPlayer.create({
      data: {
        tournamentId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        gender: dto.gender,
        level: dto.level,
        levelDescription: dto.levelDescription,
        userId: dto.userId,
      },
    });
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
    role?: string
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    if (tournament.hostId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You can only modify your own tournaments');
    }
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
    await this.assertTournamentOwnership(tournamentId, userId, role);
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
    await this.assertTournamentOwnership(pair.tournamentId, userId, role);
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
    await this.assertTournamentOwnership(pair.tournamentId, userId, role);
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
    if (tournament?.hostId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You can only modify your own tournaments');
    }

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
    if (tournament?.hostId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You can only modify your own tournaments');
    }

    await this.prisma.tournamentPlayer.delete({ where: { id } });
    return { message: 'Player deleted successfully' };
  }
}
