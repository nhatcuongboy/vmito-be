import { NotFoundException } from '@nestjs/common';
import { PlayersService } from './players.service';

describe('PlayersService join requests', () => {
  const createService = () => {
    const prisma = {
      player: {
        groupBy: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      session: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
    };
    const gateway = {
      notifyEvent: jest.fn(),
      notifyUser: jest.fn(),
    };
    const service = new PlayersService(
      prisma as never,
      gateway as never,
      undefined as never,
      undefined as never,
      undefined as never
    );
    return { gateway, prisma, service };
  };

  it('groups owned and created player slots by session in request order', async () => {
    const { prisma, service } = createService();
    const requestedAt = new Date('2026-08-12T08:00:00.000Z');
    prisma.player.groupBy.mockResolvedValue([
      { sessionId: 'session-1', _max: { createdAt: requestedAt } },
    ]);
    prisma.session.count.mockResolvedValue(1);
    prisma.session.findMany.mockResolvedValue([
      {
        id: 'session-1',
        name: 'Morning session',
        players: [
          { id: 'player-1', registrationStatus: 'PENDING' },
          { id: 'guest-1', registrationStatus: 'REJECTED' },
          { id: 'guest-2', registrationStatus: 'APPROVED' },
        ],
      },
    ]);

    const result = await service.getMyJoinRequests('user-1', 2, 10);

    const serializedGroupByCall = JSON.stringify(
      prisma.player.groupBy.mock.calls
    );
    expect(serializedGroupByCall).toContain('"userId":"user-1"');
    expect(serializedGroupByCall).toContain('"createdByUserId":"user-1"');
    expect(serializedGroupByCall).toContain('"skip":10');
    expect(serializedGroupByCall).toContain('"take":10');
    const firstResult = result.data[0] as unknown as {
      requestedAt: Date;
      players: Array<{ registrationStatus: string }>;
    };
    expect(firstResult.requestedAt).toEqual(requestedAt);
    expect(
      firstResult.players.map((player) => player.registrationStatus)
    ).toEqual(['PENDING', 'REJECTED', 'APPROVED']);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
  });

  it('withdraws only pending slots owned or created by the current user', async () => {
    const { gateway, prisma, service } = createService();
    prisma.player.findMany.mockResolvedValue([
      { id: 'player-1', session: { hostId: 'host-1' } },
      { id: 'guest-1', session: { hostId: 'host-1' } },
    ]);
    prisma.player.deleteMany.mockResolvedValue({ count: 2 });

    await expect(
      service.withdrawMyJoinRequest('user-1', 'session-1')
    ).resolves.toEqual({ deleted: 2 });
    expect(prisma.player.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['player-1', 'guest-1'] },
        sessionId: 'session-1',
        registrationStatus: 'PENDING',
        OR: [{ userId: 'user-1' }, { createdByUserId: 'user-1' }],
      },
    });
    expect(gateway.notifyUser).toHaveBeenCalledWith(
      'host-1',
      expect.any(String),
      expect.objectContaining({ sessionId: 'session-1' })
    );
  });

  it('does not withdraw another user request', async () => {
    const { prisma, service } = createService();
    prisma.player.findMany.mockResolvedValue([]);

    await expect(
      service.withdrawMyJoinRequest('user-1', 'session-1')
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.player.deleteMany).not.toHaveBeenCalled();
  });
});
