import { Gender } from '@prisma/client';
import { getLevelDistance } from '../common/constants/level.constants';
import {
  Recommendation,
  RecommendationReason,
  UserRecommendationContext,
} from './recommendation.types';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Weekday (0 = Sunday) and hour in Vietnam time (UTC+7, no DST).
 * Date#getDay/getHours follow the server timezone, which is UTC in
 * production.
 */
export function toVietnamDayHour(date: Date): { day: number; hour: number } {
  const vn = new Date(date.getTime() + VN_OFFSET_MS);
  return { day: vn.getUTCDay(), hour: vn.getUTCHours() };
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Lowercased, accent-free, without "quận/huyện/phường" prefixes. */
export function normalizeArea(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/^(quan|huyen|phuong|xa|thi xa|thanh pho|tp\.?)\s+/, '')
    .trim();
}

/**
 * Distance score: 1 at the viewer's position, 0 at [radiusKm] or beyond.
 * Neutral 0.5 when either side has no coordinates, so a missing GPS fix
 * neither rewards nor punishes an item.
 */
export function distanceScore(
  ctx: UserRecommendationContext,
  lat: number | null | undefined,
  lng: number | null | undefined,
  radiusKm: number
): { score: number; km: number | null } {
  if (ctx.lat == null || ctx.lng == null || lat == null || lng == null) {
    return { score: 0.5, km: null };
  }
  const km = haversineKm(ctx.lat, ctx.lng, lat, lng);
  return { score: Math.max(0, 1 - km / radiusKm), km };
}

/**
 * Level score against an item's allowed levels (empty = all levels).
 * Exact match 1, one rank away 0.5, otherwise 0. Unknown viewer level
 * scores neutral.
 */
export function levelScore(
  ctx: UserRecommendationContext,
  requiredLevels: number[] | null | undefined
): number {
  if (!requiredLevels || requiredLevels.length === 0) return 0.8;
  if (ctx.level == null) return 0.5;
  if (requiredLevels.includes(ctx.level)) return 1;
  const nearest = Math.min(
    ...requiredLevels.map((l) => getLevelDistance(l, ctx.level!))
  );
  return nearest <= 1 ? 0.5 : 0;
}

/** Fee the viewer would pay, picking the gender-specific fixed fee. */
export function feeForViewer(
  gender: Gender | null,
  feeConfig:
    | {
        maleFee: number | null;
        femaleFee: number | null;
        splitPerPlayer: number | null;
      }
    | null
    | undefined
): number | null {
  if (!feeConfig) return null;
  const fixed =
    gender === Gender.FEMALE
      ? (feeConfig.femaleFee ?? feeConfig.maleFee)
      : (feeConfig.maleFee ?? feeConfig.femaleFee);
  return fixed ?? feeConfig.splitPerPlayer ?? null;
}

/** 1 within ±20% of the usual fee, falling to 0 at ±100%. */
export function feeScore(
  ctx: UserRecommendationContext,
  fee: number | null
): number {
  if (ctx.medianFee == null || fee == null || ctx.medianFee <= 0) return 0.5;
  const ratio = Math.abs(fee - ctx.medianFee) / ctx.medianFee;
  if (ratio <= 0.2) return 1;
  return Math.max(0, 1 - (ratio - 0.2) / 0.8);
}

/**
 * Collects weighted components into a final score plus reasons.
 * A component contributes its reason only when it scored ≥ [threshold],
 * and reasons are ordered by weighted contribution.
 */
export class ScoreBuilder {
  private total = 0;
  private readonly candidates: {
    reason: RecommendationReason;
    contribution: number;
  }[] = [];

  add(
    weight: number,
    score: number,
    reason?: RecommendationReason,
    threshold = 0.75
  ): this {
    const clamped = Math.max(0, Math.min(1, score));
    this.total += weight * clamped;
    if (reason && clamped >= threshold) {
      this.candidates.push({ reason, contribution: weight * clamped });
    }
    return this;
  }

  build(): Recommendation {
    const reasons = this.candidates
      .sort((a, b) => b.contribution - a.contribution)
      .map((c) => c.reason);
    return { score: Math.round(this.total * 100) / 100, reasons };
  }
}

/**
 * Best match between recurring weekly slots (club activity, class lessons)
 * and the viewer's habits. Neutral without history, low without slots.
 */
export function weeklySlotsScore(
  ctx: UserRecommendationContext,
  slots: { dayOfWeek: number; startTime: string; endTime: string }[]
): number {
  if (!ctx.hasHistory) return 0.5;
  if (slots.length === 0) return 0.3;
  let best = 0;
  for (const slot of slots) {
    const start = parseHour(slot.startTime);
    const end = Math.max(start + 1, parseHour(slot.endTime));
    let hour = 0;
    for (let h = start; h < Math.min(end, 24); h++) {
      hour = Math.max(hour, ctx.hourAffinity[h]);
    }
    const day = ctx.dayAffinity[slot.dayOfWeek] ?? 0;
    best = Math.max(best, 0.5 * day + 0.5 * hour);
  }
  return best;
}

function parseHour(time: string): number {
  const hour = Number.parseInt(time.split(':')[0] ?? '', 10);
  return Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 0;
}

/** Sorts in place by score, best first; ties keep the incoming order. */
export function sortByRecommendation<
  T extends { recommendation: Recommendation },
>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        b.item.recommendation.score - a.item.recommendation.score ||
        a.index - b.index
    )
    .map(({ item }) => item);
}
