import { NotificationType, Prisma } from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const prisma = {
    notification: {
      create: jest.fn(),
      createManyAndReturn: jest.fn<Promise<unknown>, [unknown]>(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn<Promise<unknown>, [unknown]>(),
    },
    user: { count: jest.fn(), findUnique: jest.fn() },
    broadcastNotification: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    broadcastNotificationUserState: { upsert: jest.fn() },
    notificationInboxState: {
      findUnique: jest.fn(),
      upsert: jest.fn<Promise<unknown>, [unknown]>(),
    },
    notificationDevice: {
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    notificationPushDispatchJob: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const sessionsGateway = {
    notifyUser: jest.fn(),
    notifyAllAuthenticatedUsers: jest.fn(),
  };
  const pushNotifications = { send: jest.fn(), sendMany: jest.fn() };
  const service = new NotificationsService(
    prisma as never,
    sessionsGateway as never,
    pushNotifications as never
  );

  beforeEach(() => jest.clearAllMocks());

  it('delivers a created notification over socket and FCM', async () => {
    const notification = {
      id: 'notification-1',
      userId: 'user-1',
      type: NotificationType.SESSION,
      title: 'Court ready',
      message: 'Please enter court 2',
      data: { sessionId: 'session-1' },
      isRead: false,
      createdAt: new Date(),
    };
    prisma.notification.create.mockResolvedValue(notification);

    await service.create('user-1', {
      type: NotificationType.SESSION,
      title: notification.title,
      message: notification.message,
      data: notification.data,
    });

    expect(sessionsGateway.notifyUser).toHaveBeenCalledWith(
      'user-1',
      'notification_received',
      notification
    );
    expect(pushNotifications.send).toHaveBeenCalledWith(notification);
  });

  it('queues chat push atomically without sending FCM in the request', async () => {
    const notification = {
      id: 'notification-chat',
      userId: 'recipient',
      type: NotificationType.CHAT,
      title: 'Chat request',
      message: 'Sender wants to chat',
      data: { action: 'chat_request', requestId: 'request-1' },
      isRead: false,
      createdAt: new Date(),
    };
    prisma.notification.create.mockResolvedValue(notification);
    prisma.notificationPushDispatchJob.create.mockResolvedValue({
      id: 'job-1',
    });
    prisma.$transaction.mockImplementationOnce(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma)
    );

    await service.createQueuedForUser(
      'recipient',
      NotificationType.CHAT,
      notification.title,
      notification.message,
      notification.data,
      { dedupeKey: 'chat-request:request-1', conflictMode: 'ONCE' }
    );

    expect(prisma.notificationPushDispatchJob.create).toHaveBeenCalledWith({
      data: { notificationId: notification.id },
    });
    expect(sessionsGateway.notifyUser).toHaveBeenCalledWith(
      'recipient',
      'notification_received',
      notification
    );
    expect(pushNotifications.send).not.toHaveBeenCalled();
  });

  it('returns the existing row and does not redeliver an ONCE conflict', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '6.16.2',
    });
    const existing = { id: 'notification-existing' };
    prisma.notification.create.mockRejectedValueOnce(duplicate);
    prisma.notification.findUniqueOrThrow.mockResolvedValueOnce(existing);

    await expect(
      service.createForUser(
        'user-1',
        NotificationType.SESSION,
        'Title',
        'Message',
        { sessionId: 'session-1' },
        { dedupeKey: 'session:session-1:start', conflictMode: 'ONCE' }
      )
    ).resolves.toBe(existing);

    expect(sessionsGateway.notifyUser).not.toHaveBeenCalled();
    expect(pushNotifications.send).not.toHaveBeenCalled();
  });

  it('coalesces repeated events into one row and redelivers it', async () => {
    const notification = {
      id: 'notification-1',
      userId: 'user-1',
      type: NotificationType.PAYMENT,
      title: 'Reminder',
      message: 'Please pay',
      data: { reminderId: 'reminder-1' },
      isRead: false,
      dedupeKey: 'payment-reminder:reminder-1',
      occurrenceCount: 2,
      createdAt: new Date(),
    };
    prisma.notification.upsert.mockResolvedValueOnce(notification);

    await service.createForUser(
      'user-1',
      NotificationType.PAYMENT,
      notification.title,
      notification.message,
      notification.data,
      { dedupeKey: notification.dedupeKey, conflictMode: 'COALESCE' }
    );

    const rawUpsertCall: unknown =
      prisma.notification.upsert.mock.calls[0]?.[0];
    const upsertCall = rawUpsertCall as {
      where: { dedupeKey: string };
      update: { isRead: boolean; occurrenceCount: { increment: number } };
    };
    expect(upsertCall.where).toEqual({ dedupeKey: notification.dedupeKey });
    expect(upsertCall.update.isRead).toBe(false);
    expect(upsertCall.update.occurrenceCount).toEqual({ increment: 1 });
    expect(pushNotifications.send).toHaveBeenCalledWith(notification);
  });

  it('deduplicates batch recipients before inserting and dispatching', async () => {
    const notifications = [
      { id: 'n1', userId: 'u1' },
      { id: 'n2', userId: 'u2' },
    ];
    prisma.notification.createManyAndReturn.mockResolvedValueOnce(
      notifications
    );

    await service.createManyForUsers(
      ['u1', 'u1', 'u2'],
      NotificationType.CLUB,
      'Announcement',
      'Content',
      { announcementId: 'a1' },
      { dedupeKey: (userId) => `announcement:a1:${userId}` }
    );

    const rawCall: unknown =
      prisma.notification.createManyAndReturn.mock.calls[0]?.[0];
    const call = rawCall as {
      data: Array<{ userId: string; dedupeKey?: string }>;
      skipDuplicates: boolean;
    };
    expect(call.data).toEqual([
      expect.objectContaining({
        userId: 'u1',
        dedupeKey: 'announcement:a1:u1',
      }),
      expect.objectContaining({
        userId: 'u2',
        dedupeKey: 'announcement:a1:u2',
      }),
    ]);
    expect(call.skipDuplicates).toBe(true);
    expect(pushNotifications.sendMany).toHaveBeenCalledWith(notifications);
  });

  it('stores one shared campaign instead of one notification per user', async () => {
    const createdAt = new Date();
    const campaign = {
      id: 'broadcast-1',
      type: NotificationType.SYSTEM,
      title: 'Maintenance',
      message: 'Tonight',
      data: null,
      createdAt,
    };
    prisma.user.count.mockResolvedValueOnce(10_000);
    prisma.broadcastNotification.create.mockResolvedValueOnce(campaign);

    await expect(
      service.broadcastToAll(
        'admin-1',
        { title: campaign.title, message: campaign.message },
        'request-1'
      )
    ).resolves.toEqual({
      message: 'Notification broadcast to 10000 users',
      count: 10_000,
    });

    expect(prisma.broadcastNotification.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.createManyAndReturn).not.toHaveBeenCalled();
    expect(sessionsGateway.notifyAllAuthenticatedUsers).toHaveBeenCalledWith(
      'notification_received',
      campaign
    );
  });

  it('broadcasts to all users and includes link in data when provided', async () => {
    const createdAt = new Date('2026-09-01T00:00:00.000Z');
    const campaign = {
      id: 'broadcast-2',
      type: NotificationType.SYSTEM,
      title: 'Tournament Starting',
      message: 'Join now',
      data: { link: 'https://vmito.com/tournaments/123' },
      createdAt,
    };
    prisma.user.count.mockResolvedValueOnce(5_000);
    prisma.broadcastNotification.create.mockResolvedValueOnce(campaign);

    await expect(
      service.broadcastToAll(
        'admin-1',
        {
          title: campaign.title,
          message: campaign.message,
          link: '  https://vmito.com/tournaments/123  ',
        },
        'request-2'
      )
    ).resolves.toEqual({
      message: 'Notification broadcast to 5000 users',
      count: 5_000,
    });

    expect(prisma.broadcastNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: campaign.title,
          message: campaign.message,
          data: { link: 'https://vmito.com/tournaments/123' },
        }),
      })
    );
  });

  it('stores sparse per-user read state for a shared broadcast', async () => {
    const createdAt = new Date('2026-09-01T00:00:00.000Z');
    prisma.notification.findFirst.mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValueOnce({
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    prisma.notificationInboxState.findUnique.mockResolvedValueOnce(null);
    prisma.broadcastNotification.findFirst.mockResolvedValueOnce({
      id: 'broadcast-1',
      type: NotificationType.SYSTEM,
      title: 'Maintenance',
      message: 'Tonight',
      data: null,
      createdAt,
      userStates: [],
    });
    prisma.broadcastNotificationUserState.upsert.mockResolvedValueOnce({});

    await expect(service.markAsRead('broadcast-1', 'user-1')).resolves.toEqual({
      id: 'broadcast-1',
      userId: 'user-1',
      type: NotificationType.SYSTEM,
      title: 'Maintenance',
      message: 'Tonight',
      data: null,
      isRead: true,
      createdAt,
    });
    expect(prisma.broadcastNotificationUserState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          broadcastId_userId: {
            broadcastId: 'broadcast-1',
            userId: 'user-1',
          },
        },
      })
    );
  });

  it('uses one inbox cursor for read-all instead of expanding broadcasts', async () => {
    prisma.notification.updateMany.mockResolvedValueOnce({ count: 3 });
    prisma.notificationInboxState.upsert.mockResolvedValueOnce({});
    prisma.$transaction.mockResolvedValueOnce([]);

    await expect(service.markAllAsRead('user-1')).resolves.toEqual({
      message: 'All notifications marked as read',
    });
    const rawInboxCall: unknown =
      prisma.notificationInboxState.upsert.mock.calls[0]?.[0];
    const inboxCall = rawInboxCall as {
      where: { userId: string };
      create: { userId: string };
    };
    expect(inboxCall.where).toEqual({ userId: 'user-1' });
    expect(inboxCall.create.userId).toBe('user-1');
    expect(prisma.broadcastNotificationUserState.upsert).not.toHaveBeenCalled();
  });

  it('replaces an old token for the same app installation', async () => {
    prisma.notificationDevice.deleteMany.mockResolvedValue({ count: 1 });
    prisma.notificationDevice.upsert.mockResolvedValue({ id: 'device-1' });

    await service.registerDevice('user-1', {
      token: 'new-token',
      platform: 'android',
      appVersion: '1.0.0+1',
      locale: 'vi',
      deviceId: 'installation-1',
    });

    expect(prisma.notificationDevice.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        deviceId: 'installation-1',
        token: { not: 'new-token' },
      },
    });
    expect(prisma.notificationDevice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: 'new-token' } })
    );
  });

  it('only unregisters a token owned by the current user', async () => {
    prisma.notificationDevice.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      service.unregisterDevice('user-1', 'token-1')
    ).resolves.toEqual({ removed: true });
    expect(prisma.notificationDevice.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', token: 'token-1' },
    });
  });
});
