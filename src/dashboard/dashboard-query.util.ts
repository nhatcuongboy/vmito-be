import { DashboardGranularity, DashboardQueryDto } from './dto';

export interface ResolvedDashboardRange {
  from: Date;
  to: Date;
  granularity: DashboardGranularity;
}

const DEFAULT_RANGE_DAYS = 30;

export function resolveDashboardRange(
  query: DashboardQueryDto
): ResolvedDashboardRange {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
  const granularity = query.granularity ?? DashboardGranularity.DAY;
  return { from, to, granularity };
}

export interface TrendBucket {
  bucket: string;
  count: number;
}

/** Normalizes a raw `date_trunc` query result (bigint counts) into a JSON-safe trend series. */
export function toTrendBuckets(
  rows: { bucket: Date; count: bigint }[]
): TrendBucket[] {
  return rows.map((row) => ({
    bucket: row.bucket.toISOString(),
    count: Number(row.count),
  }));
}
