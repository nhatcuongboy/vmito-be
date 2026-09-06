import { NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const prisma = {
    notification: { create: jest.fn() },
    notificationDevice: {
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const sessionsGateway = { notifyUser: jest.fn() };
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
