import {
  filterAvailableSessions,
  matchesSessionTimeRanges,
  paginateAvailableSessions,
  SessionTimeRange,
} from './available-session-filter.util';

const atVietnamHour = (hour: number) =>
  new Date(`2026-08-11T${hour.toString().padStart(2, '0')}:00:00+07:00`);

describe('available session post filters', () => {
  test.each([
    [5, 'morning', true],
    [12, 'morning', false],
    [12, 'afternoon', true],
    [18, 'afternoon', false],
    [18, 'evening', true],
    [22, 'evening', false],
    [22, 'night', true],
    [4, 'night', true],
    [5, 'night', false],
  ] as Array<[number, SessionTimeRange, boolean]>)(
    '%s:00 matches %s = %s',
    (hour, range, expected) => {
      expect(
        matchesSessionTimeRanges(atVietnamHour(hour), new Set([range]))
      ).toBe(expected);
    }
  );

  it('uses scheduled start as fallback and filters derived slots', () => {
    const sessions = [
      {
        id: 'open',
        startTime: null,
        scheduledStartTime: atVietnamHour(19),
        numberOfCourts: 2,
        maxPlayersPerCourt: 4,
        _count: { players: 5 },
      },
      {
        id: 'full',
        startTime: atVietnamHour(19),
        scheduledStartTime: null,
        numberOfCourts: 1,
        maxPlayersPerCourt: 4,
        _count: { players: 4 },
      },
    ];

    expect(
      filterAvailableSessions(sessions, {
        timeRanges: ['evening'],
        hasSlots: true,
        minAvailableSlots: 2,
      }).map((session) => session.id)
    ).toEqual(['open']);
  });

  it('counts after post-filtering and then slices the requested page', () => {
    const result = paginateAvailableSessions(['a', 'b', 'c'], 2, 2);
    expect(result).toEqual({ items: ['c'], total: 3 });
  });
});
