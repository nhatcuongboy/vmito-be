import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HostAwardPeriodStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { resolvePeriodRange } from '../points/points.constants';
import { HostAwardDataService } from './host-award-data.service';
import { evaluateMonth } from './host-award-pipeline';
import {
  pickCategoryWinners,
  rankOverall,
  RankableHost,
} from './host-award-scoring';
import {
  CATEGORY_RULES,
  DAY_MS,
  FINALIZE_DAY_OF_MONTH,
  HOST_AWARDS_RULES_VERSION,
} from './host-awards.constants';
import { AwardFlag, HostMetrics } from './host-awards.types';

const CATEGORY_TITLES: Record<string, string> = {
  OVERALL: 'Host của Tháng',
  NEWCOMER_MAGNET: 'Host Kết Nối',
  MOST_LOVED: 'Host Được Yêu Thích',
  MOST_RELIABLE: 'Host Bền Bỉ',
  RISING_STAR: 'Host Triển Vọng',
};

interface Actor {
  userId: string;
  email?: string;
  name?: string;
}

/** Write side of the monthly host awards: compute, review, publish. */
@Injectable()
export class HostAwardsService {
  private readonly logger = new Logger(HostAwardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly data: HostAwardDataService,
    private readonly notifications: NotificationsService,
    private readonly auditLogs: AuditLogsService
  ) {}

  /** Strict month key parsing; refuses malformed and future months. */
  resolveMonth(monthKey?: string) {
    const range = resolvePeriodRange('month', monthKey);
    if (monthKey && range.key !== monthKey) {
      throw new BadRequestException(`Invalid or future month: ${monthKey}`);
    }
    return range as typeof range & { start: Date; end: Date; key: string };
  }

  /** Earliest moment a month may be finalized (VN 00:00 on day 8 of next month). */
  finalizeAfter(end: Date): Date {
    return new Date(end.getTime() + (FINALIZE_DAY_OF_MONTH - 1) * DAY_MS);
  }

  /**
   * Scores a month and stores the snapshot. Admin exclusions survive a
   * recompute; a published month is frozen.
   */
  async computeSnapshot(monthKey?: string, now = new Date()) {
    const range = this.resolveMonth(monthKey);
    const existing = await this.prisma.hostAwardPeriod.findUnique({
      where: { monthKey: range.key },
      include: { entries: { where: { category: 'OVERALL' } } },
    });
    if (existing?.status === 'PUBLISHED') {
      throw new ConflictException(`${range.key} is already published`);
    }

    const dataset = await this.data.loadMonth(range.start, range.end, {
      asOf: now,
    });
    const evaluation = evaluateMonth(dataset);
    const byHost = new Map(evaluation.hosts.map((h) => [h.hostId, h]));
    const reviewed = new Map(
      (existing?.entries ?? [])
        .filter((e) => e.reviewedById)
        .map((e) => [e.hostId, e])
    );

    const hosts = evaluation.scored.map((scored) => {
      const host = byHost.get(scored.hostId)!;
      const red = host.flags.filter((f) => f.severity === 'red');
      const review = reviewed.get(scored.hostId);
      return {
        hostId: scored.hostId,
        score: scored.score,
        trustFactor: scored.trustFactor,
        metrics: {
          ...host.metrics,
          components: scored.components,
          reliability: scored.reliability,
          rejections: host.rejections,
        } as HostMetrics,
        flags: host.flags,
        excluded: review ? review.excluded : red.length > 0,
        excludedReason: review
          ? review.excludedReason
          : red.length
            ? `Pending review: ${red.map((f) => f.code).join(', ')}`
            : null,
        reviewedById: review?.reviewedById ?? null,
        reviewedAt: review?.reviewedAt ?? null,
      };
    });

    const status: HostAwardPeriodStatus =
      range.isCurrent || now < this.finalizeAfter(range.end)
        ? 'PROVISIONAL'
        : 'PENDING_REVIEW';

    await this.prisma.$transaction(async (tx) => {
      const period = await tx.hostAwardPeriod.upsert({
        where: { monthKey: range.key },
        create: {
          monthKey: range.key,
          status,
          rulesVersion: HOST_AWARDS_RULES_VERSION,
          computedAt: now,
        },
        update: {
          status,
          rulesVersion: HOST_AWARDS_RULES_VERSION,
          computedAt: now,
        },
      });
      await tx.hostAwardEntry.deleteMany({ where: { periodId: period.id } });
      await tx.hostAwardEntry.createMany({
        data: this.entryRows(period.id, hosts),
      });
    });

    this.logger.log(
      `Host awards ${range.key}: ${evaluation.hosts.length} hosts, ${hosts.length} eligible, status ${status}`
    );
    return {
      monthKey: range.key,
      status,
      evaluatedHosts: evaluation.hosts.length,
      eligibleHosts: hosts.length,
      globalRatingMean: evaluation.globalRatingMean,
    };
  }

