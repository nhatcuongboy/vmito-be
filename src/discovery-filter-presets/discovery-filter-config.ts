import { BadRequestException } from '@nestjs/common';
import { DiscoveryFilterTab, Prisma } from '@prisma/client';

const common = ['city', 'districts', 'sort'];
const fields: Record<DiscoveryFilterTab, string[]> = {
  sessions: [
    ...common,
    'date',
    'timeRanges',
    'levels',
    'sports',
    'courtCount',
    'hasSlots',
    'nearMe',
    'source',
    'minFee',
    'maxFee',
    'splitEvenly',
  ],
  venues: [...common, 'sports', 'courtCount', 'favoriteOnly'],
  clubs: [...common, 'activeDays', 'activePeriods', 'levels'],
  tournaments: [...common, 'statuses', 'sportTypes', 'period', 'favoriteOnly'],
};

const sorts: Record<DiscoveryFilterTab, string[]> = {
  sessions: ['dateAsc', 'dateDesc', 'newest', 'priceAsc', 'priceDesc'],
  venues: [
    'distance',
    'createdAt',
    'name',
    'hourlyRateFixed',
    'numberOfCourts',
  ],
  clubs: ['distance', 'sessionCount', 'createdAt', 'name'],
  tournaments: ['startAsc', 'newest', 'nameAsc', 'nameDesc'],
};

const choices: Record<string, readonly string[]> = {
  source: ['all', 'regular', 'facebook'],
  timeRanges: ['morning', 'afternoon', 'evening', 'night'],
  sports: ['BADMINTON', 'PICKLEBALL'],
  sportTypes: ['BADMINTON', 'PICKLEBALL'],
  activePeriods: ['morning', 'afternoon', 'evening'],
  statuses: ['preparing', 'inProgress', 'finished'],
  period: ['all', 'today', 'next7', 'next30'],
};

const arrays = new Set([
  'districts',
  'timeRanges',
  'levels',
  'sports',
  'activeDays',
  'activePeriods',
  'statuses',
  'sportTypes',
]);
const booleans = new Set(['hasSlots', 'nearMe', 'splitEvenly', 'favoriteOnly']);
const integers = new Set(['minFee', 'maxFee', 'courtCount']);

function invalid(): never {
  throw new BadRequestException('Invalid saved discovery filter');
}

export function validateDiscoveryFilterConfig(
  tab: DiscoveryFilterTab,
  config: Record<string, unknown>
): Prisma.InputJsonObject {
  if (
    Object.keys(config).some((key) => !fields[tab].includes(key)) ||
    fields[tab].some((key) => !(key in config))
  )
    invalid();
  if (JSON.stringify(config).length > 4096) invalid();
  if (typeof config.sort !== 'string' || !sorts[tab].includes(config.sort))
    invalid();

  for (const [key, value] of Object.entries(config)) {
    if (key === 'sort') continue;
    if (key === 'city' || key === 'date') {
      if (value !== null && (typeof value !== 'string' || value.length > 100))
        invalid();
      if (
        key === 'date' &&
        value !== null &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(value as string) ||
          Number.isNaN(Date.parse(value as string)) ||
          new Date(value as string).toISOString().slice(0, 10) !== value)
      )
        invalid();
    } else if (arrays.has(key)) {
      if (!Array.isArray(value) || value.length > 30) invalid();
      if (
        value.some((item) =>
          key === 'levels' || key === 'activeDays'
            ? !Number.isInteger(item) ||
              (key === 'activeDays'
                ? item < 0 || item > 6
                : item < 1 || item > 10)
            : typeof item !== 'string' ||
              item.length > 100 ||
              (choices[key] && !choices[key].includes(item))
        )
      )
        invalid();
    } else if (booleans.has(key)) {
      if (typeof value !== 'boolean') invalid();
    } else if (integers.has(key)) {
      if (key === 'courtCount' && value === null) continue;
      if (
        !Number.isInteger(value) ||
        (value as number) < (key === 'courtCount' ? 1 : 0) ||
        (value as number) > (key === 'courtCount' ? 4 : 100000000)
      )
        invalid();
    } else if (
      typeof value !== 'string' ||
      value.length > 100 ||
      (choices[key] && !choices[key].includes(value))
    ) {
      invalid();
    }
  }
  if (
    config.minFee !== undefined &&
    config.maxFee !== undefined &&
    (config.minFee as number) > (config.maxFee as number)
  )
    invalid();
  return config as Prisma.InputJsonObject;
}
