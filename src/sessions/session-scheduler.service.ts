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
   * 2. Auto-cancel (30 min after scheduled start with no host action)
   * 3. End warning (15 min before scheduled end time)
   * 4. Auto-finalize (after grace period expires with no activity)
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleSessionLifecycle() {
    const now = new Date();

    await Promise.allSettled([
      this.sendStartReminders(now),
      this.autoCancelSessions(now),
      this.sendEndWarnings(now),
      this.autoFinalizeSessions(now),
    ]);
  }

  /**
   * Send start reminder to host when scheduled start time arrives.
   * Only sends once per session (tracked by startReminderSentAt).
   */
  private async sendStartReminders(now: Date) {
    try {
      const sessions = await this.prisma.session.findMany({
        where: {
          status: 'PREPARING',
          scheduledStartTime: { lte: now },
          startReminderSentAt: null,
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
          `[StartReminder] Sending start reminder for session "${session.name}" (${session.id}) to host ${session.hostId} and ${session.players.length} player(s)`
        );

        // Mark reminder as sent
        await this.prisma.session.update({
          where: { id: session.id },
          data: { startReminderSentAt: now },
        });

        // Create in-app notification for host
        await this.notificationsService.createForUser(
          session.hostId,
          'SESSION',
          'Session is ready to start',
          `It's time for "${session.name}". Are you at the court? Tap to start the session.`,
          {
            sessionId: session.id,
            sessionName: session.name,
            action: 'start_reminder',
          }
        );

        // Create in-app notification for all approved players
        for (const player of session.players) {
          if (player.userId) {
            await this.notificationsService.createForUser(
              player.userId,
              'SESSION',
              'Session is starting soon',
              `"${session.name}" is about to start. Head to the court!`,
              {
                sessionId: session.id,
                sessionName: session.name,
                action: 'player_start_reminder',
              }
            );
          }
        }

        // Emit socket event to host
        this.sessionsGateway.notifyUser(
          session.hostId,
          SessionEventType.SESSION_START_REMINDER,
          { sessionId: session.id, sessionName: session.name }
        );
      }

      if (sessions.length > 0) {
        this.logger.log(
          `[StartReminder] Sent ${sessions.length} start reminder(s)`
        );
      }
    } catch (error) {
      this.logger.error('[StartReminder] Error sending start reminders', error);
    }
  }

  /**
   * Auto-cancel sessions that are still PREPARING 30 minutes past scheduled start time.
   * Notifies host and all approved players.
   */
  private async autoCancelSessions(now: Date) {
    try {
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

      const sessions = await this.prisma.session.findMany({
        where: {
          status: 'PREPARING',
          scheduledStartTime: { lte: thirtyMinutesAgo },
          cancelledAt: null,
        },
        include: {
          host: { select: { id: true, name: true } },
          players: {
            where: { registrationStatus: 'APPROVED' },
            select: { id: true, userId: true, name: true },
          },
        },
      });

      for (const session of sessions) {
        this.logger.log(
          `[AutoCancel] Auto-cancelling session "${session.name}" (${session.id}) - 30 min past start time`
        );

        // Update session status to CANCELLED
        await this.prisma.session.update({
          where: { id: session.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: now,
          },
        });

        // Notify host
        await this.notificationsService.createForUser(
          session.hostId,
          'SESSION',
          'Session auto-cancelled',
          `"${session.name}" has been automatically cancelled because it was not started within 30 minutes of the scheduled time.`,
          {
            sessionId: session.id,
            sessionName: session.name,
            action: 'auto_cancelled',
          }
        );

        // Notify all joined players
        for (const player of session.players) {
          if (player.userId) {
            await this.notificationsService.createForUser(
              player.userId,
              'SESSION',
              'Session cancelled',
              `"${session.name}" has been cancelled by the system. The host did not start the session on time.`,
              {
                sessionId: session.id,
                sessionName: session.name,
                action: 'session_cancelled',
              }
            );
          }
        }

        // Emit socket event to session room
        this.sessionsGateway.notifyEvent(
          session.id,
          SessionEventType.SESSION_CANCELLED,
          { sessionId: session.id, sessionName: session.name }
        );

        // Also notify via session update for UI refresh
        this.sessionsGateway.notifySessionUpdate(session.id);
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

      for (const session of sessions) {
        this.logger.log(
          `[EndWarning] Sending end warning for session "${session.name}" (${session.id})`
        );

        // Mark warning as sent
        await this.prisma.session.update({
          where: { id: session.id },
          data: { endWarningSentAt: now },
        });

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
          }
        );

        // Emit socket event to host
        this.sessionsGateway.notifyUser(
          session.hostId,
          SessionEventType.SESSION_END_WARNING,
          { sessionId: session.id, sessionName: session.name }
        );
      }

      if (sessions.length > 0) {
        this.logger.log(`[EndWarning] Sent ${sessions.length} end warning(s)`);
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
}
