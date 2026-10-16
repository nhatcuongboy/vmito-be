import { VenueCustomerType, VenueDayType } from '@prisma/client';
import { ExtractedPriceRule } from './dto/extract-price-rules.dto';

export interface RawExtractedPriceRule {
  dayType?: unknown;
  daysOfWeek?: unknown;
  specificDate?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  customerType?: unknown;
  pricePerHour?: unknown;
  minimumMinutes?: unknown;
  billingStepMinutes?: unknown;
  notes?: unknown;
  rawLine?: unknown;
}

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
const WORKING_DAYS = [1, 2, 3, 4, 5];
const DAY_IN_MINUTES = 1440;

const isEnumValue = <T extends string>(
  values: Record<string, T>,
  value: unknown
): value is T =>
  typeof value === 'string' && Object.values(values).includes(value as T);

const toText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  return text && text.toLowerCase() !== 'null' ? text : null;
};

const toPositiveInt = (value: unknown): number | null => {
  const number = typeof value === 'string' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) return null;
  const rounded = Math.round(number);
  return rounded > 0 ? rounded : null;
};

/** Accepts "05:00", "5:00", "5h", "5h30", "24:00". Returns minutes or null. */
export const parseClockToMinute = (value: unknown): number | null => {
  const text = toText(value)?.toLowerCase();
  if (!text) return null;
  const match = text.match(/^(\d{1,2})\s*(?:[:h]\s*(\d{1,2})?)?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) {
    return null;
  }
  return hours * 60 + minutes;
};

/** AI sometimes returns thousands ("80" for 80k); scale those up. */
export const normalizePricePerHour = (value: unknown): number | null => {
  const price = toPositiveInt(value);
  if (price === null) return null;
  return price < 1000 ? price * 1000 : price;
};

const normalizeDays = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  const days = value
    .map((day) => toPositiveInt(day))
    .filter((day): day is number => day !== null && day >= 1 && day <= 7);
  return [...new Set(days)].sort((left, right) => left - right);
};

const normalizeIsoDate = (value: unknown): string | null => {
  const text = toText(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return Number.isNaN(new Date(`${text}T00:00:00Z`).getTime()) ? null : text;
};

const normalizeDayScope = (raw: RawExtractedPriceRule) => {
  const days = normalizeDays(raw.daysOfWeek);
  let dayType = isEnumValue(VenueDayType, raw.dayType)
    ? raw.dayType
    : days.length
      ? VenueDayType.WEEKDAY
      : VenueDayType.EVERYDAY;

  if (dayType === VenueDayType.WEEKDAY && days.length === ALL_DAYS.length) {
    dayType = VenueDayType.EVERYDAY;
  }

  const daysOfWeek =
    dayType === VenueDayType.WEEKDAY ? (days.length ? days : WORKING_DAYS) : [];
  return { dayType, daysOfWeek };
};

/** Returns a rule ready for CreateVenuePriceRuleDto, or null when unusable. */
export const normalizeExtractedPriceRule = (
  raw: RawExtractedPriceRule
): ExtractedPriceRule | null => {
  const { dayType, daysOfWeek } = normalizeDayScope(raw);
  const needsDate =
    dayType === VenueDayType.HOLIDAY || dayType === VenueDayType.SPECIFIC_DATE;
  const specificDate = needsDate ? normalizeIsoDate(raw.specificDate) : null;
  if (needsDate && !specificDate) return null;

  const startMinute = parseClockToMinute(raw.startTime);
  let endMinute = parseClockToMinute(raw.endTime);
  if (startMinute === null || endMinute === null) return null;
  if (endMinute === 0) endMinute = DAY_IN_MINUTES;
  if (startMinute >= DAY_IN_MINUTES || endMinute <= startMinute) return null;

  const pricePerHour = normalizePricePerHour(raw.pricePerHour);
  if (pricePerHour === null) return null;

  return {
    dayType,
    daysOfWeek,
    specificDate,
    startMinute,
    endMinute,
    customerType: isEnumValue(VenueCustomerType, raw.customerType)
      ? raw.customerType
      : VenueCustomerType.WALK_IN,
    pricePerHour,
    minimumMinutes: toPositiveInt(raw.minimumMinutes),
    billingStepMinutes: toPositiveInt(raw.billingStepMinutes),
    notes: toText(raw.notes),
    rawLine: toText(raw.rawLine),
  };
};
