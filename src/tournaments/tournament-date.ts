const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Tournament dates are date-only values stored at UTC midnight. Return today's
 * Vietnam calendar date using that same representation so database comparisons
 * do not expire a tournament during its final day.
 */
export const getVietnamTodayDate = (now = new Date()): Date => {
  const vietnamNow = new Date(now.getTime() + VIETNAM_OFFSET_MS);
  return new Date(
    Date.UTC(
      vietnamNow.getUTCFullYear(),
      vietnamNow.getUTCMonth(),
      vietnamNow.getUTCDate()
    )
  );
};

export const isTournamentDateExpired = (
  endDate: Date,
  now = new Date()
): boolean => endDate.getTime() < getVietnamTodayDate(now).getTime();

export const isTournamentStartDateInPast = (
  startDate: Date,
  now = new Date()
): boolean => startDate.getTime() < getVietnamTodayDate(now).getTime();
