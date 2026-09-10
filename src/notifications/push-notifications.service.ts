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

export type PushContent = Pick<
  Notification,
  'id' | 'type' | 'title' | 'message' | 'data'
>;
type PushNotification = PushContent & Pick<Notification, 'userId'>;

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
    private readonly prisma: PrismaService
  ) {
    const app = this.initializeFirebaseApp();
    if (app) this.messaging = getMessaging(app);
  }

  async send(notification: PushNotification): Promise<void> {
    await this.sendMany([notification]);
  }

  async sendMany(notifications: PushNotification[]): Promise<void> {
    if (!this.messaging || notifications.length === 0) return;

    try {
      const byUserId = new Map(
        notifications.map((notification) => [notification.userId, notification])
      );
      const devices = await this.prisma.notificationDevice.findMany({
        where: { userId: { in: [...byUserId.keys()] } },
        select: { token: true, userId: true },
      });
      const messages: Message[] = [];
      const tokens: string[] = [];

      for (const device of devices) {
        const notification = byUserId.get(device.userId);
        if (!notification) continue;
        messages.push(this.buildMessage(device.token, notification));
        tokens.push(device.token);
      }
      await this.sendMessages(messages, tokens);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`FCM delivery failed: ${message}`);
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
      throw new Error(
        `FCM failed to deliver ${transientFailureCount} message(s)`
      );
    }
  }

  private buildMessage(token: string, notification: PushContent): Message {
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
            ...(isCourtCall ? { interruptionLevel: 'time-sensitive' } : {}),
          },
        },
      },
    };
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
