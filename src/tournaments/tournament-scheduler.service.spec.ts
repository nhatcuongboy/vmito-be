import { TournamentSchedulerService } from './tournament-scheduler.service';
import { TournamentEventType } from './realtime/tournaments.gateway';

describe('TournamentSchedulerService', () => {
  it('atomically cancels expired PREPARING tournaments and emits once', async () => {
    const prisma = {
      tournament: {
        findMany: jest.fn().mockResolvedValue([{ id: 't1' }, { id: 't2' }]),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },
    };
    const gateway = { notifyTournamentEvent: jest.fn() };
    const service = new TournamentSchedulerService(
      prisma as never,
      gateway as never
    );

    await service.cancelExpiredPreparingTournaments(
      new Date('2026-09-07T17:00:00.000Z')
    );

    expect(prisma.tournament.findMany).toHaveBeenCalledWith({
      where: {
        status: 'PREPARING',
        endDate: { lt: new Date('2026-09-08T00:00:00.000Z') },
      },
      select: { id: true },
    });
    expect(gateway.notifyTournamentEvent).toHaveBeenCalledTimes(1);
    expect(gateway.notifyTournamentEvent).toHaveBeenCalledWith(
      't1',
      TournamentEventType.TOURNAMENT_ENDED,
      { status: 'CANCELLED', reason: 'expired_without_starting' }
    );
  });
});
