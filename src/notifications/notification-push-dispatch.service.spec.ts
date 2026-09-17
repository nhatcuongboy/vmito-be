import { NotificationDispatchStatus, NotificationType } from '@prisma/client';
import { NotificationPushDispatchService } from './notification-push-dispatch.service';

describe('NotificationPushDispatchService', () => {
  const notification = {
    id: 'notification-1',
    userId: 'recipient',
    type: NotificationType.CHAT,
    title: 'Chat request',
    message: 'Sender wants to chat',
    data: { action: 'chat_request', requestId: 'request-1' },
    isRead: false,
    dedupeKey: 'chat-request:request-1',
    occurrenceCount: 1,
    createdAt: new Date(),
  };
  const job = {
    id: 'job-1',
    notificationId: notification.id,
    status: NotificationDispatchStatus.PENDING,
    attempts: 0,
    availableAt: new Date(),
    lockedAt: null,
    completedAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    notification,
  };
  const prisma = {
    notificationPushDispatchJob: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const push = { sendOrThrow: jest.fn() };
  const service = new NotificationPushDispatchService(
    prisma as never,
    push as never
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.notificationPushDispatchJob.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.notificationPushDispatchJob.findFirst.mockResolvedValue(job);
    prisma.notificationPushDispatchJob.update.mockResolvedValue({});
  });

  it('marks a delivered queued notification complete', async () => {
    push.sendOrThrow.mockResolvedValue(undefined);

    await expect(service.processNext()).resolves.toEqual({ processed: 1 });

    expect(push.sendOrThrow).toHaveBeenCalledWith(notification);
    const rawUpdateCalls: unknown =
      prisma.notificationPushDispatchJob.update.mock.calls;
    const updateCalls = rawUpdateCalls as Array<
      [{ where: { id: string }; data: Record<string, unknown> }]
    >;
    const completedCall = updateCalls.at(-1)?.[0];
    expect(completedCall?.where).toEqual({ id: job.id });
    expect(completedCall?.data.status).toBe(
      NotificationDispatchStatus.COMPLETED
    );
    expect(completedCall?.data.lockedAt).toBeNull();
    expect(completedCall?.data.lastError).toBeNull();
  });

  it('requeues a transient FCM failure without touching the chat message', async () => {
    push.sendOrThrow.mockRejectedValue(new Error('FCM unavailable'));

    await expect(service.processNext()).resolves.toEqual({
      processed: 0,
      failed: true,
    });

    const rawUpdateCalls: unknown =
      prisma.notificationPushDispatchJob.update.mock.calls;
    const updateCalls = rawUpdateCalls as Array<
      [{ where: { id: string }; data: Record<string, unknown> }]
    >;
    const failedCall = updateCalls.at(-1)?.[0];
    expect(failedCall?.where).toEqual({ id: job.id });
    expect(failedCall?.data.status).toBe(NotificationDispatchStatus.FAILED);
    expect(failedCall?.data.lockedAt).toBeNull();
    expect(failedCall?.data.lastError).toBe('FCM unavailable');
  });
});
