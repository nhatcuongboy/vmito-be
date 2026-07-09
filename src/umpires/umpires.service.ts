import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUmpireDto } from './dto/create-umpire.dto';
import { UpdateUmpireDto } from './dto/update-umpire.dto';
import { LinkUmpireAccountDto } from './dto/link-umpire-account.dto';
import {
  TournamentAccessService,
  ManageScope,
} from '../common/tournament-access/tournament-access.service';

const umpireInclude = {
  user: { select: { id: true, name: true, email: true, image: true } },
} as const;

@Injectable()
export class UmpiresService {
  constructor(
    private prisma: PrismaService,
    private access: TournamentAccessService
  ) {}

  private async ensureTournamentHost(
    tournamentId: string,
    userId: string,
    role: string | undefined,
    scope: ManageScope
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, hostId: true },
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

  private async getUmpireWithOwnership(
    umpireId: string,
    userId: string,
    role: string | undefined,
    scope: ManageScope
  ) {
    const umpire = await this.prisma.tournamentUmpire.findUnique({
      where: { id: umpireId },
      include: { tournament: { select: { hostId: true } } },
    });
    if (!umpire) throw new NotFoundException('Umpire not found');
    await this.access.assertManageAccess({
      tournamentId: umpire.tournamentId,
      hostId: umpire.tournament.hostId,
      userId,
      role,
      scope,
    });
    return umpire;
  }

  /**
   * Resolve a user account by email and promote a PLAYER to REFEREE so they can
   * access the referee scoring screens. Returns the linked userId or null when
   * no account exists yet (the umpire stays unlinked until that person registers).
   */
  private async resolveAndPromoteUser(
    email?: string | null
  ): Promise<string | null> {
    if (!email) return null;
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    });
    if (!user) return null;
    if (user.role === 'PLAYER') {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { role: 'REFEREE' },
      });
    }
    return user.id;
  }

  async list(tournamentId: string, userId: string, role?: string) {
    await this.ensureTournamentHost(tournamentId, userId, role, 'SCHEDULE');
    return this.prisma.tournamentUmpire.findMany({
      where: { tournamentId },
      include: umpireInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(
    tournamentId: string,
    dto: CreateUmpireDto,
    userId: string,
    role?: string
  ) {
    await this.ensureTournamentHost(tournamentId, userId, role, 'SCHEDULE');
    const linkedUserId = await this.resolveAndPromoteUser(dto.email);
    return this.prisma.tournamentUmpire.create({
      data: {
        tournamentId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        notes: dto.notes,
        userId: linkedUserId,
      },
      include: umpireInclude,
    });
  }

  async update(
    umpireId: string,
    dto: UpdateUmpireDto,
    userId: string,
    role?: string
  ) {
    const umpire = await this.getUmpireWithOwnership(
      umpireId,
      userId,
      role,
      'SCHEDULE'
    );
    // Re-resolve the linked account only when the email actually changes.
    let userIdUpdate: string | null | undefined = undefined;
    if (dto.email !== undefined && dto.email !== umpire.email) {
      userIdUpdate = await this.resolveAndPromoteUser(dto.email);
    }
    return this.prisma.tournamentUmpire.update({
      where: { id: umpireId },
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        notes: dto.notes,
        ...(userIdUpdate !== undefined && { userId: userIdUpdate }),
      },
      include: umpireInclude,
    });
  }

  async remove(umpireId: string, userId: string, role?: string) {
    await this.getUmpireWithOwnership(umpireId, userId, role, 'SCHEDULE');
    await this.prisma.tournamentUmpire.delete({ where: { id: umpireId } });
    return { id: umpireId };
  }

  async linkAccount(
    umpireId: string,
    dto: LinkUmpireAccountDto,
    userId: string,
    role?: string
  ) {
    await this.getUmpireWithOwnership(umpireId, userId, role, 'SCHEDULE');
    const linkedUserId = await this.resolveAndPromoteUser(dto.email);
    if (!linkedUserId) {
      throw new BadRequestException(
        'No user account found with that email. Ask the referee to register first.'
      );
    }
    return this.prisma.tournamentUmpire.update({
      where: { id: umpireId },
      data: { userId: linkedUserId, email: dto.email },
      include: umpireInclude,
    });
  }

  async unlinkAccount(umpireId: string, userId: string, role?: string) {
    await this.getUmpireWithOwnership(umpireId, userId, role, 'SCHEDULE');
    return this.prisma.tournamentUmpire.update({
      where: { id: umpireId },
      data: { userId: null },
      include: umpireInclude,
    });
  }
}
