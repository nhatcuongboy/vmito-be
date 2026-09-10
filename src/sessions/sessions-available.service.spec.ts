import { FeeType, Prisma, SportType } from '@prisma/client';
import { SessionsService } from './sessions.service';

describe('SessionsService available filters', () => {
  const createService = () => {
    const findMany = jest.fn((_args: Prisma.SessionFindManyArgs) =>
      Promise.resolve([])
    );
    const prisma = {
      session: {
        findMany,
        count: jest.fn((_args: Prisma.SessionCountArgs) => Promise.resolve(0)),
      },
    };
    const service = new SessionsService(
      prisma as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never
    );
    return { findMany, service };
  };

  it('builds multi-value, source, area and Vietnam-day Prisma filters', async () => {
    const { findMany, service } = createService();

    await service.findAvailable({
      date: '2026-08-11',
      levels: [9, 1, 10],
      sportType: [SportType.BADMINTON, SportType.PICKLEBALL],
      city: 'Hồ Chí Minh',
      district: 'Phường An Đông,Phường An Hội Đông',
      sessionType: 'facebook',
    });

    const where = findMany.mock.calls[0][0].where!;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { sportType: { in: [SportType.BADMINTON, SportType.PICKLEBALL] } },
        {
          OR: [
            { requiredLevels: { hasSome: [9, 1, 10] } },
            { requiredLevels: { equals: [] } },
          ],
        },
        { isCrawled: true },
      ])
    );
    expect(where.AND).toContainEqual({
      OR: [
        {
          startTime: {
            gte: new Date('2026-08-10T17:00:00.000Z'),
            lte: new Date('2026-08-11T16:59:59.999Z'),
          },
        },
        {
          startTime: null,
          scheduledStartTime: {
            gte: new Date('2026-08-10T17:00:00.000Z'),
            lte: new Date('2026-08-11T16:59:59.999Z'),
          },
        },
      ],
    });
  });

  it('matches either fixed fee or known split-per-player fee in a range', async () => {
    const { findMany, service } = createService();

    await service.findAvailable({ minFee: 50000, maxFee: 100000 });

    const where = findMany.mock.calls[0][0].where!;
    expect(where.AND).toContainEqual({
      OR: [
        {
          feeConfig: {
            feeType: FeeType.FIXED,
            OR: [
              { maleFee: { gte: 50000, lte: 100000 } },
              { femaleFee: { gte: 50000, lte: 100000 } },
            ],
          },
        },
        {
          feeConfig: {
            feeType: FeeType.SPLIT_EVENLY,
            splitPerPlayer: { gte: 50000, lte: 100000 },
          },
        },
      ],
    });
  });

  it('filters split-evenly independently when no amount range is active', async () => {
    const { findMany, service } = createService();

    await service.findAvailable({ feeType: FeeType.SPLIT_EVENLY });

    const where = findMany.mock.calls[0][0].where!;
    expect(where.AND).toContainEqual({
      OR: [{ feeConfig: { feeType: FeeType.SPLIT_EVENLY } }],
    });
  });

  it('filters exact court count when minCourts equals maxCourts', async () => {
    const { findMany, service } = createService();

    await service.findAvailable({ minCourts: 2, maxCourts: 2 });

    const where = findMany.mock.calls[0][0].where!;
    expect(where.AND).toContainEqual({
      numberOfCourts: { gte: 2, lte: 2 },
    });
  });

  it('filters at-least court count when only minCourts is specified', async () => {
    const { findMany, service } = createService();

    await service.findAvailable({ minCourts: 4 });

    const where = findMany.mock.calls[0][0].where!;
    expect(where.AND).toContainEqual({
      numberOfCourts: { gte: 4 },
    });
  });
});

