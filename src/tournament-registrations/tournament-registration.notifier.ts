import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, TournamentPermission } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

interface RequestContext {
  requestId: string;
  tournamentId: string;
  tournamentName: string;
  categoryName: string;
  requesterId: string;
  requesterName: string;
  partnerUserIds: string[];
}

/** Best-effort notifications for the self-registration flow — never throws. */
@Injectable()
export class TournamentRegistrationNotifier {
  private readonly logger = new Logger(TournamentRegistrationNotifier.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService
  ) {}

  /** Host + managers who can review participants, and the named partners. */
  async submitted(ctx: RequestContext, hostId: string): Promise<void> {
    const managers = await this.safe(() =>
      this.prisma.tournamentManager.findMany({
        where: {
          tournamentId: ctx.tournamentId,
          permissions: { has: TournamentPermission.PARTICIPANTS },
        },
        select: { userId: true },
      })
    );
    const reviewers = new Set([
      hostId,
      ...(managers ?? []).map((m) => m.userId),
    ]);
    reviewers.delete(ctx.requesterId);

    for (const userId of reviewers) {
      await this.send(
        userId,
        'New tournament registration',
        `${ctx.requesterName} registered for ${ctx.categoryName} in ${ctx.tournamentName}.`,
        ctx,
        'tournament_registration_submitted'
      );
    }
    for (const userId of ctx.partnerUserIds) {
      await this.send(
        userId,
        'You were added to a tournament team',
        `${ctx.requesterName} registered you for ${ctx.categoryName} in ${ctx.tournamentName}.`,
        ctx,
        'tournament_registration_partner_added'
      );
    }
  }

  async reviewed(
    ctx: RequestContext,
    approved: boolean,
    response?: string | null
  ): Promise<void> {
    const recipients = approved
      ? [ctx.requesterId, ...ctx.partnerUserIds]
      : [ctx.requesterId];
    const title = approved
      ? 'Tournament registration approved'
      : 'Tournament registration rejected';
    const message = approved
      ? `Your registration for ${ctx.categoryName} in ${ctx.tournamentName} was approved.`
      : `Your registration for ${ctx.categoryName} in ${ctx.tournamentName} was rejected.`;

    for (const userId of recipients) {
      await this.send(
        userId,
        title,
        message,
        ctx,
        approved
          ? 'tournament_registration_approved'
          : 'tournament_registration_rejected',
        response
      );
    }
  }

  private async send(
    userId: string,
    title: string,
    message: string,
    ctx: RequestContext,
    action: string,
    response?: string | null
  ) {
    await this.safe(() =>
      this.notifications.createForUser(
        userId,
        NotificationType.TOURNAMENT,
        title,
        message,
        {
          action,
          requestId: ctx.requestId,
          tournamentId: ctx.tournamentId,
          tournamentName: ctx.tournamentName,
          categoryName: ctx.categoryName,
          requesterId: ctx.requesterId,
          requesterName: ctx.requesterName,
          ...(response ? { response } : {}),
        },
        { dedupeKey: `${action}:${ctx.requestId}:${userId}` }
      )
    );
  }

  private async safe<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      this.logger.warn(
        `Registration notification failed: ${(error as Error).message}`
      );
      return null;
    }
  }
}
