/** Largest report window, so one request cannot scan years of bookings. */
export const MAX_REPORT_DAYS = 92;

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** Offset of [timeZone] from UTC at [instant], in milliseconds. */
function zoneOffset(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return (
    Date.UTC(
      read('year'),
      read('month') - 1,
      read('day'),
      read('hour'),
      read('minute'),
      read('second')
    ) -
    Math.floor(instant.getTime() / 1000) * 1000
  );
}

/** The instant a venue-local `yyyy-MM-dd` begins. */
export function startOfLocalDay(dateKey: string, timeZone: string) {
  const guess = new Date(`${dateKey}T00:00:00.000Z`);
  return new Date(guess.getTime() - zoneOffset(guess, timeZone));
}

function localDateKey(instant: Date, timeZone: string) {
  const local = new Date(instant.getTime() + zoneOffset(instant, timeZone));
  return local.toISOString().slice(0, 10);
}

function localHour(instant: Date, timeZone: string) {
  const local = new Date(instant.getTime() + zoneOffset(instant, timeZone));
  return local.getUTCHours();
}

/** Monday is 1, matching `VenueOperatingPeriod.dayOfWeek`. */
function isoDayOfWeek(dateKey: string) {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function overlapMs(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return Math.max(
    0,
    Math.min(aEnd.getTime(), bEnd.getTime()) -
      Math.max(aStart.getTime(), bStart.getTime())
  );
}

export interface RentalReportInput {
  from: string;
  to: string;
  timeZone: string;
  courts: Array<{ id: string; name: string; code: string }>;
  /** Used when the venue books by capacity instead of named courts. */
  capacity: number;
  periods: Array<{
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
  }>;
  blocks: Array<{ courtId: string | null; startTime: Date; endTime: Date }>;
  rentals: Array<{
    status: string;
    startTime: Date;
    endTime: Date;
    numberOfCourts: number;
    amount: number;
    customerType: string | null;
    isNoShow: boolean;
    allocations: Array<{ courtId: string; startTime: Date; endTime: Date }>;
  }>;
  /** Money movements in the window; `amount` is negative for money out. */
  payments: Array<{ amount: number; at: Date }>;
}

const BOOKED_STATUSES = new Set(['CONFIRMED', 'COMPLETED']);

/**
 * Turns a venue's raw bookings into its report. Money collected follows the
 * date it moved, booking value follows the date played, so a deposit taken
 * this month for next month's game counts in each where a manager expects it.
 */
export function buildRentalReport(input: RentalReportInput) {
  const days: string[] = [];
  const first = new Date(`${input.from}T00:00:00.000Z`).getTime();
  const last = new Date(`${input.to}T00:00:00.000Z`).getTime();
  for (let time = first; time <= last; time += DAY_MS) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }

  const byDay = new Map(
    days.map((date) => [
      date,
      { date, bookedValue: 0, collected: 0, bookedMinutes: 0 },
    ])
  );
  const byCourt = new Map(
    input.courts.map((court) => [court.id, { ...court, minutes: 0 }])
  );
  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    minutes: 0,
  }));
  const byCustomerType = new Map<
    string,
    { type: string; count: number; amount: number }
  >();
  let bookings = 0;
  let bookedValue = 0;
  let bookedMinutes = 0;
  let noShows = 0;
  const statusCounts: Record<string, number> = {};

  for (const rental of input.rentals) {
    statusCounts[rental.status] = (statusCounts[rental.status] || 0) + 1;
    if (!BOOKED_STATUSES.has(rental.status)) continue;
    bookings += 1;
    bookedValue += rental.amount;
    if (rental.isNoShow) noShows += 1;
    const dateKey = localDateKey(rental.startTime, input.timeZone);
    const day = byDay.get(dateKey);
    if (day) day.bookedValue += rental.amount;
    const type = rental.customerType || 'WALK_IN';
    const tier = byCustomerType.get(type) || { type, count: 0, amount: 0 };
    tier.count += 1;
    tier.amount += rental.amount;
    byCustomerType.set(type, tier);

    // Without named courts, one row stands for numberOfCourts courts.
    const pieces = rental.allocations.length
      ? rental.allocations.map((row) => ({ ...row, weight: 1 }))
      : [
          {
            courtId: null,
            startTime: rental.startTime,
            endTime: rental.endTime,
            weight: rental.numberOfCourts,
          },
        ];
    for (const piece of pieces) {
      const minutes =
        ((piece.endTime.getTime() - piece.startTime.getTime()) / MINUTE_MS) *
        piece.weight;
      bookedMinutes += minutes;
      if (day) day.bookedMinutes += minutes;
      if (piece.courtId) {
        const court = byCourt.get(piece.courtId);
        if (court) court.minutes += minutes;
      }
      // Walk the booking hour by hour, so 18:30–20:00 lands in 18 and 19.
      let cursor = piece.startTime.getTime();
      while (cursor < piece.endTime.getTime()) {
        const hour = localHour(new Date(cursor), input.timeZone);
        const nextHour =
          cursor + (60 - new Date(cursor).getUTCMinutes()) * 60_000;
        const stop = Math.min(nextHour, piece.endTime.getTime());
        byHour[hour].minutes += ((stop - cursor) / MINUTE_MS) * piece.weight;
        cursor = stop;
      }
    }
  }

  let collected = 0;
  let refunded = 0;
  for (const payment of input.payments) {
    if (payment.amount >= 0) collected += payment.amount;
    else refunded -= payment.amount;
    const day = byDay.get(localDateKey(payment.at, input.timeZone));
    if (day) day.collected += payment.amount;
  }

  const courtCount = input.courts.length || input.capacity;
  let openMinutes = 0;
  for (const date of days) {
    const dayOfWeek = isoDayOfWeek(date);
    const dayStart = startOfLocalDay(date, input.timeZone);
    for (const period of input.periods) {
      if (period.dayOfWeek !== dayOfWeek) continue;
      const start = new Date(
        dayStart.getTime() + period.startMinute * MINUTE_MS
      );
      const end = new Date(dayStart.getTime() + period.endMinute * MINUTE_MS);
      openMinutes +=
        ((end.getTime() - start.getTime()) / MINUTE_MS) * courtCount;
      for (const block of input.blocks) {
        const blocked =
          overlapMs(start, end, block.startTime, block.endTime) / MINUTE_MS;
        openMinutes -= blocked * (block.courtId ? 1 : courtCount);
      }
    }
  }
  const availableMinutes = Math.max(0, openMinutes);

  return {
    from: input.from,
    to: input.to,
    collected,
    refunded,
    bookedValue,
    bookings,
    noShows,
    cancelled: statusCounts.CANCELLED || 0,
    rejected: statusCounts.REJECTED || 0,
    bookedMinutes,
    availableMinutes,
    occupancyPercent: availableMinutes
      ? Math.min(100, Math.round((bookedMinutes / availableMinutes) * 100))
      : 0,
    byDay: [...byDay.values()],
    byCourt: [...byCourt.values()],
    byHour,
    byCustomerType: [...byCustomerType.values()],
  };
}
