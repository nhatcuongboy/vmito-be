import { HostReportGranularity, HostReportQueryDto } from './dto';

export interface ResolvedHostReportRange {
  from: Date;
  to: Date;
  granularity: HostReportGranularity;
}

const DEFAULT_RANGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function resolveHostReportRange(
  query: HostReportQueryDto
): ResolvedHostReportRange {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
  return {
    from,
    to,
    granularity: query.granularity ?? HostReportGranularity.MONTH,
  };
}

/** The equally long window ending right before `from`, used for period-over-period deltas. */
export function resolvePreviousRange(range: ResolvedHostReportRange): {
  from: Date;
  to: Date;
} {
  const span = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from.getTime() - 1);
  return { from: new Date(to.getTime() - span), to };
}

const pad = (value: number) => String(value).padStart(2, '0');

/** ISO week start (Monday) in UTC. */
function startOfIsoWeek(date: Date): Date {
  const result = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const dayOffset = (result.getUTCDay() + 6) % 7;
  result.setUTCDate(result.getUTCDate() - dayOffset);
  return result;
}

export function bucketKey(
  date: Date,
  granularity: HostReportGranularity
): string {
  switch (granularity) {
    case HostReportGranularity.DAY:
      return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
        date.getUTCDate()
      )}`;
    case HostReportGranularity.WEEK: {
      const start = startOfIsoWeek(date);
      return `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(
        start.getUTCDate()
      )}`;
    }
    case HostReportGranularity.MONTH:
    default:
      return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-01`;
  }
}
