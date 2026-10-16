import { VenueCustomerType, VenueDayType } from '@prisma/client';
import {
  normalizeExtractedPriceRule,
  normalizePricePerHour,
  parseClockToMinute,
} from './price-rules-extraction.util';

describe('price-rules-extraction.util', () => {
  it('parses common clock formats', () => {
    expect(parseClockToMinute('05:00')).toBe(300);
    expect(parseClockToMinute('5h')).toBe(300);
    expect(parseClockToMinute('17h30')).toBe(1050);
    expect(parseClockToMinute('24:00')).toBe(1440);
    expect(parseClockToMinute('25:00')).toBeNull();
    expect(parseClockToMinute('abc')).toBeNull();
  });

  it('scales prices given in thousands', () => {
    expect(normalizePricePerHour(80)).toBe(80000);
    expect(normalizePricePerHour(120000)).toBe(120000);
    expect(normalizePricePerHour(0)).toBeNull();
  });

  it('normalizes a weekday rule', () => {
    expect(
      normalizeExtractedPriceRule({
        dayType: 'WEEKDAY',
        daysOfWeek: [5, 1, 3, 3],
        startTime: '5h',
        endTime: '16:00',
        customerType: 'FIXED',
        pricePerHour: 70,
        rawLine: 'T2,4,6 5h-16h CĐ 70k',
      })
    ).toEqual({
      dayType: VenueDayType.WEEKDAY,
      daysOfWeek: [1, 3, 5],
      specificDate: null,
      startMinute: 300,
      endMinute: 960,
      customerType: VenueCustomerType.FIXED,
      pricePerHour: 70000,
      minimumMinutes: null,
      billingStepMinutes: null,
      notes: null,
      rawLine: 'T2,4,6 5h-16h CĐ 70k',
    });
  });

  it('turns a full week into EVERYDAY and defaults customer type', () => {
    const rule = normalizeExtractedPriceRule({
      dayType: 'WEEKDAY',
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      startTime: '18:00',
      endTime: '00:00',
      customerType: 'UNKNOWN',
      pricePerHour: 150000,
    });
    expect(rule?.dayType).toBe(VenueDayType.EVERYDAY);
    expect(rule?.daysOfWeek).toEqual([]);
    expect(rule?.endMinute).toBe(1440);
    expect(rule?.customerType).toBe(VenueCustomerType.WALK_IN);
  });

  it('drops rules that cannot be used', () => {
    const base = {
      dayType: 'EVERYDAY',
      startTime: '05:00',
      endTime: '22:00',
      pricePerHour: 100000,
    };
    expect(
      normalizeExtractedPriceRule({ ...base, dayType: 'HOLIDAY' })
    ).toBeNull();
    expect(
      normalizeExtractedPriceRule({ ...base, endTime: '04:00' })
    ).toBeNull();
    expect(
      normalizeExtractedPriceRule({ ...base, pricePerHour: 0 })
    ).toBeNull();
    expect(
      normalizeExtractedPriceRule({
        ...base,
        dayType: 'SPECIFIC_DATE',
        specificDate: '2026-04-30',
      })?.specificDate
    ).toBe('2026-04-30');
  });
});
