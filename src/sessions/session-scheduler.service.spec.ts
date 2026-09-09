import { SessionSchedulerService } from './session-scheduler.service';

describe('SessionSchedulerService notification claims', () => {
  const prisma = {
    session: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const notifications = { createForUser: jest.fn() };
  const gateway = { notifyUser: jest.fn() };
  const sessionsService = {};
  const service = new SessionSchedulerService(
    prisma as never,
    notifications as never,
    gateway as never,
    sessionsService as never
  );

  beforeEach(() => jest.clearAllMocks());

  it('lets only one concurrent scheduler invocation claim a start reminder', async () => {
    const now = new Date('2026-09-08T10:00:00.000Z');
    const session = {
      id: 'session-1',
      name: 'Morning session',
      hostId: 'host-1',
    };
    prisma.session.findMany.mockResolvedValue([session]);
    prisma.session.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    notifications.createForUser.mockResolvedValue({ id: 'notification-1' });

    await Promise.all([
      service['sendStartReminders'](now),
      service['sendStartReminders'](now),
    ]);

    expect(prisma.session.updateMany).toHaveBeenCalledTimes(2);
    expect(notifications.createForUser).toHaveBeenCalledTimes(1);
    expect(notifications.createForUser).toHaveBeenCalledWith(
      'host-1',
      'SESSION',
      'Session starting in 15 minutes',
      expect.any(String),
      expect.objectContaining({
        sessionId: 'session-1',
        action: 'start_reminder',
      }),
      {
        dedupeKey: 'session:session-1:start-reminder',
        conflictMode: 'ONCE',
      }
    );
    expect(gateway.notifyUser).toHaveBeenCalledTimes(1);
  });
});
