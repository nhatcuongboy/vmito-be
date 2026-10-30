import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogAction,
  NotificationType,
  Prisma,
  Role,
  VenueManagerRole,
  VenueRequestStatus,
  VenueRequestType,
} from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { OwnershipClaimMode } from './dto/approve-venue-request.dto';
import type { VenueRequestPayloadDto } from './dto/venue-request-payload.dto';
import {
  VENUE_REQUEST_INCLUDE,
  type VenueRequestWithRelations,
} from './venue-request.include';

/**
 * "I own this venue": a user's request to become its OWNER, reviewed by an
 * admin. It lives in the venue-request queue (badges, dashboard counts and
 * the rejection flow carry over); only what differs is here. Ownership
 * reaches money — deposits land in the owner's bank details — so approval
 * is transactional and audited.
 */
@Injectable()
export class VenueOwnershipClaimsService {
  private readonly logger = new Logger(VenueOwnershipClaimsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly auditLogs: AuditLogsService
  ) {}

  validate(venueId: string | undefined, payload: VenueRequestPayloadDto) {
    if (!venueId) {
      throw new BadRequestException('venueId is required for ownership claims');
    }
    const claim = payload.claim;
    if (!claim?.contactName || !claim.contactPhone) {
      throw new BadRequestException(
        'Contact name and phone are required for ownership claims'
      );
    }
    if (!claim.proofImages?.length) {
      throw new BadRequestException(
        'At least one proof image is required for ownership claims'
      );
    }
  }

  /**
   * One open claim per user and venue. The advisory lock closes the race a
   * double-tap would otherwise win: there is no partial unique index here.
   */
  async submit(
    userId: string,
    venueId: string,
    payload: VenueRequestPayloadDto
  ) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true, name: true },
    });
    if (!venue) throw new NotFoundException('Venue not found');

    const request = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))::text AS lock_result',
        `venue-claim:${venueId}:${userId}`
      );
      const owner = await tx.venueManager.findUnique({
        where: { venueId_userId: { venueId, userId } },
        select: { role: true },
      });
      if (owner?.role === VenueManagerRole.OWNER) {
        throw new ConflictException({
          code: 'ALREADY_VENUE_OWNER',
          message: 'You already own this venue',
        });
      }
      const pending = await tx.venueRequest.findFirst({
        where: {
          venueId,
          submittedByUserId: userId,
          type: VenueRequestType.OWNERSHIP_CLAIM,
          status: VenueRequestStatus.PENDING,
        },
        select: { id: true },
      });
      if (pending) {
        throw new ConflictException({
          code: 'CLAIM_ALREADY_PENDING',
          message: 'You already have a pending claim for this venue',
        });
      }
      return tx.venueRequest.create({
        data: {
          type: VenueRequestType.OWNERSHIP_CLAIM,
          submittedByUserId: userId,
          venueId,
          payload: payload as Prisma.InputJsonObject,
        },
        include: VENUE_REQUEST_INCLUDE,
      });
    });

    void this.notifyAdmins(request, venue.name).catch((err: unknown) =>
      this.logger.warn(`Ownership claim notify failed: ${String(err)}`)
    );
    return request;
  }

  /** The venue's current owners, shown to the admin deciding a claim. */
  currentOwners(venueId: string) {
    return this.prisma.venueManager
      .findMany({
        where: { venueId, role: VenueManagerRole.OWNER },
        select: {
          user: {
            select: { id: true, name: true, image: true, phone: true },
          },
        },
      })
      .then((rows) => rows.map((row) => row.user));
  }

  /**
   * Grants ownership. Runs as one transaction so a request can't end up
   * approved without the role, or the role without the request closing; the
   * conditional update makes a double approve fail instead of re-applying.
   * A claimant who already manages the venue is promoted, not duplicated.
   */
  async approve(
    request: VenueRequestWithRelations,
    adminUserId: string,
    mode: OwnershipClaimMode
  ) {
    const venueId = request.venueId;
    if (!venueId) {
      throw new BadRequestException('Ownership claim must target a venue');
    }
    const userId = request.submittedByUserId;
    const { updated, replacedIds } = await this.prisma.$transaction(
      async (tx) => {
        const closed = await tx.venueRequest.updateMany({
          where: { id: request.id, status: VenueRequestStatus.PENDING },
          data: {
            status: VenueRequestStatus.APPROVED,
            appliedVenueId: venueId,
            reviewedByUserId: adminUserId,
            reviewedAt: new Date(),
          },
        });
        if (!closed.count) {
          throw new BadRequestException(
            'Venue request has already been processed'
          );
        }
        const others =
          mode === 'REPLACE'
            ? await tx.venueManager.findMany({
                where: {
                  venueId,
                  role: VenueManagerRole.OWNER,
                  userId: { not: userId },
                },
                select: { userId: true },
              })
            : [];
        if (others.length) {
          await tx.venueManager.updateMany({
            where: { venueId, userId: { in: others.map((o) => o.userId) } },
            data: { role: VenueManagerRole.MANAGER },
          });
        }
        await tx.venueManager.upsert({
          where: { venueId_userId: { venueId, userId } },
          create: { venueId, userId, role: VenueManagerRole.OWNER },
          update: { role: VenueManagerRole.OWNER },
        });
        return {
          updated: await tx.venueRequest.findUniqueOrThrow({
            where: { id: request.id },
            include: VENUE_REQUEST_INCLUDE,
          }),
          replacedIds: others.map((o) => o.userId),
        };
      }
    );

    await this.auditLogs.create({
      action: AuditLogAction.UPDATE,
      entity: 'VenueManager',
      entityId: venueId,
      userId: adminUserId,
      details: { requestId: request.id, ownerId: userId, mode, replacedIds },
    });
    await this.notifyApproved(updated, replacedIds);
    return updated;
  }

  private async notifyAdmins(
    request: VenueRequestWithRelations,
    venueName: string
  ) {
    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, id: { not: request.submittedByUserId } },
      select: { id: true },
    });
    if (admins.length === 0) return;
    const userName = request.submittedBy?.name?.trim() || 'Người dùng';
    await this.notifications.createManyForUsers(
      admins.map((admin) => admin.id),
      NotificationType.SYSTEM,
      'Yêu cầu nhận chủ sân mới',
      `${userName} yêu cầu nhận chủ sân "${venueName}".`,
      {
        action: 'admin_new_venue_claim',
        requestId: request.id,
        venueId: request.venueId,
        venueName,
        userName,
        url: `/admin/venues/requests/${request.id}`,
      }
    );
  }

  private async notifyApproved(
    request: VenueRequestWithRelations,
    replacedIds: string[]
  ) {
    const venueName = request.venue?.name ?? '';
    const data = { requestId: request.id, venueId: request.venueId, venueName };
    try {
      await this.notifications.createForUser(
        request.submittedByUserId,
        NotificationType.VENUE_REQUEST,
        'Bạn đã là chủ sân',
        `Yêu cầu nhận chủ sân "${venueName}" đã được phê duyệt.`,
        { ...data, action: 'venue_owner_claim_approved' },
        {
          dedupeKey: `venue-request:${request.id}:approved`,
          conflictMode: 'ONCE',
        }
      );
      if (replacedIds.length) {
        await this.notifications.createManyForUsers(
          replacedIds,
          NotificationType.VENUE_REQUEST,
          'Vai trò tại sân đã thay đổi',
          `Bạn đã được chuyển thành người quản lý của sân "${venueName}".`,
          { ...data, action: 'venue_owner_replaced' }
        );
      }
    } catch (err: unknown) {
      this.logger.error(`Failed to notify ownership claim ${request.id}`, err);
    }
  }
}
