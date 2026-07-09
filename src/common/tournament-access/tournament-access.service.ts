import { ForbiddenException, Injectable } from '@nestjs/common';
import { TournamentPermission } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** A scoped management capability a host can grant to a tournament manager. */
export type ManageScope = TournamentPermission;

export interface ManageAccessParams {
  tournamentId: string;
  hostId: string;
  userId: string;
  role?: string;
  scope: ManageScope;
}

/**
 * Central authorization for tournament management. The host and system admins
 * implicitly have every scope; any other user must be an assigned
 * TournamentManager that was granted the specific scope.
 *
 * Callers already hold the tournament's hostId (every ownership helper fetches
 * it), so the manager table is only queried when the cheap host/admin check
 * fails.
 */
@Injectable()
export class TournamentAccessService {
  constructor(private prisma: PrismaService) {}

  async hasManageAccess(params: ManageAccessParams): Promise<boolean> {
    const { tournamentId, hostId, userId, role, scope } = params;
    if (this.isHostOrAdmin(hostId, userId, role)) return true;
    const manager = await this.prisma.tournamentManager.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
      select: { permissions: true },
    });
    return !!manager && manager.permissions.includes(scope);
  }

  async assertManageAccess(params: ManageAccessParams): Promise<void> {
    if (!(await this.hasManageAccess(params))) {
      throw new ForbiddenException(
        'You do not have permission to manage this tournament'
      );
    }
  }

  /** Host or system admin only — for settings, deletion, and the manager list. */
  isHostOrAdmin(hostId: string, userId: string, role?: string): boolean {
    return role === 'ADMIN' || hostId === userId;
  }

  assertHostOrAdmin(hostId: string, userId: string, role?: string): void {
    if (!this.isHostOrAdmin(hostId, userId, role)) {
      throw new ForbiddenException('You can only manage your own tournaments');
    }
  }
}
