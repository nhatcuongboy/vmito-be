import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentAccessService } from '../common/tournament-access/tournament-access.service';
import { CreateTournamentManagerDto } from './dto/create-tournament-manager.dto';
import { UpdateTournamentManagerDto } from './dto/update-tournament-manager.dto';

const managerInclude = {
  user: { select: { id: true, name: true, email: true, image: true } },
} as const;

/**
 * Managing the manager list (add/remove/change permissions) is restricted to the
 * tournament host and system admins — a manager cannot escalate by adding others.
 */
@Injectable()
export class TournamentManagersService {
  constructor(
    private prisma: PrismaService,
    private access: TournamentAccessService
  ) {}

  private async assertHostOrAdmin(
    tournamentId: string,
    userId: string,
    role?: string
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, hostId: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    this.access.assertHostOrAdmin(tournament.hostId, userId, role);
    return tournament;
  }

  async list(tournamentId: string, userId: string, role?: string) {
    await this.assertHostOrAdmin(tournamentId, userId, role);
    return this.prisma.tournamentManager.findMany({
      where: { tournamentId },
      include: managerInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  async add(
    tournamentId: string,
    dto: CreateTournamentManagerDto,
    userId: string,
    role?: string
  ) {
    const tournament = await this.assertHostOrAdmin(tournamentId, userId, role);

    const target = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.id === tournament.hostId) {
      throw new ConflictException('The host already manages this tournament');
    }

    const existing = await this.prisma.tournamentManager.findUnique({
      where: { tournamentId_userId: { tournamentId, userId: dto.userId } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'This user is already a manager of the tournament'
      );
    }

    return this.prisma.tournamentManager.create({
      data: {
        tournamentId,
        userId: dto.userId,
        permissions: dto.permissions,
        addedById: userId,
      },
      include: managerInclude,
    });
  }

  async updatePermissions(
    tournamentId: string,
    targetUserId: string,
    dto: UpdateTournamentManagerDto,
    userId: string,
    role?: string
  ) {
    await this.assertHostOrAdmin(tournamentId, userId, role);
    const existing = await this.prisma.tournamentManager.findUnique({
      where: { tournamentId_userId: { tournamentId, userId: targetUserId } },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Manager not found');

    return this.prisma.tournamentManager.update({
      where: { id: existing.id },
      data: { permissions: dto.permissions },
      include: managerInclude,
    });
  }

  async remove(
    tournamentId: string,
    targetUserId: string,
    userId: string,
    role?: string
  ) {
    await this.assertHostOrAdmin(tournamentId, userId, role);
    const existing = await this.prisma.tournamentManager.findUnique({
      where: { tournamentId_userId: { tournamentId, userId: targetUserId } },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Manager not found');

    await this.prisma.tournamentManager.delete({ where: { id: existing.id } });
    return { id: existing.id };
  }
}
