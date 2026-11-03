import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogAction,
  Prisma,
  SessionPermission,
  SessionStatus,
} from '@prisma/client';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { PrismaService } from '../../prisma/prisma.service';

/** A scoped management capability a host can grant to a co-host. */
export type SessionScope = SessionPermission;

/** The session fields every scoped check needs. */
export interface SessionAccessRef {
  id: string;
  hostId: string;
  status: SessionStatus;
}

export interface SessionMyAccess {
  isHost: boolean;
  isAdmin: boolean;
  isManager: boolean;
  /** Scopes usable right now, so already narrowed for an ended session. */
  permissions: SessionPermission[];
}

const SESSION_REF_SELECT = { id: true, hostId: true, status: true } as const;

const ENDED_STATUSES: SessionStatus[] = ['FINISHED', 'CANCELLED'];

/**
 * Central authorization for session management.
 *
 * Two levels, on purpose:
 * - `assertSessionHost` and friends are owner-only (host or system admin).
 * - `assertSessionAccess` and friends take a required scope, and also admit a
 *   SessionManager granted that scope. No scope may default: an unscoped
 *   delegated check is how a permission silently goes unenforced.
 *
 * Once a session has ended a co-host keeps FINANCE alone, to collect what is
 * still owed. Everything else turns read-only for them.
 *
 * Each assert resolves the owning session from the entity id, so controllers
 * can guard routes keyed by sessionId, playerId, courtId, or matchId alike.
 */
@Injectable()
export class SessionAccessService {
  constructor(
    private prisma: PrismaService,
    private auditLogs: AuditLogsService
  ) {}

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

  async hasAccess(
    session: SessionAccessRef,
    userId: string,
    role: string | undefined,
    scope: SessionScope
  ): Promise<boolean> {
    if (this.isHostOrAdmin(session.hostId, userId, role)) return true;
    const manager = await this.prisma.sessionManager.findUnique({
      where: { sessionId_userId: { sessionId: session.id, userId } },
      select: { permissions: true },
    });
    return (
      !!manager &&
      this.usablePermissions(manager.permissions, session.status).includes(
        scope
      )
    );
  }

  /**
   * For callers that already hold the session. `audit` names the action when
   * it should leave a trail: only a co-host's actions are recorded, because
   * hostId already attributes the host's own.
   */
  async assertAccess(
    session: SessionAccessRef,
    userId: string,
    role: string | undefined,
    scope: SessionScope,
    audit?: string
  ): Promise<void> {
    if (!(await this.hasAccess(session, userId, role, scope))) {
      throw new ForbiddenException(
        'You do not have permission to manage this session'
      );
    }
    if (audit) this.recordDelegatedAction(session, userId, role, audit);
  }

