/** Longest stretch one series books ahead; renewing adds more. */
export const MAX_SERIES_WEEKS = 12;

const DAY_MS = 86_400_000;

/** The `yyyy-MM-dd` date [days] after [dateKey]. */
export function addDays(dateKey: string, days: number) {
  const time = new Date(`${dateKey}T00:00:00.000Z`).getTime();
  return new Date(time + days * DAY_MS).toISOString().slice(0, 10);
}

/** One date per week, starting at [startDate]. */
export function seriesDates(startDate: string, weeks: number) {
  return Array.from({ length: weeks }, (_, week) =>
    addDays(startDate, week * 7)
  );
}

/** Monday is 1, matching `VenueOperatingPeriod.dayOfWeek`. */
export function dayOfWeek(dateKey: string) {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}
