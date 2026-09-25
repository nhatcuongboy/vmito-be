import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsGateway } from '../sessions/sessions.gateway';
import { buildVirtualLikers, VirtualLiker } from './virtual-likers';

export const NEWSFEED_ENGAGEMENT_BOOST_FLAG =
  'NEWSFEED_ENGAGEMENT_BOOST_ENABLED';

const MINUTE_MS = 60_000;
const FIRST_LIKE_MINUTES = { min: 2, max: 8 };
const BOOST_DURATION_MINUTES = { min: 30, max: 90 };
const PROCESSING_BATCH_SIZE = 100;

// Targets intentionally favor smaller values. The entries map to targets 1..9
// and add up to 100, making the distribution straightforward to reason about.
const TARGET_WEIGHTS = [25, 20, 16, 12, 9, 7, 5, 4, 2] as const;

type BoostCreateData = Prisma.PostEngagementBoostCreateWithoutPostInput;

@Injectable()
export class NewsfeedEngagementBoostService {
  private readonly logger = new Logger(NewsfeedEngagementBoostService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly sessionsGateway: SessionsGateway
  ) {}

  /**
   * Builds nested Prisma create data for a new post. Flag failures are
   * fail-closed so publishing a post never depends on this optional feature.
   */
  async buildCreateData(
    now = new Date()
  ): Promise<BoostCreateData | undefined> {
    try {
      if (
        !(await this.featureFlags.isEnabled(NEWSFEED_ENGAGEMENT_BOOST_FLAG))
      ) {
        return undefined;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to read engagement boost flag: ${this.errorMessage(error)}`
      );
      return undefined;
    }

    const targetCount = this.pickTargetCount();
    const firstDelay = this.randomInteger(
      FIRST_LIKE_MINUTES.min,
      FIRST_LIKE_MINUTES.max
    );
    const duration = this.randomInteger(
      BOOST_DURATION_MINUTES.min,
      BOOST_DURATION_MINUTES.max
    );

    return {
      targetCount,
      currentCount: 0,
      nextLikeAt: new Date(now.getTime() + firstDelay * MINUTE_MS),
      endsAt: new Date(now.getTime() + duration * MINUTE_MS),
    };
  }

  async getDisplayedLikeCount(
    postId: string,
    realLikeCount?: number
  ): Promise<number> {
    const [resolvedRealCount, boost] = await Promise.all([
      realLikeCount === undefined
        ? this.prisma.postLike.count({ where: { postId } })
        : Promise.resolve(realLikeCount),
      this.prisma.postEngagementBoost.findUnique({
        where: { postId },
        select: { currentCount: true },
      }),
    ]);

    return resolvedRealCount + (boost?.currentCount ?? 0);
  }

  /**
   * Not gated on the feature flag: boosted likes already counted on a post
   * must stay listable after the flag is switched off.
   */
  async getVirtualLikers(postId: string): Promise<VirtualLiker[]> {
    const boost = await this.prisma.postEngagementBoost.findUnique({
      where: { postId },
      select: { currentCount: true },
    });
    return buildVirtualLikers(postId, boost?.currentCount ?? 0);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processDueBoosts(now = new Date()): Promise<number> {
    try {
      if (
        !(await this.featureFlags.isEnabled(NEWSFEED_ENGAGEMENT_BOOST_FLAG))
      ) {
        return 0;
      }
    } catch (error) {
      this.logger.warn(
        `Skipped engagement boosts because flag lookup failed: ${this.errorMessage(error)}`
      );
      return 0;
    }

    const dueBoosts = await this.prisma.postEngagementBoost.findMany({
      where: {
        nextLikeAt: { lte: now },
        currentCount: {
          lt: this.prisma.postEngagementBoost.fields.targetCount,
        },
      },
      orderBy: { nextLikeAt: 'asc' },
      take: PROCESSING_BATCH_SIZE,
      select: {
        postId: true,
        targetCount: true,
        currentCount: true,
        nextLikeAt: true,
        endsAt: true,
      },
    });

    let appliedCount = 0;
    for (const boost of dueBoosts) {
      try {
        if (await this.applyOneBoost(boost, now)) appliedCount += 1;
      } catch (error) {
        this.logger.warn(
          `Failed to apply engagement boost for post ${boost.postId}: ${this.errorMessage(error)}`
        );
      }
    }

    if (appliedCount > 0) {
      this.logger.log(`Applied ${appliedCount} newsfeed engagement boost(s)`);
    }
    return appliedCount;
  }

  private async applyOneBoost(
    boost: {
      postId: string;
      targetCount: number;
      currentCount: number;
      nextLikeAt: Date;
      endsAt: Date;
    },
    now: Date
  ): Promise<boolean> {
    const nextCount = boost.currentCount + 1;
    const nextLikeAt = this.calculateNextLikeAt(
      now,
      boost.endsAt,
      boost.targetCount - nextCount
    );

    // The previous count and timestamp form an optimistic claim. Only one
    // application instance can win when multiple schedulers see the same row.
    const claimed = await this.prisma.postEngagementBoost.updateMany({
      where: {
        postId: boost.postId,
        targetCount: boost.targetCount,
        currentCount: boost.currentCount,
        nextLikeAt: boost.nextLikeAt,
      },
      data: {
        currentCount: { increment: 1 },
        nextLikeAt,
      },
    });
    if (claimed.count !== 1) return false;

    const displayedLikeCount = await this.getDisplayedLikeCount(boost.postId);
    this.sessionsGateway.notifyPostLikeUpdate(boost.postId, {
      actorId: null,
      isLiked: false,
      likeCount: displayedLikeCount,
      source: 'engagement_boost',
    });
    return true;
  }

  private calculateNextLikeAt(
    now: Date,
    endsAt: Date,
    remainingCount: number
  ): Date {
    if (remainingCount <= 0) return endsAt;

    const remainingMs = Math.max(
      remainingCount * MINUTE_MS,
      endsAt.getTime() - now.getTime()
    );
    const averageInterval = remainingMs / remainingCount;
    const jitter = 0.75 + Math.random() * 0.5;
    const interval = Math.max(MINUTE_MS, Math.round(averageInterval * jitter));
    return new Date(Math.min(endsAt.getTime(), now.getTime() + interval));
  }

  private pickTargetCount(): number {
    const roll = Math.random() * 100;
    let cumulativeWeight = 0;
    for (let index = 0; index < TARGET_WEIGHTS.length; index += 1) {
      cumulativeWeight += TARGET_WEIGHTS[index];
      if (roll < cumulativeWeight) return index + 1;
    }
    return TARGET_WEIGHTS.length;
  }

  private randomInteger(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
