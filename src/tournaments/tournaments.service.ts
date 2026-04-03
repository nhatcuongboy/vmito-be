import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { TournamentStatus } from '@prisma/client';

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

    // Validate date range only when dates are being changed
    if (updateData.startDate || updateData.endDate) {
      const finalStartDate = updateData.startDate ?? existingTournament.startDate;
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

  // --- Player Management ---
  async getPlayers(tournamentId: string) {
    return this.prisma.tournamentPlayer.findMany({
      where: { tournamentId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, image: true } }
      }
    });
  }

  async createPlayer(tournamentId: string, dto: any, userId: string, role?: string) {
    const tournament = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) throw new NotFoundException('Tournament not found');
    if (tournament.hostId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You can only modify your own tournaments');
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
      }
    });
  }

  async getPlayer(id: string) {
    const player = await this.prisma.tournamentPlayer.findUnique({ where: { id } });
    if (!player) throw new NotFoundException('Player not found');
    return player;
  }

  async getPlayerMatches(id: string) {
    return this.prisma.categoryMatch.findMany({
      where: {
        participants: {
          some: {
            categoryRegistration: {
              player: { id } // matches where this player is participating directly
            }
          }
        }
      },
      include: { category: true }
    });
  }

  async updatePlayer(id: string, dto: any, userId: string, role?: string) {
    const player = await this.getPlayer(id);
    const tournament = await this.prisma.tournament.findUnique({ where: { id: player.tournamentId } });
    if (tournament?.hostId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You can only modify your own tournaments');
    }

    return this.prisma.tournamentPlayer.update({
      where: { id },
      data: dto
    });
  }

  async deletePlayer(id: string, userId: string, role?: string) {
    const player = await this.getPlayer(id);
    const tournament = await this.prisma.tournament.findUnique({ where: { id: player.tournamentId } });
    if (tournament?.hostId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You can only modify your own tournaments');
    }

    await this.prisma.tournamentPlayer.delete({ where: { id } });
    return { message: 'Player deleted successfully' };
  }
}
