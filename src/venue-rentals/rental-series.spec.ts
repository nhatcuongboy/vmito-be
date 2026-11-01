import {
  areRentalNotificationsMuted,
  withoutRentalNotifications,
} from './rental-notify-scope';
import { addDays, dayOfWeek, seriesDates } from './rental-series';

describe('seriesDates', () => {
  it('steps a week at a time across month ends', () => {
    expect(seriesDates('2030-01-28', 3)).toEqual([
      '2030-01-28',
      '2030-02-04',
      '2030-02-11',
    ]);
  });
});

describe('dayOfWeek', () => {
  it('counts Monday as 1 and Sunday as 7', () => {
    expect(dayOfWeek('2030-01-07')).toBe(1);
    expect(dayOfWeek('2030-01-13')).toBe(7);
  });
});

describe('addDays', () => {
  it('crosses a year end', () => {
    expect(addDays('2030-12-29', 7)).toBe('2031-01-05');
  });
});

describe('withoutRentalNotifications', () => {
  it('mutes only inside the scope, across awaits', async () => {
    expect(areRentalNotificationsMuted()).toBe(false);
    await withoutRentalNotifications(async () => {
      await Promise.resolve();
      expect(areRentalNotificationsMuted()).toBe(true);
    });
    expect(areRentalNotificationsMuted()).toBe(false);
  });
});