  async assertSessionAccess(
    sessionId: string,
    userId: string,
    role: string | undefined,
    scope: SessionScope,
    audit?: string
  ): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: SESSION_REF_SELECT,
    });
    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }
    await this.assertAccess(session, userId, role, scope, audit);
  }

  async assertPlayerSessionAccess(
    playerId: string,
    userId: string,
    role: string | undefined,
    scope: SessionScope
  ): Promise<void> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { session: { select: SESSION_REF_SELECT } },
    });
    if (!player) {
      throw new NotFoundException(`Player with ID ${playerId} not found`);
    }
    await this.assertAccess(player.session, userId, role, scope);
  }

  /** Scoped form of {@link assertPlayerSelfOrSessionHost}. */
  async assertPlayerSelfOrSessionAccess(
    playerId: string,
    userId: string,
    role: string | undefined,
    scope: SessionScope
  ): Promise<void> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { userId: true, session: { select: SESSION_REF_SELECT } },
    });
    if (!player) {
      throw new NotFoundException(`Player with ID ${playerId} not found`);
    }
    if (player.userId === userId) return;
    await this.assertAccess(player.session, userId, role, scope);
  }

  /**
   * Deleting a player cascades to their PaymentRecord, so removing someone
   * whose payment was already approved erases money the host received. That
   * takes SESSION; any other removal is a PLAYERS action.
   */
  async assertPlayerRemovalAccess(
    playerId: string,
    userId: string,
    role?: string
  ): Promise<void> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: {
        userId: true,
        paymentRecord: { select: { status: true } },
        session: { select: SESSION_REF_SELECT },
      },
    });
    if (!player) {
      throw new NotFoundException(`Player with ID ${playerId} not found`);
    }
    if (player.userId === userId) return;
    const scope =
      player.paymentRecord?.status === 'APPROVED' ? 'SESSION' : 'PLAYERS';
    await this.assertAccess(
      player.session,
      userId,
      role,
      scope,
      'player.remove'
    );
  }

  async assertCourtSessionAccess(
    courtId: string,
    userId: string,
    role: string | undefined,
    scope: SessionScope
  ): Promise<void> {
    const court = await this.prisma.court.findUnique({
      where: { id: courtId },
      select: { session: { select: SESSION_REF_SELECT } },
    });
    if (!court) {
      throw new NotFoundException(`Court with ID ${courtId} not found`);
    }
    await this.assertAccess(court.session, userId, role, scope);
  }

  async assertMatchSessionAccess(
    matchId: string,
    userId: string,
    role: string | undefined,
    scope: SessionScope,
    audit?: string
  ): Promise<void> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { session: { select: SESSION_REF_SELECT } },
    });
    if (!match) {
      throw new NotFoundException(`Match with ID ${matchId} not found`);
    }
    await this.assertAccess(match.session, userId, role, scope, audit);
  }

  /**
   * Money lands in the host's account, so a co-host approving their own
   * payment or registration is the obvious fraud path, whatever scopes they
   * hold. `ownerIds` are the accounts the record belongs to.
   */
  assertNotOwnRecord(
    hostId: string,
    userId: string,
    role: string | undefined,
    ownerIds: Array<string | null | undefined>
  ): void {
    if (this.isHostOrAdmin(hostId, userId, role)) return;
    if (ownerIds.includes(userId)) {
      throw new ForbiddenException('A co-host cannot approve their own record');
    }
  }

  /** {@link assertNotOwnRecord} for callers that do not hold the session. */
  async assertNotOwnSessionRecord(
    sessionId: string,
    userId: string,
    role: string | undefined,
    ownerIds: Array<string | null | undefined>
  ): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { hostId: true },
    });
    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }
    this.assertNotOwnRecord(session.hostId, userId, role, ownerIds);
  }

  async getMyAccess(
    sessionId: string,
    userId: string,
    role?: string
  ): Promise<SessionMyAccess> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: SESSION_REF_SELECT,
    });
    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }
    const isHost = session.hostId === userId;
    const isAdmin = role === 'ADMIN';
    if (isHost || isAdmin) {
      return {
        isHost,
        isAdmin,
        isManager: false,
        permissions: Object.values(SessionPermission),
      };
    }
    const manager = await this.prisma.sessionManager.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
      select: { permissions: true },
    });
    return {
      isHost,
      isAdmin,
      isManager: !!manager,
      permissions: manager
        ? this.usablePermissions(manager.permissions, session.status)
        : [],
    };
  }

  /** Any grant at all: enough to see an internal session. */
  async isManager(sessionId: string, userId: string): Promise<boolean> {
    const manager = await this.prisma.sessionManager.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
      select: { id: true },
    });
    return !!manager;
  }

  /** Sessions a user owns, or co-hosts with `scope` while they are live. */
  managedSessionWhere(
    userId: string,
    scope: SessionScope
  ): Prisma.SessionWhereInput {
    return {
      OR: [
        { hostId: userId },
        {
          status: { notIn: ENDED_STATUSES },
          managers: { some: { userId, permissions: { has: scope } } },
        },
      ],
    };
  }

  /** The host plus every co-host holding `scope`, for notifications. */
  async recipients(
    session: { id: string; hostId: string },
    scope: SessionScope
  ): Promise<string[]> {
    const managers = await this.prisma.sessionManager.findMany({
      where: { sessionId: session.id, permissions: { has: scope } },
      select: { userId: true },
    });
    return [session.hostId, ...managers.map((manager) => manager.userId)];
  }

  private usablePermissions(
    permissions: SessionPermission[],
    status: SessionStatus
  ): SessionPermission[] {
    return ENDED_STATUSES.includes(status)
      ? permissions.filter((permission) => permission === 'FINANCE')
      : permissions;
  }

  private recordDelegatedAction(
    session: SessionAccessRef,
    userId: string,
    role: string | undefined,
    action: string
  ): void {
    if (this.isHostOrAdmin(session.hostId, userId, role)) return;
    void this.auditLogs.create({
      action: AuditLogAction.OTHER,
      entity: 'Session',
      entityId: session.id,
      userId,
      details: { delegatedAction: action, hostId: session.hostId },
    });
  }
}
