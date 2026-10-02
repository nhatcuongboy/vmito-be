import { Injectable, Logger } from '@nestjs/common';
import { ChatConversationStatus, NotificationType } from '@prisma/client';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { VMITO_CHANNEL_TYPE } from './stream-chat.service';

/** The slice of Stream's `message.new` webhook body this service reads. */
export interface StreamMessageNewEvent {
  type?: string;
  channel_type?: string;
  channel_id?: string;
  message?: {
    type?: string;
    user?: { id?: string; name?: string };
  };
}

/**
 * Mirrors a new message in an active conversation into the in-app
 * notification feed.
 *
 * Stream already pushes the message itself, so entries are created with
 * `skipPush` — the feed gains a row and the bell badge, without a second
 * banner on the device. Message text is deliberately never copied: Stream
 * stays the only store of message bodies (see `ChatConversation` in the
 * Prisma schema).
 */
@Injectable()
export class ChatMessageNotifierService {
  private readonly logger = new Logger(ChatMessageNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly notifications: NotificationsService
  ) {}

  async handleMessageNew(event: StreamMessageNewEvent) {
    const channelId = event.channel_id;
    const senderId = event.message?.user?.id;
    if (
      event.type !== 'message.new' ||
      event.channel_type !== VMITO_CHANNEL_TYPE ||
      !channelId ||
      !senderId ||
      // System/ephemeral messages (member joined, errors) are not chat.
      (event.message?.type && event.message.type !== 'regular')
    ) {
      return;
    }
    if (!(await this.featureFlags.isEnabled('CHAT_ENABLED'))) return;

    const conversation = await this.prisma.chatConversation.findUnique({
      where: { streamChannelId: channelId },
    });
    // A pending channel's only message is the request itself, which already
    // has its own notification (`deliverPendingRequest`).
    if (conversation?.status !== ChatConversationStatus.ACTIVE) return;

    const recipientId =
      conversation.participantAId === senderId
        ? conversation.participantBId
        : conversation.participantAId;
    if (
      recipientId === senderId ||
      (conversation.participantAId !== senderId &&
        conversation.participantBId !== senderId)
    ) {
      return;
    }

    const senderName =
      event.message?.user?.name?.trim() ||
      (
        await this.prisma.user.findUnique({
          where: { id: senderId },
          select: { name: true },
        })
      )?.name ||
      'Ai đó';

    // One feed row per conversation, bumped on every message, so a busy chat
    // cannot bury the rest of the feed.
    await this.notifications.createForUser(
      recipientId,
      NotificationType.CHAT,
      senderName,
      'Đã gửi cho bạn tin nhắn mới',
      {
        action: 'chat_message',
        channelId,
        senderId,
        senderName,
      },
      {
        dedupeKey: `chat-message:${channelId}:${recipientId}`,
        conflictMode: 'COALESCE',
        skipPush: true,
      }
    );
    this.logger.debug(
      JSON.stringify({ event: 'chat_message_notified', channelId, recipientId })
    );
  }
}
