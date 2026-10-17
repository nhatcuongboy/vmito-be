import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { HostAwardDataService } from './host-award-data.service';
import { HostAwardsService } from './host-awards.service';
import { evaluateMonth } from './host-award-pipeline';
import {
  CATEGORY_RULES,
  HOST_AWARDS_FEATURE_FLAG,
  PROVISIONAL_TOP_N,
  REVIEW_TOP_N,
} from './host-awards.constants';
import { AwardFlag, HostMetrics } from './host-awards.types';

const HOST_SELECT = { id: true, name: true, image: true } as const;

/** Top-10 finishes needed for the lasting "Host Uy Tín" title. */
const TRUSTED_HOST_MIN_TOP10 = 3;

/** Read side: public boards, host progress, badges and the admin review list. */
@Injectable()
export class HostAwardsQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly data: HostAwardDataService,
    private readonly awards: HostAwardsService
  ) {}

  isEnabled() {
    return this.featureFlags.isEnabled(HOST_AWARDS_FEATURE_FLAG);
  }

  /**
   * Public board. The running month shows the live provisional top list;
   * past months are only visible once published.
   */
  async getBoard(monthKey?: string) {
    const range = this.awards.resolveMonth(monthKey);
    const empty = {
      monthKey: range.key,
      status: null,
      ranking: [],
      winners: [],
    };
    if (!(await this.isEnabled())) return { ...empty, enabled: false };

    const period = await this.prisma.hostAwardPeriod.findUnique({
      where: { monthKey: range.key },
    });
    const visible =
      period &&
      (period.status === 'PUBLISHED' ||
        (range.isCurrent && period.status === 'PROVISIONAL'));
    if (!visible) return { ...empty, enabled: true };

    const published = period.status === 'PUBLISHED';
    const entries = await this.prisma.hostAwardEntry.findMany({
      where: {
        periodId: period.id,
        excluded: false,
        OR: [
          {
            category: 'OVERALL',
            rank: {
              lte: published ? CATEGORY_RULES.overallTopN : PROVISIONAL_TOP_N,
            },
          },
          ...(published ? [{ category: { not: 'OVERALL' as const } }] : []),
        ],
      },
      include: { host: { select: HOST_SELECT } },
      orderBy: [{ category: 'asc' }, { rank: 'asc' }],
    });

    const toPublic = (e: (typeof entries)[number]) => ({
      rank: e.rank,
      category: e.category,
      score: e.score,
      host: e.host,
      highlights: publicHighlights(e.metrics),
    });
    return {
      enabled: true,
      monthKey: period.monthKey,
      status: period.status,
      computedAt: period.computedAt,
      publishedAt: period.publishedAt,
      ranking: entries.filter((e) => e.category === 'OVERALL').map(toPublic),
      winners: entries.filter((e) => e.category !== 'OVERALL').map(toPublic),
    };
  }

  /** Live progress of one host for the running month. */
  async getMyProgress(hostId: string) {
    const range = this.awards.resolveMonth();
    const dataset = await this.data.loadMonth(range.start, range.end, {
      hostIds: [hostId],
    });
    // Included even without sessions, so a new host sees every requirement.
    const host = evaluateMonth(dataset, {
      includeHostIds: [hostId],
    }).hosts.find((h) => h.hostId === hostId);

    const period = await this.prisma.hostAwardPeriod.findUnique({
      where: { monthKey: range.key },
      select: { id: true, computedAt: true },
    });
    const entry = period
      ? await this.prisma.hostAwardEntry.findUnique({
          where: {
            periodId_hostId_category: {
              periodId: period.id,
              hostId,
              category: 'OVERALL',
            },
          },
          select: { rank: true, score: true, excluded: true },
        })
      : null;

    return {
      monthKey: range.key,
      eligible: host?.eligibility.eligible ?? false,
      requirements: host?.eligibility.requirements ?? [],
      metrics: host ? publicHighlights(host.metrics) : null,
      rejectedSessions: host?.rejections ?? {},
      provisional:
        entry && !entry.excluded
          ? {
              rank: entry.rank,
              score: entry.score,
              computedAt: period?.computedAt,
            }
          : null,
    };
  }

  /** Badges from published months; withdrawn (excluded) awards disappear. */
  async getUserBadges(userId: string) {
    if (!(await this.isEnabled())) return { badges: [], titles: [] };
    const entries = await this.prisma.hostAwardEntry.findMany({
      where: {
        hostId: userId,
        excluded: false,
        period: { status: 'PUBLISHED' },
        OR: [
          { category: { not: 'OVERALL' } },
          { rank: { lte: CATEGORY_RULES.overallTopN } },
        ],
      },
      select: {
        category: true,
        rank: true,
        period: { select: { monthKey: true } },
      },
      orderBy: { period: { monthKey: 'desc' } },
    });
    const badges = entries.map((e) => ({
      monthKey: e.period.monthKey,
      category: e.category,
      rank: e.rank,
    }));
    const top10Months = badges.filter((b) => b.category === 'OVERALL').length;
    return {
      badges,
      titles: top10Months >= TRUSTED_HOST_MIN_TOP10 ? ['TRUSTED_HOST'] : [],
    };
  }

  /** Admin review: top hosts plus every flagged or excluded host, with detail. */
  async getReview(monthKey: string) {
    const range = this.awards.resolveMonth(monthKey);
    const period = await this.prisma.hostAwardPeriod.findUnique({
      where: { monthKey: range.key },
    });
    if (!period)
      return { monthKey: range.key, period: null, entries: [], winners: [] };

    const entries = await this.prisma.hostAwardEntry.findMany({
      where: { periodId: period.id },
      include: { host: { select: { ...HOST_SELECT, email: true } } },
      orderBy: [{ category: 'asc' }, { rank: 'asc' }],
    });
    const overall = entries.filter((e) => e.category === 'OVERALL');
    return {
      monthKey: period.monthKey,
      period,
      entries: overall.filter(
        (e) =>
          e.rank <= REVIEW_TOP_N ||
          e.excluded ||
          (e.flags as unknown as AwardFlag[]).length > 0
      ),
      winners: entries.filter((e) => e.category !== 'OVERALL'),
      totalRanked: overall.length,
    };
  }
}

/** Metrics safe to show publicly — fraud details and raw ratios stay internal. */
function publicHighlights(raw: Prisma.JsonValue | HostMetrics) {
  const m = raw as unknown as HostMetrics;
  return {
    qualifiedSessions: m.qualifiedSessions,
    distinctPlayers: m.distinctPlayers,
    returningPlayers: m.returningPlayers,
    newPlayers: m.growth,
    ratingAverage:
      m.ratingAverage === null ? null : Math.round(m.ratingAverage * 10) / 10,
    ratingCount: m.ratingCount,
  };
}
