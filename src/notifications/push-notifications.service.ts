import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Notification, Prisma } from '@prisma/client';
import {
  App,
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { getMessaging, Message, Messaging } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationUnreadCountService } from './notification-unread-count.service';
import { localizePush, normalizePushLocale } from './push-localization';

export type PushContent = Pick<
  Notification,
  'id' | 'type' | 'title' | 'message' | 'data'
>;
type PushNotification = PushContent & Pick<Notification, 'userId'>;

/** `data.action` of a silent badge-only push; vmito_app handles it. */
export const BADGE_SYNC_ACTION = 'badge_sync';

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);
  private readonly messaging?: Messaging;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly unreadCounts: NotificationUnreadCountService
  ) {
    const app = this.initializeFirebaseApp();
    if (app) this.messaging = getMessaging(app);
  }

  async send(notification: PushNotification): Promise<void> {
    await this.sendMany([notification]);
  }

  /**
   * Sends one durable-outbox item and lets transient failures escape so the
   * dispatcher can apply backoff. Ordinary notifications continue using
   * [send], whose best-effort behavior must not break their business action.
   */
  async sendOrThrow(notification: PushNotification): Promise<void> {
    await this.sendManyOrThrow([notification]);
  }

  async sendMany(notifications: PushNotification[]): Promise<void> {
    if (!this.messaging || notifications.length === 0) return;

    try {
      await this.sendManyOrThrow(notifications);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`FCM delivery failed: ${message}`);
    }
  }

  private async sendManyOrThrow(
    notifications: PushNotification[]
  ): Promise<void> {
    if (!this.messaging || notifications.length === 0) return;
    const byUserId = new Map(
      notifications.map((notification) => [notification.userId, notification])
    );
    const devices = await this.prisma.notificationDevice.findMany({
      where: { userId: { in: [...byUserId.keys()] } },
      select: { token: true, userId: true, locale: true },
    });
    const badgeCounts = await this.unreadCounts.badgeTotalsForUsers(
      devices.map((device) => device.userId)
    );
    const messages: Message[] = [];
    const tokens: string[] = [];

    for (const device of devices) {
      const notification = byUserId.get(device.userId);
      if (!notification) continue;
      const { title, message } = localizePush(
        notification,
        normalizePushLocale(device.locale)
      );
      messages.push(
        this.buildMessage(
          device.token,
          { ...notification, title, message },
          badgeCounts.get(device.userId)
        )
      );
      tokens.push(device.token);
    }
    await this.sendMessages(messages, tokens);
  }

  /**
   * Pushes each user's current badge total to their devices without showing
   * anything, so the app icon follows changes that create no inbox row (a new
   * join request to review, a read on another device). iOS applies
   * `aps.badge` itself; Android has no system badge field for a silent
   * message, so the app's background handler applies `data.badge`.
   * Best-effort: a stale icon is corrected on the next app open.
   */
  async syncBadges(userIds: string[]): Promise<void> {
    if (!this.messaging || userIds.length === 0) return;
    try {
      const devices = await this.prisma.notificationDevice.findMany({
        where: { userId: { in: [...new Set(userIds)] } },
        select: { token: true, userId: true, platform: true },
      });
      if (devices.length === 0) return;
      const totals = await this.unreadCounts.badgeTotalsForUsers(
        devices.map((device) => device.userId)
      );
      const messages: Message[] = [];
      const tokens: string[] = [];
      for (const device of devices) {
        const badge = totals.get(device.userId);
        if (badge == null) continue;
        messages.push(
          this.buildBadgeMessage(device.token, device.platform, badge)
        );
        tokens.push(device.token);
      }
      await this.sendMessages(messages, tokens);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`FCM badge sync failed: ${message}`);
    }
  }

  /** Deliver one shared campaign payload to an already paged token batch. */
  async sendBroadcast(
    notification: PushContent,
    tokens: string[]
  ): Promise<void> {
    if (!this.messaging || tokens.length === 0) return;
    const messages = tokens.map((token) =>
      this.buildMessage(token, notification)
    );
    await this.sendMessages(messages, tokens);
  }

  private async sendMessages(messages: Message[], tokens: string[]) {
    const invalidTokens = new Set<string>();
    let transientFailureCount = 0;
    for (let offset = 0; offset < messages.length; offset += 500) {
      const response = await this.messaging!.sendEach(
        messages.slice(offset, offset + 500)
      );
      response.responses.forEach((result, index) => {
        if (result.success) return;
        if (result.error?.code && INVALID_TOKEN_CODES.has(result.error.code)) {
          invalidTokens.add(tokens[offset + index]);
          return;
        }
        transientFailureCount++;
      });
    }
    if (invalidTokens.size > 0) {
      await this.prisma.notificationDevice.deleteMany({
        where: { token: { in: [...invalidTokens] } },
      });
      this.logger.log(`Removed ${invalidTokens.size} invalid FCM token(s)`);
    }
    if (transientFailureCount > 0) {
      // Messages in this batch were already sent to FCM by the time we know
      // about per-message failures, so we must not throw here: throwing
      // would make the broadcast dispatch job retry the same batch and
      // re-deliver duplicate push notifications to devices that already
      // received it. Transient per-message failures are logged and dropped.
      this.logger.warn(
        `FCM failed to deliver ${transientFailureCount} message(s) (transient, not retried)`
      );
    }
  }

  /**
   * [badgeCount] is the user's in-app bell total (unread + pending approvals) including this push. It is
   * left undefined for broadcast campaigns (one shared payload, no per-user
   * lookup) and when the count lookup failed; iOS then keeps the current badge
   * and the app re-syncs it on the next foreground.
   */
  private buildMessage(
    token: string,
    notification: PushContent,
    badgeCount?: number
  ): Message {
    const customData = this.serializeData(notification.data);
    const isCourtCall =
      customData.action === 'court_call' || customData.courtNumber != null;

    return {
      token,
      notification: {
        title: notification.title,
        body: notification.message,
      },
      data: {
        ...customData,
        notificationId: notification.id,
        type: notification.type,
      },
      android: {
        priority: 'high',
        collapseKey: notification.id,
        notification: {
          channelId: isCourtCall ? 'court_calls' : 'vmito_notifications',
          sound: 'default',
          ...(badgeCount != null ? { notificationCount: badgeCount } : {}),
        },
      },
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'alert',
          'apns-collapse-id': notification.id,
        },
        payload: {
          aps: {
            sound: 'default',
            ...(badgeCount != null ? { badge: badgeCount } : {}),
            ...(isCourtCall ? { interruptionLevel: 'time-sensitive' } : {}),
          },
        },
      },
    };
  }

  private buildBadgeMessage(
    token: string,
    platform: string,
    badge: number
  ): Message {
    const data = { action: BADGE_SYNC_ACTION, badge: String(badge) };
    if (platform === 'ios') {
      return {
        token,
        data,
        apns: {
          // A badge-only notification is still the `alert` push type; with no
          // alert or sound it changes the icon and nothing else.
          headers: { 'apns-priority': '5', 'apns-push-type': 'alert' },
          payload: { aps: { badge } },
        },
      };
    }
    // Data-only so nothing is shown; `normal` priority because FCM
    // deprioritizes apps whose high-priority messages show no notification.
    return { token, data, android: { priority: 'normal' } };
  }

  private serializeData(data: Prisma.JsonValue): Record<string, string> {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};

    return Object.fromEntries(
      Object.entries(data).flatMap(([key, value]) =>
        value == null
          ? []
          : [[key, typeof value === 'string' ? value : JSON.stringify(value)]]
      )
    );
  }

  private initializeFirebaseApp(): App | undefined {
    try {
      const existingApp = getApps().find((app) => app.name === 'vmito-push');
      if (existingApp) return existingApp;

      const serviceAccountJson = this.config.get<string>(
        'FIREBASE_SERVICE_ACCOUNT_JSON'
      );
      if (serviceAccountJson) {
        const parsed: unknown = JSON.parse(serviceAccountJson);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error(
            'FIREBASE_SERVICE_ACCOUNT_JSON must be a JSON object'
          );
        }
        const serviceAccount = parsed as Record<string, unknown>;
        const projectId = serviceAccount.project_id;
        const clientEmail = serviceAccount.client_email;
        const privateKey = serviceAccount.private_key;
        if (
          typeof projectId !== 'string' ||
          typeof clientEmail !== 'string' ||
          typeof privateKey !== 'string'
        ) {
          throw new Error(
            'FIREBASE_SERVICE_ACCOUNT_JSON is missing project_id, client_email or private_key'
          );
        }
        return initializeApp(
          { credential: cert({ projectId, clientEmail, privateKey }) },
          'vmito-push'
        );
      }

      const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY');
      if (projectId && clientEmail && privateKey) {
        return initializeApp(
          {
            credential: cert({
              projectId,
              clientEmail,
              privateKey: privateKey.replace(/\\n/g, '\n'),
            }),
          },
          'vmito-push'
        );
      }

      if (this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS')) {
        return initializeApp(
          { credential: applicationDefault(), projectId },
          'vmito-push'
        );
      }

      this.logger.warn(
        'Firebase Admin credentials are not configured; mobile push is disabled'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Could not initialize Firebase Admin: ${message}`);
    }
    return undefined;
  }
}
