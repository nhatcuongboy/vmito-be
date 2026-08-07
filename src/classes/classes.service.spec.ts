import { ClassesService } from './classes.service';
import { ClassTuitionPeriod, SportType } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { FavoritesService } from '../favorites/favorites.service';

describe('ClassesService location persistence', () => {
  it('uses locationText for search but never sends it to Prisma', async () => {
    let createdData: Record<string, unknown> | undefined;
    const classCreate = jest.fn((args: { data: Record<string, unknown> }) => {
      createdData = args.data;
      return Promise.resolve({ id: 'class-1' });
    });
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Cường Sấm' }),
      },
      venue: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'venue-1',
          name: '79 Pro',
          address: '300/13 Nguyễn Văn Linh',
        }),
      },
      class: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: classCreate,
      },
    } as unknown as PrismaService;
    const service = new ClassesService(prisma, {} as FavoritesService);

    await service.create(
      {
        name: 'Lớp học mới',
        sportType: SportType.BADMINTON,
        contactPhone: '0914810765',
        venueId: 'venue-1',
        tuitionPeriod: ClassTuitionPeriod.CONTACT,
        schedules: [
          {
            dayOfWeek: 1,
            startTime: '18:00',
            endTime: '19:30',
          },
        ],
      },
      'user-1'
    );

    expect(createdData).not.toHaveProperty('locationText');
    expect(createdData?.venueId).toBe('venue-1');
    expect(createdData?.searchTerms).toEqual(expect.stringContaining('79 pro'));
  });

  it('stores a custom location on the class without creating a venue', async () => {
    let createdData: Record<string, unknown> | undefined;
    const venueCreate = jest.fn();
    const venueFindUnique = jest.fn();
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Cường Sấm' }),
      },
      venue: {
        create: venueCreate,
        findUnique: venueFindUnique,
      },
      class: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn((args: { data: Record<string, unknown> }) => {
          createdData = args.data;
          return Promise.resolve({ id: 'class-2' });
        }),
      },
    } as unknown as PrismaService;
    const service = new ClassesService(prisma, {} as FavoritesService);

    await service.create(
      {
        name: 'Lớp tại địa điểm riêng',
        sportType: SportType.BADMINTON,
        contactPhone: '0914810765',
        tuitionPeriod: ClassTuitionPeriod.CONTACT,
        customLocation: {
          name: 'Nhà thi đấu nội bộ',
          address: '123 Nguyễn Văn Linh',
          placeId: 'place-123',
          lat: 10.73,
          lng: 106.7,
          district: 'Quận 7',
          city: 'Hồ Chí Minh',
        },
        schedules: [
          {
            dayOfWeek: 1,
            startTime: '18:00',
            endTime: '19:30',
          },
        ],
      },
      'user-1'
    );

    expect(venueCreate).not.toHaveBeenCalled();
    expect(venueFindUnique).not.toHaveBeenCalled();
    expect(createdData).toMatchObject({
      venueId: null,
      customLocationName: 'Nhà thi đấu nội bộ',
      customLocationAddress: '123 Nguyễn Văn Linh',
      customLocationPlaceId: 'place-123',
      customLocationLat: 10.73,
      customLocationLng: 106.7,
      customLocationDistrict: 'Quận 7',
      customLocationCity: 'Hồ Chí Minh',
    });
    expect(createdData).not.toHaveProperty('locationText');
  });
});
