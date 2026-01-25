import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { CategoryType, TournamentStatus } from '@prisma/client';

@Injectable()
export class TournamentsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const tournaments = await this.prisma.tournament.findMany({
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
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

  async findOne(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
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
    const {
      name,
      startDate,
      endDate,
      categories,
      umpires = [],
      scoringDevices = [],
      courts = [],
    } = dto;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date format');
    }

    if (start >= end) {
      throw new BadRequestException('End date must be after start date');
    }

    if (!categories || categories.length === 0) {
      throw new BadRequestException('At least one category is required');
    }

    const tournament = await this.prisma.tournament.create({
      data: {
        name,
        startDate: start,
        endDate: end,
        hostId,
        status: 'PREPARING',
        categories: {
          create: categories.map((cat) => ({
            name: cat.name,
            type: cat.type as CategoryType,
          })),
        },
        umpires: {
          create: umpires.map((umpire) => ({
            name: umpire.name,
            email: umpire.email,
            phone: umpire.phone,
          })),
        },
        scoringDevices: {
          create: scoringDevices.map((device) => ({
            name: device.name,
            deviceType: device.deviceType,
          })),
        },
        courts: {
          create: courts.map((court) => ({
            courtNumber: court.courtNumber,
            courtName: court.courtName,
          })),
        },
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
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

    // Validate date range
    const finalStartDate = updateData.startDate ?? existingTournament.startDate;
    const finalEndDate = updateData.endDate ?? existingTournament.endDate;
    if (finalStartDate >= finalEndDate) {
      throw new BadRequestException('End date must be after start date');
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
}
