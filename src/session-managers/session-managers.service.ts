import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SessionPermission } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SessionAccessService } from '../common/session-access/session-access.service';
import {
  SessionEventType,
  SessionsGateway,
} from '../sessions/sessions.gateway';
import { CreateSessionManagerDto } from './dto/create-session-manager.dto';
import { CreateSessionManagerInviteDto } from './dto/create-session-manager-invite.dto';
import { UpdateSessionManagerDto } from './dto/update-session-manager.dto';

export const MAX_SESSION_MANAGERS = 3;

const INVITE_TTL_MS = 10 * 60 * 1000;

/**
 * A QR can be photographed, so it never carries money or irreversible rights.
 * A host wanting to hand those over picks the person by account, and can still
 * raise someone who joined by QR afterwards.
 */
const INVITE_PERMISSIONS: SessionPermission[] = ['COURTS', 'PLAYERS'];

const managerInclude = {
  user: { select: { id: true, name: true, email: true, image: true } },
} as const;

/**
 * Managing the co-host list (add/remove/change permissions, QR invites) is
 * restricted to the session host and system admins: a co-host cannot escalate
 * by adding others. A co-host may only remove themselves.
 */
@Injectable()
export class SessionManagersService {
  constructor(
    private prisma: PrismaService,
    private access: SessionAccessService,
    private notifications: NotificationsService,
    private gateway: SessionsGateway
  ) {}

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private async loadManagedSession(
    sessionId: string,
    userId: string,
    role?: string
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        name: true,
        hostId: true,
        status: true,
        isCrawled: true,
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    this.access.assertHostOrAdmin(session.hostId, userId, role);
    return session;
  }

  private assertGrantable(session: { status: string; isCrawled: boolean }) {
    if (session.isCrawled) {
      throw new ForbiddenException(
        'Crawled (vãng lai) sessions are view-only and cannot be modified.'
      );
    }
    if (session.status === 'FINISHED' || session.status === 'CANCELLED') {
      throw new BadRequestException('This session has already ended');
    }
  }

