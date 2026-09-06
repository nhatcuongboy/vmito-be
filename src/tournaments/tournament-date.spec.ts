import {
  getVietnamTodayDate,
  isTournamentDateExpired,
  isTournamentStartDateInPast,
} from './tournament-date';

describe('tournament date lifecycle', () => {
  it('keeps a tournament valid throughout its end date in Vietnam', () => {
    const endDate = new Date('2026-09-07T00:00:00.000Z');

    expect(
      isTournamentDateExpired(endDate, new Date('2026-09-07T16:59:59.999Z'))
    ).toBe(false);
    expect(
      isTournamentDateExpired(endDate, new Date('2026-09-07T17:00:00.000Z'))
    ).toBe(true);
  });

  it('returns the Vietnam calendar date as a UTC date-only value', () => {
    expect(
      getVietnamTodayDate(new Date('2026-09-06T17:00:00.000Z')).toISOString()
    ).toBe('2026-09-07T00:00:00.000Z');
  });

  it('rejects only start dates before today in Vietnam', () => {
    const now = new Date('2026-09-07T03:00:00.000Z');
    expect(
      isTournamentStartDateInPast(new Date('2026-09-06T00:00:00.000Z'), now)
    ).toBe(true);
    expect(
      isTournamentStartDateInPast(new Date('2026-09-07T00:00:00.000Z'), now)
    ).toBe(false);
  });
});
