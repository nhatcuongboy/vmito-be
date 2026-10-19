import { bayesianRating } from './host-award-metrics';
import {
  percentileRanks,
  pickCategoryWinners,
  rankOverall,
  RankableHost,
  scoreHosts,
} from './host-award-scoring';
import { HostMetrics } from './host-awards.types';

function metrics(
  hostId: string,
  overrides: Partial<HostMetrics> = {}
): HostMetrics {
  return {
    hostId,
    qualifiedSessions: 8,
    activity: 8,
    distinctPlayers: 20,
    accountPlayers: 20,
    guestPlayers: 0,
    reach: 20,
    returningPlayers: 10,
    retention: 0.5,
    growth: 2,
    ratingCount: 10,
    ratingAverage: 4.5,
    quality: 4.5,
    finishedSessions: 8,
    cancelledSessions: 0,
    cancelRate: 0,
    hostAccountAgeDays: 365,
    hostingAgeDays: 300,
    medianMatchMinutes: 15,
    ...overrides,
  };
}

describe('host award scoring', () => {
  it('ranks values as percentiles with shared mid-ranks for ties', () => {
    expect(percentileRanks([10, 20, 30])).toEqual([0, 50, 100]);
    expect(percentileRanks([5, 5])).toEqual([50, 50]);
    expect(percentileRanks([7])).toEqual([100]);
  });

  it('pulls a few perfect ratings toward the platform mean', () => {
    const fewPerfect = bayesianRating(3 * 5, 3, 4.2);
    const manyGood = bayesianRating(40 * 4.7, 40, 4.2);
    expect(fewPerfect).toBeLessThan(manyGood);
  });

  it('caps the effect of one inflated metric', () => {
    const scored = scoreHosts(
      [
        metrics('balanced', { reach: 40, retention: 0.6, growth: 6 }),
        metrics('inflated', {
          reach: 4000,
          retention: 0.1,
          growth: 0,
        }),
        metrics('weak', { reach: 15, retention: 0.2, growth: 1 }),
      ],
      new Map()
    );
    expect(scored[0].hostId).toBe('balanced');
  });

  it('applies cancellation reliability and the fraud trust factor', () => {
    const [clean, penalised] = scoreHosts(
      [metrics('a'), metrics('b', { cancelRate: 0.2 })],
      new Map([['b', 0.8]])
    ).sort((x, y) => x.hostId.localeCompare(y.hostId));
    expect(penalised.score).toBeCloseTo(clean.score * 0.8 * 0.8, 1);
  });

  it('puts excluded hosts after included ones and keeps them out of categories', () => {
    const hosts: RankableHost[] = [
      {
        hostId: 'cheat',
        score: 99,
        excluded: true,
        metrics: metrics('cheat', { growth: 50 }),
      },
      {
        hostId: 'a',
        score: 80,
        excluded: false,
        metrics: metrics('a', { growth: 6 }),
      },
      {
        hostId: 'b',
        score: 70,
        excluded: false,
        metrics: metrics('b', { growth: 9, hostingAgeDays: 30 }),
      },
    ];
    expect(rankOverall(hosts).map((h) => [h.hostId, h.rank])).toEqual([
      ['a', 1],
      ['b', 2],
      ['cheat', 3],
    ]);
    const winners = new Map(
      pickCategoryWinners(hosts).map((p) => [p.category, p.hostId])
    );
    expect(winners.get('NEWCOMER_MAGNET')).toBe('b');
    expect(winners.get('RISING_STAR')).toBe('b');
    expect(winners.has('MOST_LOVED')).toBe(false); // nobody has 15 ratings
  });
});