  /**
   * Shared by both grant paths. The advisory lock is what makes the cap hold:
   * two grants racing past a plain count would both pass it.
   */
  private async grant(
    tx: Prisma.TransactionClient,
    sessionId: string,
    userId: string,
    permissions: SessionPermission[],
    addedById: string
  ) {
    await tx.$queryRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))::text AS lock_result',
      `session-managers:${sessionId}`
    );
    const existing = await tx.sessionManager.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('This user is already a co-host');
    }
    const count = await tx.sessionManager.count({ where: { sessionId } });
    if (count >= MAX_SESSION_MANAGERS) {
      throw new ConflictException({
        code: 'SESSION_MANAGER_LIMIT',
        message: `A session can have at most ${MAX_SESSION_MANAGERS} co-hosts`,
      });
    }
    return tx.sessionManager.create({
      data: { sessionId, userId, permissions, addedById },
      include: managerInclude,
    });
  }

  async list(sessionId: string, userId: string, role?: string) {
    await this.loadManagedSession(sessionId, userId, role);
    return this.prisma.sessionManager.findMany({
      where: { sessionId },
      include: managerInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  async add(
    sessionId: string,
    dto: CreateSessionManagerDto,
    userId: string,
    role?: string
  ) {
    const session = await this.loadManagedSession(sessionId, userId, role);
    this.assertGrantable(session);

    const target = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.id === session.hostId) {
      throw new ConflictException('The host already manages this session');
    }

    const manager = await this.prisma.$transaction((tx) =>
      this.grant(tx, sessionId, dto.userId, dto.permissions, userId)
    );
    await this.notifyAdded(session, dto.userId);
    return manager;
  }

  async updatePermissions(
    sessionId: string,
    targetUserId: string,
    dto: UpdateSessionManagerDto,
    userId: string,
    role?: string
  ) {
    await this.loadManagedSession(sessionId, userId, role);
    const existing = await this.prisma.sessionManager.findUnique({
      where: { sessionId_userId: { sessionId, userId: targetUserId } },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Co-host not found');

    const manager = await this.prisma.sessionManager.update({
      where: { id: existing.id },
      data: { permissions: dto.permissions },
      include: managerInclude,
    });
    this.notifyAccessChanged(sessionId, targetUserId);
    return manager;
  }

  /** The host removes anyone; a co-host may only step down themselves. */
  async remove(
    sessionId: string,
    targetUserId: string,
    userId: string,
    role?: string
  ) {
    if (targetUserId !== userId) {
      await this.loadManagedSession(sessionId, userId, role);
    }
    const existing = await this.prisma.sessionManager.findUnique({
      where: { sessionId_userId: { sessionId, userId: targetUserId } },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Co-host not found');

    await this.prisma.sessionManager.delete({ where: { id: existing.id } });
    this.notifyAccessChanged(sessionId, targetUserId);
    return { id: existing.id };
  }

  /**
   * Issues the code behind the QR. A new code replaces any unused one, so only
   * the QR on the host's screen right now can work.
   */
  async createInvite(
    sessionId: string,
    dto: CreateSessionManagerInviteDto,
    userId: string,
    role?: string
  ) {
    const session = await this.loadManagedSession(sessionId, userId, role);
    this.assertGrantable(session);

    const permissions = dto.permissions ?? INVITE_PERMISSIONS;
    if (!permissions.every((p) => INVITE_PERMISSIONS.includes(p))) {
      throw new BadRequestException(
        'A QR invite can only grant COURTS and PLAYERS'
      );
    }

    const code = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.prisma.$transaction([
      this.prisma.sessionManagerInvite.deleteMany({
        where: { sessionId, consumedAt: null },
      }),
      this.prisma.sessionManagerInvite.create({
        data: {
          sessionId,
          codeHash: this.hashCode(code),
          permissions,
          expiresAt,
          createdById: userId,
        },
      }),
    ]);
    return { code, expiresAt, permissions };
  }

  async revokeInvites(sessionId: string, userId: string, role?: string) {
    await this.loadManagedSession(sessionId, userId, role);
    const { count } = await this.prisma.sessionManagerInvite.deleteMany({
      where: { sessionId, consumedAt: null },
    });
    return { revoked: count };
  }

  /**
   * Redeems a QR. Host and duplicate checks run before the claim, so a host
   * scanning their own screen does not burn the code for the person next to
   * them; the transaction then rolls the claim back if the cap rejects it.
   */
  async join(sessionId: string, code: string, userId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        name: true,
        hostId: true,
        status: true,
        isCrawled: true,
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    this.assertGrantable(session);
    if (session.hostId === userId) {
      throw new ConflictException('The host already manages this session');
    }
    if (await this.access.isManager(sessionId, userId)) {
      throw new ConflictException('This user is already a co-host');
    }

    const codeHash = this.hashCode(code);
    const manager = await this.prisma.$transaction(async (tx) => {
      const invite = await tx.sessionManagerInvite.findUnique({
        where: { codeHash },
        select: { id: true, sessionId: true, permissions: true },
      });
      const claimed =
        invite?.sessionId === sessionId
          ? await tx.sessionManagerInvite.updateMany({
              where: {
                id: invite.id,
                consumedAt: null,
                expiresAt: { gt: new Date() },
              },
              data: { consumedAt: new Date(), consumedById: userId },
            })
          : { count: 0 };
      if (!invite || !claimed.count) {
        throw new BadRequestException({
          code: 'SESSION_MANAGER_INVITE_INVALID',
          message: 'This invite is invalid or has expired',
        });
      }
      return this.grant(
        tx,
        sessionId,
        userId,
        invite.permissions,
        session.hostId
      );
    });

    // Lets the host see who just joined, and revoke them, without refreshing.
    this.gateway.notifyUser(
      session.hostId,
      SessionEventType.SESSION_MANAGER_JOINED,
      { sessionId, userId, name: manager.user.name }
    );
    return manager;
  }

  private async notifyAdded(
    session: { id: string; name: string | null },
    userId: string
  ) {
    await this.notifications.createForUser(
      userId,
      'SESSION',
      'Bạn được thêm làm host phụ',
      `Bạn có thể cùng quản lý kèo "${session.name ?? ''}".`,
      {
        sessionId: session.id,
        sessionName: session.name,
        action: 'session_manager_added',
      }
    );
  }

  /** An open manage screen has to drop a revoked tab without waiting. */
  private notifyAccessChanged(sessionId: string, userId: string) {
    this.gateway.notifyUser(userId, SessionEventType.SESSION_MANAGER_CHANGED, {
      sessionId,
    });
  }
}
