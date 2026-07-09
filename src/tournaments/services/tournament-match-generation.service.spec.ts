import { MatchStatus, TournamentCourtStatus } from '@prisma/client';
import { TournamentMatchGenerationService } from './tournament-match-generation.service';

describe('TournamentMatchGenerationService', () => {
  const buildPrisma = () => ({
    tournament: {
      findUnique: jest.fn().mockResolvedValue({ hostId: 'user-1' }),
    },
    categoryMatch: {
      findMany: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 4 }),
    },
    category: {
      findMany: jest.fn(),
    },
    tournamentCourt: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest
      .fn()
      .mockImplementation(async (ops: unknown[]) => Promise.all(ops)),
  });

  it('returns schedule readiness counts without mutating matches', async () => {
    const prisma = buildPrisma();
    prisma.categoryMatch.findMany.mockResolvedValue([
      {
        status: MatchStatus.SCHEDULED,
        courtId: 'court-1',
        startTime: new Date(),
        round: 'GROUP',
        groupId: 'group-1',
        participants: [{ id: 'p1' }, { id: 'p2' }],
      },
      {
        status: MatchStatus.SCHEDULED,
        courtId: null,
        startTime: null,
        round: 'GROUP',
        groupId: 'group-1',
        participants: [{ id: 'p3' }, { id: 'p4' }],
      },
      {
        status: MatchStatus.IN_PROGRESS,
        courtId: 'court-2',
        startTime: new Date(),
        round: 'GROUP',
        groupId: 'group-2',
        participants: [{ id: 'p5' }, { id: 'p6' }],
      },
      {
        status: MatchStatus.FINISHED,
        courtId: 'court-3',
        startTime: new Date(),
        round: 'GROUP',
        groupId: 'group-2',
        participants: [{ id: 'p7' }, { id: 'p8' }],
      },
    ]);
    prisma.category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Singles', _count: { matches: 2 } },
      { id: 'cat-2', name: 'Doubles', _count: { matches: 0 } },
    ]);
    const service = new TournamentMatchGenerationService(prisma as never);

    await expect(
      service.getScheduleReadiness('tournament-1', 'user-1')
    ).resolves.toEqual({
      totalMatches: 4,
      schedulableMatches: 2,
      scheduledMatches: 1,
      unscheduledMatches: 1,
      inProgressMatches: 1,
      finishedMatches: 1,
      categoriesWithoutMatches: [
        { categoryId: 'cat-2', categoryName: 'Doubles' },
      ],
      canGenerateSchedule: true,
      blockingReason: undefined,
    });
    expect(prisma.categoryMatch.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes all tournament matches and releases occupied current courts', async () => {
    const prisma = buildPrisma();
    const service = new TournamentMatchGenerationService(prisma as never);

    await expect(
      service.deleteAllTournamentMatches('tournament-1', 'user-1')
    ).resolves.toEqual({ success: true, deletedCount: 4 });
    expect(prisma.tournamentCourt.updateMany).toHaveBeenCalledWith({
      where: {
        tournamentId: 'tournament-1',
        currentMatch: { is: { category: { tournamentId: 'tournament-1' } } },
        status: TournamentCourtStatus.OCCUPIED,
      },
      data: {
        currentMatchId: null,
        status: TournamentCourtStatus.AVAILABLE,
      },
    });
    expect(prisma.categoryMatch.deleteMany).toHaveBeenCalledWith({
      where: {
        category: { tournamentId: 'tournament-1' },
      },
    });
  });
});
