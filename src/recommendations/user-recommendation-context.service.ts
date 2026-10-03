import { Injectable } from '@nestjs/common';
import { FavoriteType, RatingType, SportType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserRecommendationContext } from './recommendation.types';
import {
  feeForViewer,
  normalizeArea,
  toVietnamDayHour,
} from './recommendation.utils';

/** How many past sessions shape the viewer's habits. */
const HISTORY_SIZE = 50;
/** Shared sessions needed before a co-player counts as a friend. */
const FRIEND_MIN_SHARED = 2;

@Injectable()
export class UserRecommendationContextService {
  constructor(private readonly prisma: PrismaService) {}

  async build(
    userId: string,
    location: { lat?: number | null; lng?: number | null } = {}
  ): Promise<UserRecommendationContext> {
    const [user, history, favoriteVenues, goodHostRatings, rentals] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { level: true, gender: true },
        }),
        this.prisma.player.findMany({
          where: {
            userId,
            registrationStatus: 'APPROVED',
            session: { status: { in: ['FINISHED', 'IN_PROGRESS'] } },
          },
          select: {
            customFee: true,
            session: {
              select: {
                id: true,
                venueId: true,
                hostId: true,
                startTime: true,
                scheduledStartTime: true,
                sportType: true,
                customLocationDistrict: true,
                venue: { select: { district: true, newDistrict: true } },
                feeConfig: {
                  select: {
                    maleFee: true,
                    femaleFee: true,
                    splitPerPlayer: true,
                  },
                },
              },
            },
          },
          orderBy: { joinedAt: 'desc' },
          take: HISTORY_SIZE,
        }),
        this.prisma.favorite.findMany({
          where: { userId, type: FavoriteType.VENUE },
          select: { targetId: true },
        }),
        this.prisma.rating.findMany({
          where: {
            raterUserId: userId,
            type: RatingType.PLAYER_TO_HOST,
            rating: { gte: 4 },
          },
          select: { ratedUserId: true },
        }),
        this.prisma.venueRentalRequest.findMany({
          where: { requesterId: userId },
          select: { venueId: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
      ]);

    const sessions = history.map((p) => p.session);
    const friendIds = await this.loadFriendIds(
      userId,
      sessions.map((s) => s.id)
    );

    const days = new Array<number>(7).fill(0);
    const hours = new Array<number>(24).fill(0);
    const venueCounts = new Map<string, number>();
    const hostCounts = new Map<string, number>();
    const usualDistricts = new Set<string>();
    const sports = new Set<SportType>();
    const fees: number[] = [];

    for (const p of history) {
      const s = p.session;
      sports.add(s.sportType);
      const start = s.startTime ?? s.scheduledStartTime;
      if (start) {
        const { day, hour } = toVietnamDayHour(start);
        days[day] += 1;
        // Smooth ±1h so a 19:00 habit still likes an 18:30 or 20:00 start.
        hours[hour] += 1;
        hours[(hour + 23) % 24] += 0.5;
        hours[(hour + 1) % 24] += 0.5;
      }
      if (s.venueId) increment(venueCounts, s.venueId);
      increment(hostCounts, s.hostId);
      const district =
        s.venue?.newDistrict ?? s.venue?.district ?? s.customLocationDistrict;
      if (district) usualDistricts.add(normalizeArea(district));
      const fee =
        p.customFee ?? feeForViewer(user?.gender ?? null, s.feeConfig);
      if (fee != null && fee > 0) fees.push(fee);
    }

    const venueAffinity = normalizeCounts(venueCounts);
    for (const { targetId } of favoriteVenues) venueAffinity.set(targetId, 1);
    for (const { venueId } of rentals) {
      venueAffinity.set(
        venueId,
        Math.max(venueAffinity.get(venueId) ?? 0, 0.8)
      );
    }

    const hostAffinity = normalizeCounts(hostCounts);
    for (const { ratedUserId } of goodHostRatings) {
      hostAffinity.set(
        ratedUserId,
        Math.max(hostAffinity.get(ratedUserId) ?? 0, 0.8)
      );
    }

    return {
      userId,
      level: user?.level ?? null,
      gender: user?.gender ?? null,
      lat: location.lat ?? null,
      lng: location.lng ?? null,
      hasHistory: history.length > 0,
      soleSport: sports.size === 1 ? [...sports][0] : null,
      dayAffinity: normalizeArray(days),
      hourAffinity: normalizeArray(hours),
      venueAffinity,
      hostAffinity,
      usualDistricts,
      friendIds,
      medianFee: median(fees),
    };
  }

  private async loadFriendIds(
    userId: string,
    sessionIds: string[]
  ): Promise<Set<string>> {
    if (sessionIds.length === 0) return new Set();
    const rows = await this.prisma.player.groupBy({
      by: ['userId'],
      where: {
        sessionId: { in: sessionIds },
        registrationStatus: 'APPROVED',
        userId: { not: null },
        NOT: { userId },
      },
      _count: { _all: true },
    });
    return new Set(
      rows
        .filter((r) => r.userId && r._count._all >= FRIEND_MIN_SHARED)
        .map((r) => r.userId!)
    );
  }
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function normalizeCounts(counts: Map<string, number>): Map<string, number> {
  const max = Math.max(1, ...counts.values());
  return new Map([...counts].map(([k, v]) => [k, v / max]));
}

function normalizeArray(values: number[]): number[] {
  const max = Math.max(...values);
  return max > 0 ? values.map((v) => v / max) : values;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
