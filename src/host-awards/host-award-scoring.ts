import { HostAwardCategory } from '@prisma/client';
import {
  CATEGORY_RULES,
  ELIGIBILITY,
  SCORE_WEIGHTS,
  ScoreComponent,
} from './host-awards.constants';
import { CategoryPick, HostMetrics, ScoredHost } from './host-awards.types';

const COMPONENTS = Object.keys(SCORE_WEIGHTS) as ScoreComponent[];

/**
 * Percentile rank (0–100) of every value within the list; ties share their
 * mid-rank. Ranks, not raw values, are combined so one inflated metric can
 * never dominate the total.
 */
export function percentileRanks(values: number[]): number[] {
  if (values.length <= 1) return values.map(() => 100);
  return values.map((value) => {
    const below = values.filter((v) => v < value).length;
    const equal = values.filter((v) => v === value).length;
    return ((below + (equal - 1) / 2) / (values.length - 1)) * 100;
  });
}

const componentValue = (m: HostMetrics, c: ScoreComponent): number => {
  switch (c) {
    case 'reach':
      return m.distinctPlayers;
    case 'activity':
      return m.activity;
    case 'retention':
      return m.retention;
    case 'growth':
      return m.growth;
    case 'quality':
      return m.quality;
  }
};

/** Cancellations up to the eligibility cap cost up to 30% of the score. */
export const reliabilityFactor = (cancelRate: number) =>
  1 - Math.min(ELIGIBILITY.maxCancelRate, cancelRate);

export function scoreHosts(
  eligible: HostMetrics[],
  trustByHost: Map<string, number>
): ScoredHost[] {
  const ranks = new Map<ScoreComponent, number[]>(
    COMPONENTS.map((c) => [
      c,
      percentileRanks(eligible.map((m) => componentValue(m, c))),
    ])
  );

  return eligible
    .map((metrics, index) => {
      const components = Object.fromEntries(
        COMPONENTS.map((c) => [c, round(ranks.get(c)![index])])
      ) as Record<ScoreComponent, number>;
      const weighted = COMPONENTS.reduce(
        (sum, c) => sum + SCORE_WEIGHTS[c] * ranks.get(c)![index],
        0
      );
      const reliability = reliabilityFactor(metrics.cancelRate);
      const trustFactor = trustByHost.get(metrics.hostId) ?? 1;
      return {
        hostId: metrics.hostId,
        score: round(weighted * reliability * trustFactor),
        components,
        reliability: round(reliability),
        trustFactor: round(trustFactor),
      };
    })
    .sort((a, b) => b.score - a.score);
}

export interface RankableHost {
  hostId: string;
  score: number;
  metrics: HostMetrics;
  excluded: boolean;
}

/** OVERALL ranks: included hosts first by score, excluded ones after. */
export function rankOverall<T extends RankableHost>(
  hosts: T[]
): (T & { rank: number })[] {
  const byScore = (a: T, b: T) => b.score - a.score;
  return [
    ...hosts.filter((h) => !h.excluded).sort(byScore),
    ...hosts.filter((h) => h.excluded).sort(byScore),
  ].map((host, index) => ({ ...host, rank: index + 1 }));
}

/** One winner per side category, chosen among non-excluded hosts. */
export function pickCategoryWinners(hosts: RankableHost[]): CategoryPick[] {
  const pool = hosts.filter((h) => !h.excluded);
  const best = (
    category: HostAwardCategory,
    candidates: RankableHost[],
    value: (h: RankableHost) => number
  ): CategoryPick | null => {
    const winner = [...candidates].sort(
      (a, b) => value(b) - value(a) || b.score - a.score
    )[0];
    return winner
      ? { hostId: winner.hostId, category, rank: 1, score: winner.score }
      : null;
  };

  return [
    best(
      'NEWCOMER_MAGNET',
      pool.filter((h) => h.metrics.growth >= CATEGORY_RULES.newcomerMinGrowth),
      (h) => h.metrics.growth
    ),
    best(
      'MOST_LOVED',
      pool.filter(
        (h) => h.metrics.ratingCount >= CATEGORY_RULES.lovedMinRatings
      ),
      (h) => h.metrics.quality
    ),
    best(
      'MOST_RELIABLE',
      pool.filter(
        (h) =>
          h.metrics.qualifiedSessions >= CATEGORY_RULES.reliableMinSessions &&
          h.metrics.cancelledSessions === 0
      ),
      (h) => h.metrics.activity
    ),
    best(
      'RISING_STAR',
      pool.filter(
        (h) =>
          h.metrics.hostingAgeDays !== null &&
          h.metrics.hostingAgeDays < CATEGORY_RULES.risingStarMaxHostAgeDays
      ),
      (h) => h.score
    ),
  ].filter((pick): pick is CategoryPick => pick !== null);
}

const round = (value: number) => Math.round(value * 100) / 100;
