import {
  ChatConversation,
  ChatConversationStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { ChatService } from './chat.service';
import {
  STREAM_PERMISSION,
  VMITO_ACTIVE_PERMISSIONS,
  VMITO_BLOCKLIST,
  VMITO_CHANNEL_SETTINGS,
  VMITO_PENDING_PERMISSIONS,
} from './stream-chat.service';

const termsVersion = '2026-09-13';
const now = new Date('2026-09-13T00:00:00.000Z');

const chatUser = (id: string, consented: boolean) => ({
  id,
  name: id === 'sender' ? 'Sender' : 'Recipient',
  image: null,
  email: `${id}@vmito.test`,
  chatTermsAcceptedVersion: consented ? termsVersion : null,
  chatTermsAcceptedAt: consented ? now : null,
});

const conversation = (
  status = ChatConversationStatus.PENDING
): ChatConversation => ({
  id: 'conversation-1',
  participantAId: 'recipient',
  participantBId: 'sender',
  requesterId: 'sender',
  recipientId: 'recipient',
  streamChannelId: 'dm_pair',
  status,
  initialMessageId:
    status === ChatConversationStatus.PENDING ? 'message-1' : null,
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
  requestSentAt: now,
  activatedAt: null,
  declinedAt: null,
  cancelledAt: null,
  createdAt: now,
  updatedAt: now,
});

describe('ChatService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    chatConversation: {
      count: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    chatBlock: {
      count: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'STREAM_CHAT_TERMS_VERSION' ? termsVersion : undefined
    ),
  };
  const featureFlags = { isEnabled: jest.fn() };
  const notifications = { createQueuedForUser: jest.fn() };
  const stream = {
    isConfigured: true,
    key: 'stream-key',
    ensureInfrastructure: jest.fn(),
    createToken: jest.fn(() => 'stream-token'),
    upsertUser: jest.fn(),
    upsertMinimalUser: jest.fn(),
    createPendingChannel: jest.fn(),
    activateChannel: jest.fn(),
    createActiveChannel: jest.fn(),
    deleteChannel: jest.fn(),
    blockUser: jest.fn(),
    unblockUser: jest.fn(),
    deleteUserData: jest.fn(),
  };
  const service = new ChatService(
    prisma as never,
    config as never,
    featureFlags as never,
    notifications as never,
    stream as never
  );

  beforeEach(() => {
    jest.clearAllMocks();
    featureFlags.isEnabled.mockResolvedValue(true);
    prisma.chatBlock.count.mockResolvedValue(0);
    prisma.chatBlock.findMany.mockResolvedValue([]);
    prisma.chatConversation.count.mockResolvedValue(0);
    prisma.chatConversation.findMany.mockResolvedValue([]);
    prisma.user.update.mockResolvedValue({});
    prisma.chatConversation.updateMany.mockResolvedValue({ count: 1 });
    stream.createPendingChannel.mockResolvedValue({ messageId: 'message-1' });
    notifications.createQueuedForUser.mockResolvedValue({});
    prisma.$transaction.mockImplementation(
      (operations: Array<Promise<unknown>>) => Promise.all(operations)
    );
  });

  it('does not issue Stream credentials before current chat consent', async () => {
    prisma.user.findUnique.mockResolvedValue(chatUser('recipient', false));
    prisma.chatConversation.count.mockResolvedValue(2);

    await expect(service.getSession('recipient')).resolves.toEqual({
      enabled: true,
      termsVersion,
      consented: false,
      pendingRequestCount: 2,
    });
    expect(stream.createToken).not.toHaveBeenCalled();
    expect(stream.upsertUser).not.toHaveBeenCalled();
  });

  it('refuses to create content for a sender without consent', async () => {
    prisma.user.findUnique.mockResolvedValue(chatUser('sender', false));

    await expect(
      service.createRequest('sender', {
        targetUserId: 'recipient',
        text: 'hello',
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(stream.createPendingChannel).not.toHaveBeenCalled();
  });

  it('stores exactly one initial message for an idempotent request', async () => {
    const pending = conversation();
    prisma.user.findUnique.mockImplementation(
      (query: { where: { id: string } }) =>
        Promise.resolve(chatUser(query.where.id, query.where.id === 'sender'))
    );
    prisma.chatConversation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pending);
    prisma.chatConversation.create.mockResolvedValue(pending);
    prisma.chatConversation.update.mockResolvedValue(pending);

    const dto = {
      targetUserId: 'recipient',
      text: 'private first message',
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
    };
    await service.createRequest('sender', dto);
    await service.createRequest('sender', dto);

    expect(stream.createPendingChannel).toHaveBeenCalledTimes(1);
    expect(stream.createPendingChannel).toHaveBeenCalledWith(
      expect.objectContaining({ text: dto.text, messageId: dto.idempotencyKey })
    );
    expect(notifications.createQueuedForUser).toHaveBeenCalledWith(
      'recipient',
      NotificationType.CHAT,
      expect.any(String),
      'Sender muốn nhắn tin với bạn',
      {
        action: 'chat_request',
        requestId: pending.id,
        senderName: 'Sender',
        route: '/chat/requests',
      },
      expect.any(Object)
    );
    const rawNotificationCalls: unknown =
      notifications.createQueuedForUser.mock.calls;
    const notificationCalls = rawNotificationCalls as unknown[][];
    const rawPushData = notificationCalls[0]?.[4];
    const pushData = rawPushData as Record<string, unknown>;
    expect(pushData).not.toHaveProperty('text');
    expect(pushData).not.toHaveProperty('cid');
  });

  it('activates each pending request once when terms are accepted', async () => {
    const pending = conversation();
    prisma.chatConversation.findMany
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([]);
    prisma.chatConversation.update.mockResolvedValue(
      conversation(ChatConversationStatus.ACTIVE)
    );
    prisma.user.findUnique.mockResolvedValue(chatUser('recipient', true));

    const result = await service.acceptTerms('recipient', termsVersion);

    expect(result.activatedCount).toBe(1);
    expect(stream.activateChannel).toHaveBeenCalledTimes(1);
    expect(stream.createToken).toHaveBeenCalledTimes(1);
  });

  it('does not reach Stream when a concurrent insert already reserved the pair', async () => {
    const pending = conversation();
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '6.16.2',
    });
    prisma.user.findUnique.mockImplementation(
      (query: { where: { id: string } }) =>
        Promise.resolve(chatUser(query.where.id, query.where.id === 'sender'))
    );
    prisma.chatConversation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pending);
    prisma.chatConversation.create.mockRejectedValueOnce(duplicate);

    await expect(
      service.createRequest('sender', {
        targetUserId: 'recipient',
        text: 'hello',
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
      })
    ).resolves.toEqual(
      expect.objectContaining({ id: pending.id, status: pending.status })
    );
    expect(stream.createPendingChannel).not.toHaveBeenCalled();
  });

  it('resumes an interrupted idempotent request without changing its message id', async () => {
    const reserved = { ...conversation(), initialMessageId: null };
    const completed = { ...reserved, initialMessageId: 'message-1' };
    prisma.user.findUnique.mockImplementation(
      (query: { where: { id: string } }) =>
        Promise.resolve(chatUser(query.where.id, query.where.id === 'sender'))
    );
    prisma.chatConversation.findUnique.mockResolvedValueOnce(reserved);
    prisma.chatConversation.update.mockResolvedValue(completed);

    await service.createRequest('sender', {
      targetUserId: 'recipient',
      text: 'same private message',
      idempotencyKey: reserved.idempotencyKey!,
    });

    expect(stream.createPendingChannel).toHaveBeenCalledTimes(1);
    expect(stream.createPendingChannel).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: reserved.idempotencyKey })
    );
  });

  it('enforces the five-new-recipient daily limit before Stream writes', async () => {
    prisma.user.findUnique.mockImplementation(
      (query: { where: { id: string } }) =>
        Promise.resolve(chatUser(query.where.id, query.where.id === 'sender'))
    );
    prisma.chatConversation.findUnique.mockResolvedValue(null);
    prisma.chatConversation.count.mockResolvedValue(5);

    await expect(
      service.createRequest('sender', {
        targetUserId: 'recipient',
        text: 'hello',
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    const rawCountCalls: unknown = prisma.chatConversation.count.mock.calls;
    const countCalls = rawCountCalls as Array<
      [{ where: { requesterId: string; requestSentAt: { gte: Date } } }]
    >;
    expect(countCalls.at(-1)?.[0].where.requesterId).toBe('sender');
    expect(countCalls.at(-1)?.[0].where.requestSentAt.gte).toBeInstanceOf(Date);
    expect(stream.createPendingChannel).not.toHaveBeenCalled();
  });

  it('persists a pre-consent block and removes pending content', async () => {
    const pending = conversation();
    prisma.user.findUnique.mockImplementation(
      (query: { where: { id: string } }) =>
        Promise.resolve(chatUser(query.where.id, false))
    );
    prisma.chatConversation.findUnique.mockResolvedValue(pending);
    prisma.chatBlock.upsert.mockResolvedValue({});
    prisma.chatConversation.update.mockResolvedValue(pending);

    await expect(service.block('recipient', 'sender')).resolves.toEqual({
      blocked: true,
    });

    expect(prisma.chatBlock.upsert).toHaveBeenCalledTimes(1);
    expect(stream.deleteChannel).toHaveBeenCalledWith(pending.streamChannelId);
    expect(stream.blockUser).not.toHaveBeenCalled();
  });

  it('grants Stream action IDs, not display names like "Read Own Channel"', () => {
    for (const permission of [
      ...VMITO_ACTIVE_PERMISSIONS,
      ...VMITO_PENDING_PERMISSIONS,
    ]) {
      expect(permission).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it('keeps pending roles read-only and disables unsupported V1 features', () => {
    expect(VMITO_PENDING_PERMISSIONS).toEqual([
      STREAM_PERMISSION.readChannel,
    ]);
    expect(VMITO_PENDING_PERMISSIONS).not.toContain(
      STREAM_PERMISSION.createMessage
    );
    expect(VMITO_ACTIVE_PERMISSIONS).toContain(
      STREAM_PERMISSION.createMessage
    );
    expect(VMITO_ACTIVE_PERMISSIONS).not.toContain(
      STREAM_PERMISSION.uploadAttachment
    );
    expect(VMITO_CHANNEL_SETTINGS).toEqual(
      expect.objectContaining({
        uploads: false,
        reactions: false,
        replies: false,
        polls: false,
        search: false,
        url_enrichment: false,
        blocklist: VMITO_BLOCKLIST,
        blocklist_behavior: 'flag',
        max_message_length: 2000,
      })
    );
  });
});
