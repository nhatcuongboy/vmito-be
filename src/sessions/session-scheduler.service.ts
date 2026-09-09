import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SessionsGateway, SessionEventType } from './sessions.gateway';
import { SessionsService } from './sessions.service';

@Injectable()
export class SessionSchedulerService {
  private readonly logger = new Logger(SessionSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly sessionsGateway: SessionsGateway,
    private readonly sessionsService: SessionsService
  ) {}

  /**
   * Runs every minute to handle session lifecycle events:
   * 1. Start reminder (at scheduled start time)
   * 2. Auto-start (at scheduled start time if host has not started yet)
   * 3. End warning (15 min before scheduled end time)
   * 4. Auto-finalize (after grace period expires with no activity)
   * 5. Auto-cancel (sessions still PREPARING after scheduledEndTime)
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleSessionLifecycle() {
    const now = new Date();

    await Promise.allSettled([
      this.sendStartReminders(now),
      this.autoStartSessions(now),
      this.sendEndWarnings(now),
      this.autoFinalizeSessions(now),
      this.autoCancelSessions(now),
    ]);
  }

  /**
   * Send start reminder to host 15 minutes before scheduled start time.
   * This gives the host advance notice before the session auto-starts.
   * Only sends once per session (tracked by startReminderSentAt).
   */
  private async sendStartReminders(now: Date) {
    try {
      const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000);

      const sessions = await this.prisma.session.findMany({
        where: {
          status: 'PREPARING',
          isCrawled: false, // crawled (vãng lai) sessions have no lifecycle
          scheduledStartTime: { lte: fifteenMinutesFromNow, gt: now },
          startReminderSentAt: null,
        },
        include: {
          host: { select: { id: true, name: true } },
        },
      });

      let sentCount = 0;
      for (const session of sessions) {
        this.logger.log(
          `[StartReminder] Sending 15-min reminder for session "${session.name}" (${session.id}) to host ${session.hostId}`
        );

        // Mark reminder as sent
        const claimed = await this.prisma.session.updateMany({
          where: {
            id: session.id,
            status: 'PREPARING',
            startReminderSentAt: null,
          },
          data: { startReminderSentAt: now },
        });
        if (!claimed.count) continue;

        // Create in-app notification for host only
        await this.notificationsService.createForUser(
          session.hostId,
          'SESSION',
          'Session starting in 15 minutes',
          `"${session.name}" will automatically start in about 15 minutes. You can also start it early if you're already at the court.`,
          {
            sessionId: session.id,
            sessionName: session.name,
            action: 'start_reminder',
          },
          {
            dedupeKey: `session:${session.id}:start-reminder`,
            conflictMode: 'ONCE',
          }
        );

        // Emit socket event to host
        this.sessionsGateway.notifyUser(
          session.hostId,
          SessionEventType.SESSION_START_REMINDER,
          { sessionId: session.id, sessionName: session.name }
        );
        sentCount++;
      }

      if (sentCount > 0) {
        this.logger.log(`[StartReminder] Sent ${sentCount} start reminder(s)`);
      }
    } catch (error) {
      this.logger.error('[StartReminder] Error sending start reminders', error);
    }
  }

  /**
   * Auto-start sessions that are still PREPARING once the scheduled start time arrives.
   * Uses scheduledStartTime as the actual startTime so the session ends exactly as planned.
   * Notifies host and all approved players that the session has been automatically started.
   */
  private async autoStartSessions(now: Date) {
    try {
      const sessions = await this.prisma.session.findMany({
        where: {
          status: 'PREPARING',
          isCrawled: false, // crawled (vãng lai) sessions have no lifecycle
          scheduledStartTime: { lte: now },
          // Only auto-start sessions whose scheduled end time is still in the future
          scheduledEndTime: { gt: now },
          autoStartedAt: null,
        },
        include: {
          host: { select: { id: true, name: true } },
          players: {
            where: { registrationStatus: 'APPROVED', userId: { not: null } },
            select: { id: true, userId: true, name: true },
          },
        },
      });

      for (const session of sessions) {
        this.logger.log(
          `[AutoStart] Auto-starting session "${session.name}" (${session.id}) at scheduled time`
        );

        try {
          await this.sessionsService.autoStart(session.id);
        } catch (error) {
          this.logger.error(
            `[AutoStart] Failed to auto-start session ${session.id}`,
            error
          );
          continue;
        }

        // Notify host
        await this.notificationsService.createForUser(
          session.hostId,
          'SESSION',
          'Session auto-started',
          `"${session.name}" has been automatically started at the scheduled time.`,
          {
            sessionId: session.id,
            sessionName: session.name,
            action: 'auto_started',
          },
          {
            dedupeKey: `session:${session.id}:auto-started:host`,
            conflictMode: 'ONCE',
          }
        );

        // Notify all approved players (skip host to avoid duplicate notification)
        await this.notificationsService.createManyForUsers(
          session.players
            .filter(
              (player) => player.userId && player.userId !== session.hostId
            )
            .map((player) => player.userId!),
          'SESSION',
          'Session has started',
          `"${session.name}" has started. Head to the court!`,
          {
            sessionId: session.id,
            sessionName: session.name,
            action: 'session_auto_started',
          },
          {
            dedupeKey: (userId) =>
              `session:${session.id}:auto-started:user:${userId}`,
          }
        );

        // Emit socket event to session room
        this.sessionsGateway.notifyEvent(
          session.id,
          SessionEventType.SESSION_STARTED,
          { sessionId: session.id, sessionName: session.name }
        );
      }

      if (sessions.length > 0) {
        this.logger.log(
          `[AutoStart] Auto-started ${sessions.length} session(s)`
        );
      }
    } catch (error) {
      this.logger.error('[AutoStart] Error auto-starting sessions', error);
    }
  }

  /**
   * Send end warning to host 15 minutes before scheduled end time.
   * Only sends once per session (tracked by endWarningSentAt).
   */
  private async sendEndWarnings(now: Date) {
    try {
      const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000);

      const sessions = await this.prisma.session.findMany({
        where: {
          status: 'IN_PROGRESS',
          scheduledEndTime: { lte: fifteenMinutesFromNow },
          endWarningSentAt: null,
        },
        include: {
          host: { select: { id: true, name: true } },
        },
      });

      let sentCount = 0;
      for (const session of sessions) {
        this.logger.log(
          `[EndWarning] Sending end warning for session "${session.name}" (${session.id})`
        );

        // Mark warning as sent
        const claimed = await this.prisma.session.updateMany({
          where: {
            id: session.id,
            status: 'IN_PROGRESS',
            endWarningSentAt: null,
          },
          data: { endWarningSentAt: now },
        });
        if (!claimed.count) continue;

        // Create in-app notification for host
        await this.notificationsService.createForUser(
          session.hostId,
          'SESSION',
          'Session ending soon',
          `"${session.name}" is ending in about 15 minutes.`,
          {
            sessionId: session.id,
            sessionName: session.name,
            action: 'end_warning',
          },
          {
            dedupeKey: `session:${session.id}:end-warning`,
            conflictMode: 'ONCE',
          }
        );

        // Emit socket event to host
        this.sessionsGateway.notifyUser(
          session.hostId,
          SessionEventType.SESSION_END_WARNING,
          { sessionId: session.id, sessionName: session.name }
        );
        sentCount++;
      }

      if (sentCount > 0) {
        this.logger.log(`[EndWarning] Sent ${sentCount} end warning(s)`);
      }
    } catch (error) {
      this.logger.error('[EndWarning] Error sending end warnings', error);
    }
  }

  /**
   * Auto-finalize sessions where grace period (30 min after scheduled end) has expired.
   * Sessions remain IN_PROGRESS during grace period so host can still enter scores.
   * After grace period, the session is force-ended.
   */
  private async autoFinalizeSessions(now: Date) {
    try {
      const sessions = await this.prisma.session.findMany({
        where: {
          status: 'IN_PROGRESS',
          gracePeriodEnd: { lte: now },
        },
        include: {
          host: { select: { id: true, name: true } },
        },
      });

      for (const session of sessions) {
        this.logger.log(
          `[AutoFinalize] Auto-finalizing session "${session.name}" (${session.id}) - grace period expired`
        );

        try {
          // Use the existing end() method for proper cleanup
          await this.sessionsService.end(session.id);

          // Notify host
          await this.notificationsService.createForUser(
            session.hostId,
            'SESSION',
            'Session auto-finalized',
            `"${session.name}" has been automatically finalized because the grace period expired.`,
            {
              sessionId: session.id,
              sessionName: session.name,
              action: 'auto_finalized',
            },
            {
              dedupeKey: `session:${session.id}:auto-finalized`,
              conflictMode: 'ONCE',
            }
          );
        } catch (error) {
          this.logger.error(
            `[AutoFinalize] Failed to finalize session ${session.id}`,
            error
          );
        }
      }

      if (sessions.length > 0) {
        this.logger.log(
          `[AutoFinalize] Auto-finalized ${sessions.length} session(s)`
        );
      }
    } catch (error) {
      this.logger.error('[AutoFinalize] Error auto-finalizing sessions', error);
    }
  }

  /**
   * Auto-cancel sessions that are still PREPARING after their scheduledEndTime.
   * This handles sessions that were never started (and could not be auto-started
   * because scheduledEndTime had already passed when the scheduler ran).
   * Notifies host and all approved players.
   */
  private async autoCancelSessions(now: Date) {
    try {
      const sessions = await this.prisma.session.findMany({
        where: {
          status: 'PREPARING',
          isCrawled: false, // crawled (vãng lai) sessions have no lifecycle
          scheduledEndTime: { lte: now },
        },
        include: {
          host: { select: { id: true, name: true } },
          players: {
            where: { registrationStatus: 'APPROVED', userId: { not: null } },
            select: { id: true, userId: true, name: true },
          },
        },
      });

      for (const session of sessions) {
        this.logger.log(
          `[AutoCancel] Cancelling session "${session.name}" (${session.id}) - passed end time without starting`
        );

        try {
          const claimed = await this.prisma.session.updateMany({
            where: { id: session.id, status: 'PREPARING' },
            data: { status: 'CANCELLED', cancelledAt: now },
          });
          if (!claimed.count) continue;

          // Notify host
          await this.notificationsService.createForUser(
            session.hostId,
            'SESSION',
            'Session auto-cancelled',
            `"${session.name}" has been automatically cancelled because it was not started within the scheduled time.`,
            {
              sessionId: session.id,
              sessionName: session.name,
              action: 'auto_cancelled',
            },
            {
              dedupeKey: `session:${session.id}:auto-cancelled:host`,
              conflictMode: 'ONCE',
            }
          );

          // Notify all approved players (skip host to avoid duplicate)
          await this.notificationsService.createManyForUsers(
            session.players
              .filter(
                (player) => player.userId && player.userId !== session.hostId
              )
              .map((player) => player.userId!),
            'SESSION',
            'Session cancelled',
            `"${session.name}" has been cancelled.`,
            {
              sessionId: session.id,
              sessionName: session.name,
              action: 'session_cancelled',
            },
            {
              dedupeKey: (userId) =>
                `session:${session.id}:cancelled:user:${userId}`,
            }
          );

          // Notify session room
          this.sessionsGateway.notifyEvent(
            session.id,
            SessionEventType.SESSION_CANCELLED,
            { sessionId: session.id, sessionName: session.name }
          );
        } catch (error) {
          this.logger.error(
            `[AutoCancel] Failed to cancel session ${session.id}`,
            error
          );
        }
      }

      if (sessions.length > 0) {
        this.logger.log(
          `[AutoCancel] Auto-cancelled ${sessions.length} session(s)`
        );
      }
    } catch (error) {
      this.logger.error('[AutoCancel] Error auto-cancelling sessions', error);
    }
  }

  /**
   * Nightly clean-up of crawled (vãng lai) Facebook sessions whose play time
   * has already passed, so the "find sessions" list only shows fresh imports.
   * These rows have no Player/Court/heavy relations, so a hard delete is safe.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredCrawledSessions() {
    try {
      const now = new Date();
      const result = await this.prisma.session.deleteMany({
        where: {
          isCrawled: true,
          endTime: { lt: now },
        },
      });

      if (result.count > 0) {
        this.logger.log(
          `[CrawledCleanup] Removed ${result.count} expired crawled session(s)`
        );
      }
    } catch (error) {
      this.logger.error(
        '[CrawledCleanup] Error cleaning up crawled sessions',
        error
      );
    }
  }
}
