import { ClubsService } from './clubs.service';
import type { BrowseClubsDto } from './dto/browse-clubs.dto';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { FavoritesService } from '../favorites/favorites.service';
import type { ActivityFeedService } from '../activities/activity-feed.service';
import type { Prisma } from '@prisma/client';

describe('ClubsService.browsePublicClubs filters', () => {
  // Runs browsePublicClubs against a stub Prisma and returns the `where`
  // clause it built, so each case only has to assert on the AND conditions
  // its own query params are expected to add.
  const whereFor = async (
    query: Partial<BrowseClubsDto>
  ): Promise<Prisma.ClubWhereInput> => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      club: { findMany, count },
    } as unknown as PrismaService;
    const service = new ClubsService(
      prisma,
      {} as NotificationsService,
      {} as FavoritesService,
      {} as ActivityFeedService
    );

    await service.browsePublicClubs(query as BrowseClubsDto);

    const { where } = findMany.mock.calls[0][0] as {
      where: Prisma.ClubWhereInput;
    };
    return where;
  };

  it('matches clubs with an explicit level or an open-to-all requiredLevels', async () => {
    const where = await whereFor({ levels: [3, 9] });
    expect(where.AND).toContainEqual({
      OR: [
        { requiredLevels: { hasSome: [3, 9] } },
        { requiredLevels: { isEmpty: true } },
      ],
    });
  });

  it('filters by weekday via a single schedules.some clause', async () => {
    const where = await whereFor({ activeDays: [1, 6] });
    expect(where.AND).toContainEqual({
      schedules: { some: { isActive: true, dayOfWeek: { in: [1, 6] } } },
    });
  });

  it('filters by buổi using overlap windows, not containment', async () => {
    const where = await whereFor({ activePeriods: ['morning', 'evening'] });
    expect(where.AND).toContainEqual({
      schedules: {
        some: {
          isActive: true,
          OR: [
            { startTime: { lt: '12:00' }, endTime: { gt: '05:00' } },
            { startTime: { lt: '23:59' }, endTime: { gt: '18:00' } },
          ],
        },
      },
    });
  });

  it('combines weekday and buổi into one schedules.some clause', async () => {
    const where = await whereFor({
      activeDays: [2],
      activePeriods: ['evening'],
    });
    expect(where.AND).toContainEqual({
      schedules: {
        some: {
          isActive: true,
          dayOfWeek: { in: [2] },
          OR: [{ startTime: { lt: '23:59' }, endTime: { gt: '18:00' } }],
        },
      },
    });
  });

  it('splits a comma-separated district into an OR of contains groups', async () => {
    const where = await whereFor({ district: 'Phường 1,Phường 2' });
    expect(where.AND).toContainEqual({
      OR: [
        {
          OR: [
            {
              defaultVenue: {
                district: { contains: 'Phường 1', mode: 'insensitive' },
              },
            },
            {
              defaultVenue: {
                newDistrict: { contains: 'Phường 1', mode: 'insensitive' },
              },
            },
          ],
        },
        {
          OR: [
            {
              defaultVenue: {
                district: { contains: 'Phường 2', mode: 'insensitive' },
              },
            },
            {
              defaultVenue: {
                newDistrict: { contains: 'Phường 2', mode: 'insensitive' },
              },
            },
          ],
        },
      ],
    });
  });

  it('keeps single-value web district calls working as a one-element list', async () => {
    const where = await whereFor({ district: 'Quận 1' });
    expect(where.AND).toContainEqual({
      OR: [
        {
          OR: [
            {
              defaultVenue: {
                district: { contains: 'Quận 1', mode: 'insensitive' },
              },
            },
            {
              defaultVenue: {
                newDistrict: { contains: 'Quận 1', mode: 'insensitive' },
              },
            },
          ],
        },
      ],
    });
  });

  it('adds no schedules clause when no activity-time filter is given', async () => {
    const where = await whereFor({ search: 'badminton' });
    const hasSchedulesClause = (where.AND as Prisma.ClubWhereInput[]).some(
      (clause) => 'schedules' in clause
    );
    expect(hasSchedulesClause).toBe(false);
  });
});
