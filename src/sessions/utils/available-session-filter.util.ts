export type SessionTimeRange = 'morning' | 'afternoon' | 'evening' | 'night';

type FilterableSession = {
  startTime: Date | null;
  scheduledStartTime: Date | null;
  numberOfCourts: number;
  maxPlayersPerCourt: number;
  _count?: { players?: number } | null;
};

export const sessionHourInVietnam = (value: Date): number =>
  (value.getUTCHours() + 7) % 24;

export const matchesSessionTimeRanges = (
  value: Date,
  ranges: ReadonlySet<SessionTimeRange>
): boolean => {
  const hour = sessionHourInVietnam(value);
  return (
    (ranges.has('morning') && hour >= 5 && hour < 12) ||
    (ranges.has('afternoon') && hour >= 12 && hour < 18) ||
    (ranges.has('evening') && hour >= 18 && hour < 22) ||
    (ranges.has('night') && (hour >= 22 || hour < 5))
  );
};

export const filterAvailableSessions = <T extends FilterableSession>(
  sessions: T[],
  filters: {
    timeRanges?: SessionTimeRange[];
    hasSlots?: boolean;
    minAvailableSlots?: number;
  }
): T[] => {
  const ranges = filters.timeRanges?.length
    ? new Set(filters.timeRanges)
    : null;
  return sessions.filter((session) => {
    if (ranges) {
      const start = session.startTime ?? session.scheduledStartTime;
      if (!start || !matchesSessionTimeRanges(start, ranges)) return false;
    }

    if (
      filters.hasSlots !== undefined ||
      filters.minAvailableSlots !== undefined
    ) {
      const capacity = session.numberOfCourts * session.maxPlayersPerCourt;
      const availableSlots = capacity - (session._count?.players ?? 0);
      if (filters.hasSlots !== undefined) {
        const hasAvailableSlots = availableSlots > 0;
        if (filters.hasSlots !== hasAvailableSlots) return false;
      }
      if (
        filters.minAvailableSlots !== undefined &&
        availableSlots < filters.minAvailableSlots
      ) {
        return false;
      }
    }
    return true;
  });
};

export const paginateAvailableSessions = <T>(
  sessions: T[],
  page: number,
  limit: number
): { items: T[]; total: number } => {
  const skip = (page - 1) * limit;
  return {
    items: sessions.slice(skip, skip + limit),
    total: sessions.length,
  };
};
