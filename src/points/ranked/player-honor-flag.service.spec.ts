import { BadRequestException } from '@nestjs/common';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PlayerHonorFlagService } from './player-honor-flag.service';
import { RankedLeaderboardService } from './ranked-leaderboard.service';

function flagService(enabled: boolean) {
  const isEnabled = jest.fn().mockResolvedValue(enabled);
  const flags = { isEnabled } as unknown as FeatureFlagsService;
  return { isEnabled, service: new PlayerHonorFlagService(flags) };
}

describe('PlayerHonorFlagService', () => {
  it('reads PLAYER_HONOR_ENABLED', async () => {
    const { isEnabled, service } = flagService(true);
    await expect(service.isEnabled()).resolves.toBe(true);
    expect(isEnabled).toHaveBeenCalledWith('PLAYER_HONOR_ENABLED');
  });

  it('blocks player actions while off', async () => {
    const { service } = flagService(false);
    await expect(service.assertEnabled()).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});

describe('RankedLeaderboardService while the flag is off', () => {
  const queryRaw = jest.fn();
  const prisma = {
    $queryRaw: queryRaw,
    user: { findMany: jest.fn() },
  } as unknown as PrismaService;
  const board = new RankedLeaderboardService(
    prisma,
    flagService(false).service
  );

  it('returns an empty, disabled board without querying the ledger', async () => {
    const result = await board.getLeaderboard({ period: 'month' });
    expect(result).toMatchObject({ enabled: false, entries: [], total: 0 });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('returns an empty standing with no periods', async () => {
    const result = await board.getMine('u1', {});
    expect(result).toMatchObject({
      enabled: false,
      points: 0,
      rank: null,
      periods: [],
    });
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