  /** Admin include/exclude of a host; side categories are re-picked. */
  async setExclusion(
    monthKey: string,
    hostId: string,
    excluded: boolean,
    reason: string | undefined,
    actor: Actor
  ) {
    if (excluded && !reason?.trim()) {
      throw new BadRequestException('A reason is required to exclude a host');
    }
    const period = await this.getPeriodOrThrow(monthKey);
    const entry = period.entries.find(
      (e) => e.hostId === hostId && e.category === 'OVERALL'
    );
    if (!entry) throw new NotFoundException('Host is not ranked this month');

    const hosts = period.entries
      .filter((e) => e.category === 'OVERALL')
      .map((e) =>
        e.hostId === hostId
          ? {
              ...e,
              excluded,
              excludedReason: excluded ? reason!.trim() : null,
              reviewedById: actor.userId,
              reviewedAt: new Date(),
            }
          : e
      )
      .map((e) => ({
        ...e,
        metrics: e.metrics as unknown as HostMetrics,
        flags: e.flags as unknown as AwardFlag[],
      }));

    await this.prisma.$transaction(async (tx) => {
      await tx.hostAwardEntry.deleteMany({ where: { periodId: period.id } });
      await tx.hostAwardEntry.createMany({
        data: this.entryRows(period.id, hosts),
      });
    });

    void this.auditLogs.create({
      action: 'UPDATE',
      entity: 'HostAwardEntry',
      entityId: `${monthKey}:${hostId}`,
      userId: actor.userId,
      userEmail: actor.email,
      userName: actor.name,
      details: { monthKey, hostId, excluded, reason: reason ?? null },
    });
    return { monthKey, hostId, excluded };
  }

  async publish(monthKey: string, actor: Actor) {
    const period = await this.getPeriodOrThrow(monthKey);
    if (period.status !== 'PENDING_REVIEW') {
      throw new ConflictException(
        `Only a month pending review can be published (current: ${period.status})`
      );
    }
    await this.prisma.hostAwardPeriod.update({
      where: { id: period.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishedById: actor.userId,
      },
    });

    const winners = period.entries.filter(
      (e) =>
        !e.excluded &&
        (e.category !== 'OVERALL' || e.rank <= CATEGORY_RULES.overallTopN)
    );
    for (const winner of winners) {
      await this.notifyWinner(monthKey, winner);
    }

    void this.auditLogs.create({
      action: 'UPDATE',
      entity: 'HostAwardPeriod',
      entityId: monthKey,
      userId: actor.userId,
      userEmail: actor.email,
      userName: actor.name,
      details: { monthKey, status: 'PUBLISHED', winners: winners.length },
    });
    return { monthKey, status: 'PUBLISHED', winners: winners.length };
  }

  async addSanction(
    hostId: string,
    reason: string,
    months: number | undefined,
    actor: Actor
  ) {
    const host = await this.prisma.user.findUnique({ where: { id: hostId } });
    if (!host) throw new NotFoundException('Host not found');
    const until = months ? new Date(Date.now() + months * 30 * DAY_MS) : null;
    const sanction = await this.prisma.hostAwardSanction.create({
      data: { hostId, reason, until, createdById: actor.userId },
    });
    void this.auditLogs.create({
      action: 'CREATE',
      entity: 'HostAwardSanction',
      entityId: sanction.id,
      userId: actor.userId,
      userEmail: actor.email,
      userName: actor.name,
      details: { hostId, reason, until: until?.toISOString() ?? null },
    });
    return sanction;
  }

  private async getPeriodOrThrow(monthKey: string) {
    const period = await this.prisma.hostAwardPeriod.findUnique({
      where: { monthKey },
      include: { entries: true },
    });
    if (!period) throw new NotFoundException(`No host awards for ${monthKey}`);
    return period;
  }

  private entryRows(
    periodId: string,
    hosts: (RankableHost & {
      trustFactor: number;
      flags: AwardFlag[];
      excludedReason: string | null;
      reviewedById: string | null;
      reviewedAt: Date | null;
    })[]
  ): Prisma.HostAwardEntryCreateManyInput[] {
    const overall = rankOverall(hosts);
    const byHost = new Map(overall.map((h) => [h.hostId, h]));
    const json = (value: unknown) => value as Prisma.InputJsonValue;

    return [
      ...overall.map((h) => ({
        periodId,
        hostId: h.hostId,
        category: 'OVERALL' as const,
        rank: h.rank,
        score: h.score,
        trustFactor: h.trustFactor,
        metrics: json(h.metrics),
        flags: json(h.flags),
        excluded: h.excluded,
        excludedReason: h.excludedReason,
        reviewedById: h.reviewedById,
        reviewedAt: h.reviewedAt,
      })),
      ...pickCategoryWinners(overall).map((pick) => {
        const h = byHost.get(pick.hostId)!;
        return {
          periodId,
          hostId: pick.hostId,
          category: pick.category,
          rank: pick.rank,
          score: pick.score,
          trustFactor: h.trustFactor,
          metrics: json(h.metrics),
          flags: json(h.flags),
        };
      }),
    ];
  }

  private async notifyWinner(
    monthKey: string,
    entry: { hostId: string; category: string; rank: number }
  ) {
    const [year, month] = monthKey.split('-');
    const title = CATEGORY_TITLES[entry.category] ?? 'Host tiêu biểu';
    const placement =
      entry.category === 'OVERALL'
        ? entry.rank === 1
          ? `"${title}" tháng ${Number(month)}/${year}`
          : `Top ${CATEGORY_RULES.overallTopN} Host tháng ${Number(month)}/${year} (hạng ${entry.rank})`
        : `"${title}" tháng ${Number(month)}/${year}`;
    try {
      await this.notifications.createForUser(
        entry.hostId,
        'SYSTEM',
        'Chúc mừng bạn được vinh danh!',
        `Bạn đạt danh hiệu ${placement}. Huy hiệu đã được gắn lên hồ sơ của bạn.`,
        {
          action: 'host_award',
          monthKey,
          category: entry.category,
          rank: entry.rank,
        },
        {
          dedupeKey: `host-award:${monthKey}:${entry.category}:${entry.hostId}`,
          conflictMode: 'ONCE',
        }
      );
    } catch (error) {
      this.logger.warn(
        `notifyWinner(${monthKey}, ${entry.hostId}) failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
