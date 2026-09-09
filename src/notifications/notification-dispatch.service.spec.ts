import { NotificationDispatchStatus, NotificationType } from '@prisma/client';
import { NotificationDispatchService } from './notification-dispatch.service';

describe('NotificationDispatchService', () => {
  const cutoff = new Date('2026-09-01T00:00:00.000Z');
  const candidate = {
    id: 'job-1',
    broadcastId: 'broadcast-1',
    status: NotificationDispatchStatus.PENDING,
    cursor: null,
    attempts: 0,
    broadcast: {
      id: 'broadcast-1',
      type: NotificationType.SYSTEM,
      title: 'Maintenance',
      message: 'Tonight',
      data: null,
      deletedAt: null,
      audienceCutoffAt: cutoff,
    },
  };
  const prisma = {
    broadcastNotificationDispatchJob: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn<Promise<unknown>, [unknown]>(),
    },
    notificationDevice: { findMany: jest.fn() },
  };
  const pushNotifications = { sendBroadcast: jest.fn() };
  const service = new NotificationDispatchService(
    prisma as never,
    pushNotifications as never
  );

  beforeEach(() => jest.clearAllMocks());

  it('claims a job and completes a token batch smaller than 500', async () => {
    prisma.broadcastNotificationDispatchJob.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.broadcastNotificationDispatchJob.findFirst.mockResolvedValueOnce(
      candidate
    );
    prisma.notificationDevice.findMany.mockResolvedValueOnce([
      { id: 'device-1', token: 'token-1' },
      { id: 'device-2', token: 'token-2' },
    ]);
    prisma.broadcastNotificationDispatchJob.update.mockResolvedValueOnce({});
    pushNotifications.sendBroadcast.mockResolvedValueOnce(undefined);

    await expect(service.processNextBroadcastBatch()).resolves.toEqual({
      processed: 2,
    });
    expect(prisma.notificationDevice.findMany).toHaveBeenCalledWith({
      where: {
        user: { is: { createdAt: { lte: cutoff } } },
      },
      select: { id: true, token: true },
      orderBy: { id: 'asc' },
      take: 500,
    });
    expect(pushNotifications.sendBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'broadcast-1' }),
      ['token-1', 'token-2']
    );
    const rawUpdateCall: unknown =
      prisma.broadcastNotificationDispatchJob.update.mock.calls[0]?.[0];
    const updateCall = rawUpdateCall as {
      where: { id: string };
      data: { status: NotificationDispatchStatus; cursor: string };
    };
    expect(updateCall.where).toEqual({ id: 'job-1' });
    expect(updateCall.data.status).toBe(NotificationDispatchStatus.COMPLETED);
    expect(updateCall.data.cursor).toBe('device-2');
  });

  it('persists the cursor and requeues after a full batch', async () => {
    prisma.broadcastNotificationDispatchJob.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.broadcastNotificationDispatchJob.findFirst.mockResolvedValueOnce(
      candidate
    );
    const devices = Array.from({ length: 500 }, (_, index) => ({
      id: `device-${String(index).padStart(3, '0')}`,
      token: `token-${index}`,
    }));
    prisma.notificationDevice.findMany.mockResolvedValueOnce(devices);
    prisma.broadcastNotificationDispatchJob.update.mockResolvedValueOnce({});
    pushNotifications.sendBroadcast.mockResolvedValueOnce(undefined);

    await expect(service.processNextBroadcastBatch()).resolves.toEqual({
      processed: 500,
    });
    const rawUpdateCall: unknown =
      prisma.broadcastNotificationDispatchJob.update.mock.calls[0]?.[0];
    const updateCall = rawUpdateCall as {
      where: { id: string };
      data: {
        status: NotificationDispatchStatus;
        cursor: string;
        lockedAt: null;
      };
    };
    expect(updateCall.where).toEqual({ id: 'job-1' });
    expect(updateCall.data).toEqual(
      expect.objectContaining({
        status: NotificationDispatchStatus.PENDING,
        cursor: 'device-499',
        lockedAt: null,
      })
    );
  });
});
