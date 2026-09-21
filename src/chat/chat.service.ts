import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ChatConversation,
  ChatConversationStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatContactsQueryDto, CreateChatRequestDto } from './dto/chat.dto';
import { StreamChatService, VMITO_CHANNEL_TYPE } from './stream-chat.service';

export type ChatMode = 'DIRECT' | 'REQUEST' | 'UNAVAILABLE';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly termsVersion: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly notifications: NotificationsService,
    private readonly stream: StreamChatService
  ) {
    this.termsVersion =
      this.config.get<string>('STREAM_CHAT_TERMS_VERSION')?.trim() ||
      '2026-09-13';
  }

  async getSession(userId: string) {
    const [enabledByFlag, user, pendingRequestCount] = await Promise.all([
      this.featureFlags.isEnabled('CHAT_ENABLED'),
      this.findChatUser(userId),
      this.prisma.chatConversation.count({
        where: {
          recipientId: userId,
          status: ChatConversationStatus.PENDING,
          initialMessageId: { not: null },
        },
      }),
    ]);
    const enabled = enabledByFlag && this.stream.isConfigured;
    const consented = this.hasCurrentConsent(user);
    const base = {
      enabled,
      termsVersion: this.termsVersion,
      consented,
      pendingRequestCount,
    };
    if (!enabled || !consented) return base;

    await this.stream.ensureInfrastructure();
    await this.reconcileBlocksFor(userId);
    await this.reconcileBlockedPendingFor(userId);
    await this.stream.upsertUser(user);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    return {
      ...base,
      // Requests survive consent now, so the count stays truthful — the app
      // renders them as an inbox section to accept or decline one by one.
      pendingRequestCount: await this.prisma.chatConversation.count({
        where: {
          recipientId: userId,
          status: ChatConversationStatus.PENDING,
          initialMessageId: { not: null },
        },
      }),
      apiKey: this.stream.key,
      token: this.stream.createToken(userId, expiresAt),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async acceptTerms(userId: string, termsVersion: string) {
    await this.assertAvailable();
    if (termsVersion !== this.termsVersion) {
      throw new BadRequestException('Chat terms version is no longer current');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        chatTermsAcceptedVersion: this.termsVersion,
        chatTermsAcceptedAt: new Date(),
      },
    });
    // Consent opens chat; it does not answer anyone's request. `activatedCount`
    // stays in the payload for the clients that read it, always zero now.
    await this.reconcileBlockedPendingFor(userId);
    return { ...(await this.getSession(userId)), activatedCount: 0 };
  }

  async findContacts(userId: string, query: ChatContactsQueryDto) {
    await this.assertAvailable();
    const skip = (query.page - 1) * query.limit;
    const normalized = query.search.toLowerCase();
    const where: Prisma.UserWhereInput = {
      id: { not: userId },
      NOT: { email: { startsWith: 'deleted_' } },
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { searchTerms: { contains: normalized, mode: 'insensitive' } },
      ],
    };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          image: true,
          chatTermsAcceptedVersion: true,
          chatTermsAcceptedAt: true,
        },
        orderBy: { name: 'asc' },
        skip,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    const modes = await Promise.all(
      users.map((user) => this.getMode(userId, user.id, user))
    );
    return {
      data: users.map((user, index) => ({
        id: user.id,
        name: user.name,
        image: user.image,
        chatMode: modes[index],
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getRequests(userId: string) {
    await this.assertAvailable();
    const requests = await this.prisma.chatConversation.findMany({
      where: {
        recipientId: userId,
        status: ChatConversationStatus.PENDING,
        initialMessageId: { not: null },
      },
      select: {
        id: true,
        createdAt: true,
        requester: { select: { id: true, name: true, image: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((request) => ({
      id: request.id,
      sender: request.requester,
      createdAt: request.createdAt,
    }));
  }

  async createRequest(userId: string, dto: CreateChatRequestDto) {
    await this.assertAvailable();
    if (userId === dto.targetUserId) {
      throw new BadRequestException('Cannot message yourself');
    }
    const sender = await this.findChatUser(userId);
    if (!this.hasCurrentConsent(sender)) {
      throw new ForbiddenException('Accept chat terms before sending messages');
    }
    const recipient = await this.findChatUser(dto.targetUserId);
    if (this.hasCurrentConsent(recipient)) {
      throw new BadRequestException('Recipient is ready for direct chat');
    }
    await this.assertNotBlocked(userId, dto.targetUserId);

    const duplicate = await this.prisma.chatConversation.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (duplicate) {
      if (
        duplicate.requesterId !== userId ||
        duplicate.recipientId !== dto.targetUserId
      ) {
        throw new ConflictException('Idempotency key is already in use');
      }
      if (
        duplicate.status === ChatConversationStatus.PENDING &&
        !duplicate.initialMessageId
      ) {
        return this.deliverPendingRequest(duplicate, sender, recipient, dto);
      }
      return this.conversationResponse(duplicate);
    }

    const [participantAId, participantBId] = this.sortedPair(
      userId,
      dto.targetUserId
    );
    const existing = await this.prisma.chatConversation.findUnique({
      where: {
        participantAId_participantBId: { participantAId, participantBId },
      },
    });
    if (existing?.status === ChatConversationStatus.ACTIVE) {
      throw new ConflictException('Conversation is already active');
    }
    if (existing?.status === ChatConversationStatus.PENDING) {
      throw new ConflictException('A chat request is already pending');
    }
    if (
      existing?.status === ChatConversationStatus.DECLINED &&
      existing.requesterId === userId
    ) {
      throw new ForbiddenException('Recipient declined this chat request');
    }
    const requestsLastDay = await this.prisma.chatConversation.count({
      where: {
        requesterId: userId,
        requestSentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (requestsLastDay >= 5) {
      throw new ForbiddenException('Daily chat request limit reached');
    }

    const channelId = this.channelId(participantAId, participantBId);
    let reserved: ChatConversation;
    const requestSentAt = new Date();
    try {
      if (!existing) {
        reserved = await this.prisma.chatConversation.create({
          data: {
            participantAId,
            participantBId,
            requesterId: userId,
            recipientId: dto.targetUserId,
            streamChannelId: channelId,
            status: ChatConversationStatus.PENDING,
            idempotencyKey: dto.idempotencyKey,
            requestSentAt,
          },
        });
      } else {
        // Optimistic claim prevents two concurrent requests for the same pair
        // from both reaching Stream and creating two initial messages.
        const claimed = await this.prisma.chatConversation.updateMany({
          where: {
            id: existing.id,
            status: existing.status,
            updatedAt: existing.updatedAt,
          },
          data: {
            requesterId: userId,
            recipientId: dto.targetUserId,
            streamChannelId: channelId,
            status: ChatConversationStatus.PENDING,
            idempotencyKey: dto.idempotencyKey,
            initialMessageId: null,
            requestSentAt,
            activatedAt: null,
            declinedAt: null,
            cancelledAt: null,
            createdAt: requestSentAt,
          },
        });
        if (!claimed.count) {
          throw new ConflictException('Chat request changed concurrently');
        }
        reserved = await this.prisma.chatConversation.findUniqueOrThrow({
          where: { id: existing.id },
        });
      }
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const raced = await this.prisma.chatConversation.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (
          raced?.requesterId === userId &&
          raced.recipientId === dto.targetUserId
        ) {
          if (
            raced.status === ChatConversationStatus.PENDING &&
            !raced.initialMessageId
          ) {
            return this.deliverPendingRequest(raced, sender, recipient, dto);
          }
          return this.conversationResponse(raced);
        }
        throw new ConflictException('A chat request is already pending');
      }
      throw error;
    }

    return this.deliverPendingRequest(reserved, sender, recipient, dto);
  }

  private async deliverPendingRequest(
    reserved: ChatConversation,
    sender: { id: string; name: string; image: string | null },
    recipient: { id: string; name: string; image: string | null },
    dto: CreateChatRequestDto
  ) {
    try {
      await this.stream.ensureInfrastructure();
      await Promise.all([
        this.stream.upsertUser(sender),
        // Full profile, not just the id: a Stream user with no name makes
        // every client fall back to the raw user id as the channel title,
        // and the recipient only gets a name of their own once they open
        // chat themselves.
        this.stream.upsertUser(recipient),
      ]);
      const result = await this.stream.createPendingChannel({
        channelId: reserved.streamChannelId,
        senderId: sender.id,
        recipientId: recipient.id,
        text: dto.text,
        messageId: dto.idempotencyKey,
      });
      const conversation = await this.prisma.chatConversation.update({
        where: { id: reserved.id },
        data: { initialMessageId: result.messageId },
      });
      await this.notifications.createQueuedForUser(
        recipient.id,
        NotificationType.CHAT,
        'Yêu cầu trò chuyện mới',
        `${sender.name} muốn nhắn tin với bạn`,
        {
          action: 'chat_request',
          requestId: conversation.id,
          senderName: sender.name,
          route: '/chat/requests',
        },
        { dedupeKey: `chat-request:${conversation.id}`, conflictMode: 'ONCE' }
      );
      return this.conversationResponse(conversation);
    } catch (error) {
      await this.prisma.chatConversation.update({
        where: { id: reserved.id },
        data: {
          status: ChatConversationStatus.CANCELLED,
          cancelledAt: new Date(),
          idempotencyKey: null,
          requestSentAt: null,
          initialMessageId: null,
        },
      });
      try {
        await this.stream.deleteChannel(reserved.streamChannelId);
      } catch {
        // The deterministic channel id lets the next attempt reconcile it.
      }
      throw error;
    }
  }

  /**
   * Activates one pending request the recipient chose to accept.
   *
   * Consent no longer activates anything on its own: a request stays pending
   * until the recipient answers it here or in {@link declineRequest}, so the
   * inbox can show it as an incoming request the way the app does.
   */
  async acceptRequest(userId: string, requestId: string) {
    await this.assertAvailable();
    const conversation = await this.findConversation(requestId);
    if (conversation.recipientId !== userId) {
      throw new ForbiddenException('Only the recipient can accept a request');
    }
    if (conversation.status !== ChatConversationStatus.PENDING) {
      return this.conversationResponse(conversation);
    }
    const recipient = await this.findChatUser(userId);
    if (!this.hasCurrentConsent(recipient)) {
      throw new ForbiddenException('Accept chat terms before accepting requests');
    }
    // A block raised after the request was sent turns acceptance into a
    // decline — the same resolution reconciliation applies.
    if (
      await this.isBlocked(
        conversation.participantAId,
        conversation.participantBId
      )
    ) {
      return this.declineRequest(userId, requestId);
    }

    await this.stream.ensureInfrastructure();
    await this.stream.upsertUser(recipient);
    await this.stream.activateChannel(conversation.streamChannelId, [
      conversation.participantAId,
      conversation.participantBId,
    ]);
    return this.conversationResponse(
      await this.prisma.chatConversation.update({
        where: { id: requestId },
        data: {
          status: ChatConversationStatus.ACTIVE,
          activatedAt: new Date(),
        },
      })
    );
  }

  async declineRequest(userId: string, requestId: string) {
    const conversation = await this.findConversation(requestId);
    if (conversation.recipientId !== userId) {
      throw new ForbiddenException('Only the recipient can decline a request');
    }
    if (conversation.status !== ChatConversationStatus.PENDING) {
      return this.conversationResponse(conversation);
    }
    await this.stream.deleteChannel(conversation.streamChannelId);
    return this.conversationResponse(
      await this.prisma.chatConversation.update({
        where: { id: requestId },
        data: {
          status: ChatConversationStatus.DECLINED,
          declinedAt: new Date(),
          initialMessageId: null,
        },
      })
    );
  }

  async cancelRequest(userId: string, requestId: string) {
    const conversation = await this.findConversation(requestId);
    if (conversation.requesterId !== userId) {
      throw new ForbiddenException('Only the sender can cancel a request');
    }
    if (conversation.status !== ChatConversationStatus.PENDING) {
      return this.conversationResponse(conversation);
    }
    await this.stream.deleteChannel(conversation.streamChannelId);
    return this.conversationResponse(
      await this.prisma.chatConversation.update({
        where: { id: requestId },
        data: {
          status: ChatConversationStatus.CANCELLED,
          cancelledAt: new Date(),
          initialMessageId: null,
        },
      })
    );
  }

  async direct(userId: string, targetUserId: string) {
    await this.assertAvailable();
    if (userId === targetUserId)
      throw new BadRequestException('Cannot message yourself');
    const [current, target] = await Promise.all([
      this.findChatUser(userId),
      this.findChatUser(targetUserId),
    ]);
    if (!this.hasCurrentConsent(current) || !this.hasCurrentConsent(target)) {
      throw new BadRequestException('Both users must be ready for direct chat');
    }
    await this.assertNotBlocked(userId, targetUserId);
    const [participantAId, participantBId] = this.sortedPair(
      userId,
      targetUserId
    );
    const existing = await this.prisma.chatConversation.findUnique({
      where: {
        participantAId_participantBId: { participantAId, participantBId },
      },
    });
    if (
      existing?.status === ChatConversationStatus.DECLINED &&
      existing.recipientId !== userId
    ) {
      throw new ForbiddenException('Recipient declined this conversation');
    }
    await this.stream.ensureInfrastructure();
    await Promise.all([
      this.stream.upsertUser(current),
      this.stream.upsertUser(target),
    ]);
    const channelId =
      existing?.streamChannelId ??
      this.channelId(participantAId, participantBId);
    if (existing?.status === ChatConversationStatus.PENDING) {
      await this.stream.activateChannel(channelId, [
        participantAId,
        participantBId,
      ]);
    } else if (existing?.status !== ChatConversationStatus.ACTIVE) {
      await this.stream.createActiveChannel({
        channelId,
        firstUserId: participantAId,
        secondUserId: participantBId,
        createdById: userId,
      });
    }
    const conversation = await this.prisma.chatConversation.upsert({
      where: {
        participantAId_participantBId: { participantAId, participantBId },
      },
      create: {
        participantAId,
        participantBId,
        requesterId: userId,
        recipientId: targetUserId,
        streamChannelId: channelId,
        status: ChatConversationStatus.ACTIVE,
        activatedAt: new Date(),
      },
      update: {
        status: ChatConversationStatus.ACTIVE,
        activatedAt: new Date(),
        declinedAt: null,
        cancelledAt: null,
      },
    });
    return this.conversationResponse(conversation);
  }

  async block(userId: string, targetUserId: string) {
    await this.assertAvailable();
    if (userId === targetUserId) {
      throw new BadRequestException('Cannot block yourself');
    }
    const blocker = await this.findChatUser(userId);
    await this.findChatUser(targetUserId);
    const conversation = await this.findPair(userId, targetUserId);

    // Store the safety decision before talking to Stream. A provider outage
    // must never make a user appear unblocked to Vmito REST endpoints.
    await this.prisma.$transaction([
      this.prisma.chatBlock.upsert({
        where: {
          blockerId_blockedId: { blockerId: userId, blockedId: targetUserId },
        },
        create: { blockerId: userId, blockedId: targetUserId },
        update: {},
      }),
      ...(conversation?.status === ChatConversationStatus.PENDING
        ? [
            this.prisma.chatConversation.update({
              where: { id: conversation.id },
              data: {
                status: ChatConversationStatus.DECLINED,
                declinedAt: new Date(),
              },
            }),
          ]
        : []),
    ]);

    // A previously failed cleanup is retried for any non-active channel. The
    // delete adapter treats an already-deleted Stream channel as success.
    if (conversation && conversation.status !== ChatConversationStatus.ACTIVE) {
      await this.stream.deleteChannel(conversation.streamChannelId);
      await this.prisma.chatConversation.updateMany({
        where: { id: conversation.id },
        data: { initialMessageId: null },
      });
    }
    if (this.hasCurrentConsent(blocker)) {
      await this.stream.upsertMinimalUser(targetUserId);
      await this.stream.blockUser(userId, targetUserId);
    }
    return { blocked: true };
  }

  async unblock(userId: string, targetUserId: string) {
    const blocker = await this.findChatUser(userId);
    if (this.hasCurrentConsent(blocker) && this.stream.isConfigured) {
      await this.stream.unblockUser(userId, targetUserId);
    }
    await this.prisma.chatBlock.deleteMany({
      where: { blockerId: userId, blockedId: targetUserId },
    });
    return { blocked: false };
  }

  async getPublicChatMode(viewerId: string | undefined, targetUserId: string) {
    if (!viewerId || viewerId === targetUserId) return 'UNAVAILABLE' as const;
    if (
      !(await this.featureFlags.isEnabled('CHAT_ENABLED')) ||
      !this.stream.isConfigured
    ) {
      return 'UNAVAILABLE' as const;
    }
    const target = await this.findChatUser(targetUserId);
    return this.getMode(viewerId, targetUserId, target);
  }

  async deleteUserData(userId: string) {
    const [conversationCount, blockCount, user] = await Promise.all([
      this.prisma.chatConversation.count({
        where: { OR: [{ participantAId: userId }, { participantBId: userId }] },
      }),
      this.prisma.chatBlock.count({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { chatTermsAcceptedAt: true },
      }),
    ]);
    if (
      conversationCount === 0 &&
      blockCount === 0 &&
      !user?.chatTermsAcceptedAt
    ) {
      return;
    }
    if (!this.stream.isConfigured) {
      throw new ServiceUnavailableException(
        'Chat data cannot be deleted while Stream is not configured'
      );
    }
    await this.stream.deleteUserData(userId);
  }

  /**
   * Resolves pending requests a block has made unanswerable.
   *
   * Acceptance itself is explicit — see {@link acceptRequest}. This only
   * clears requests whose participants blocked each other after the request
   * was sent, so a blocked pair never keeps a live invitation between them.
   */
  private async reconcileBlockedPendingFor(userId: string) {
    const pending = await this.prisma.chatConversation.findMany({
      where: {
        recipientId: userId,
        status: ChatConversationStatus.PENDING,
        initialMessageId: { not: null },
      },
    });
    let declinedCount = 0;
    for (const conversation of pending) {
      const blocked = await this.isBlocked(
        conversation.participantAId,
        conversation.participantBId
      );
      if (!blocked) continue;

      await this.stream.deleteChannel(conversation.streamChannelId);
      await this.prisma.chatConversation.update({
        where: { id: conversation.id },
        data: {
          status: ChatConversationStatus.DECLINED,
          declinedAt: new Date(),
          initialMessageId: null,
        },
      });
      declinedCount++;
    }
    return declinedCount;
  }

  /**
   * Blocks can be created before consent. Mirror every local block involving
   * this user before issuing a Stream token so SDK access cannot bypass the
   * local source of truth.
   */
  private async reconcileBlocksFor(userId: string) {
    const blocks = await this.prisma.chatBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    for (const block of blocks) {
      try {
        await Promise.all([
          this.stream.upsertMinimalUser(block.blockerId),
          this.stream.upsertMinimalUser(block.blockedId),
        ]);
        await this.stream.blockUser(block.blockerId, block.blockedId);
      } catch (error) {
        this.logger.error(
          `Could not reconcile chat block ${block.blockerId}:${block.blockedId}`
        );
        throw error;
      }
    }
  }

  private async getMode(
    viewerId: string,
    targetUserId: string,
    target?: {
      chatTermsAcceptedVersion: string | null;
      chatTermsAcceptedAt: Date | null;
    }
  ): Promise<ChatMode> {
    if (await this.isBlocked(viewerId, targetUserId)) return 'UNAVAILABLE';
    const pair = await this.findPair(viewerId, targetUserId);
    if (
      pair?.status === ChatConversationStatus.DECLINED &&
      pair.requesterId === viewerId
    ) {
      return 'UNAVAILABLE';
    }
    if (pair?.status === ChatConversationStatus.ACTIVE) return 'DIRECT';
    const resolvedTarget = target ?? (await this.findChatUser(targetUserId));
    return this.hasCurrentConsent(resolvedTarget) ? 'DIRECT' : 'REQUEST';
  }

  private async assertAvailable() {
    const enabled = await this.featureFlags.isEnabled('CHAT_ENABLED');
    if (!enabled) throw new ServiceUnavailableException('Chat is disabled');
    if (!this.stream.isConfigured) {
      throw new ServiceUnavailableException('Chat service is not configured');
    }
  }

  private async assertNotBlocked(firstUserId: string, secondUserId: string) {
    if (await this.isBlocked(firstUserId, secondUserId)) {
      throw new ForbiddenException('Chat is unavailable for this user');
    }
  }

  private async isBlocked(firstUserId: string, secondUserId: string) {
    return (
      (await this.prisma.chatBlock.count({
        where: {
          OR: [
            { blockerId: firstUserId, blockedId: secondUserId },
            { blockerId: secondUserId, blockedId: firstUserId },
          ],
        },
      })) > 0
    );
  }

  private findPair(firstUserId: string, secondUserId: string) {
    const [participantAId, participantBId] = this.sortedPair(
      firstUserId,
      secondUserId
    );
    return this.prisma.chatConversation.findUnique({
      where: {
        participantAId_participantBId: { participantAId, participantBId },
      },
    });
  }

  private async findChatUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        image: true,
        email: true,
        chatTermsAcceptedVersion: true,
        chatTermsAcceptedAt: true,
      },
    });
    if (!user || user.email.startsWith('deleted_')) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private findConversation(id: string) {
    return this.prisma.chatConversation
      .findUnique({ where: { id } })
      .then((value) => {
        if (!value) throw new NotFoundException('Chat request not found');
        return value;
      });
  }

  private hasCurrentConsent(user: {
    chatTermsAcceptedVersion: string | null;
    chatTermsAcceptedAt: Date | null;
  }) {
    return (
      user.chatTermsAcceptedAt != null &&
      user.chatTermsAcceptedVersion === this.termsVersion
    );
  }

  private isUniqueConflict(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private sortedPair(first: string, second: string): [string, string] {
    return first.localeCompare(second) <= 0 ? [first, second] : [second, first];
  }

  private channelId(first: string, second: string) {
    const digest = createHash('sha256')
      .update(`${first}:${second}`)
      .digest('hex')
      .slice(0, 40);
    return `dm_${digest}`;
  }

  private conversationResponse(conversation: ChatConversation) {
    return {
      id: conversation.id,
      status: conversation.status,
      channel: {
        type: VMITO_CHANNEL_TYPE,
        id: conversation.streamChannelId,
        cid: `${VMITO_CHANNEL_TYPE}:${conversation.streamChannelId}`,
      },
    };
  }
}
