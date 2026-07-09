import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Central authorization for session management. Only the session host (or a
 * system admin) may run host-side actions: mutating players, courts, matches,
 * session status, wait times, etc.
 *
 * Each assert resolves the owning session from the entity id, so controllers
 * can guard routes keyed by sessionId, playerId, courtId, or matchId alike.
 */
@Injectable()
export class SessionAccessService {
  constructor(private prisma: PrismaService) {}

  isHostOrAdmin(hostId: string, userId: string, role?: string): boolean {
    return role === 'ADMIN' || hostId === userId;
  }

  async assertSessionHost(
    sessionId: string,
    userId: string,
    role?: string
  ): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { hostId: true },
    });
    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }
    this.assertHostOrAdmin(session.hostId, userId, role);
  }

  async assertSessionsHost(
    sessionIds: string[],
    userId: string,
    role?: string
  ): Promise<void> {
    if (role === 'ADMIN' || sessionIds.length === 0) return;
    const notOwned = await this.prisma.session.count({
      where: { id: { in: sessionIds }, hostId: { not: userId } },
    });
    if (notOwned > 0) {
      throw new ForbiddenException(
        'Only the session host can perform this action'
      );
    }
  }

  async assertPlayerSessionHost(
    playerId: string,
    userId: string,
    role?: string
  ): Promise<void> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { session: { select: { hostId: true } } },
    });
    if (!player) {
      throw new NotFoundException(`Player with ID ${playerId} not found`);
    }
    this.assertHostOrAdmin(player.session.hostId, userId, role);
  }

  /**
   * Allows the session host/admin, or the user the player record is linked
   * to (players may withdraw/update their own registration).
   */
  async assertPlayerSelfOrSessionHost(
    playerId: string,
    userId: string,
    role?: string
  ): Promise<void> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { userId: true, session: { select: { hostId: true } } },
    });
    if (!player) {
      throw new NotFoundException(`Player with ID ${playerId} not found`);
    }
    if (player.userId === userId) return;
    this.assertHostOrAdmin(player.session.hostId, userId, role);
  }

  async assertCourtSessionHost(
    courtId: string,
    userId: string,
    role?: string
  ): Promise<void> {
    const court = await this.prisma.court.findUnique({
      where: { id: courtId },
      select: { session: { select: { hostId: true } } },
    });
    if (!court) {
      throw new NotFoundException(`Court with ID ${courtId} not found`);
    }
    this.assertHostOrAdmin(court.session.hostId, userId, role);
  }

  async assertMatchSessionHost(
    matchId: string,
    userId: string,
    role?: string
  ): Promise<void> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { session: { select: { hostId: true } } },
    });
    if (!match) {
      throw new NotFoundException(`Match with ID ${matchId} not found`);
    }
    this.assertHostOrAdmin(match.session.hostId, userId, role);
  }

  assertHostOrAdmin(hostId: string, userId: string, role?: string): void {
    if (!this.isHostOrAdmin(hostId, userId, role)) {
      throw new ForbiddenException(
        'Only the session host can perform this action'
      );
    }
  }
}
