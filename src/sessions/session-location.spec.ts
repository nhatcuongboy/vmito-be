import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionLocationType } from './dto/create-session.dto';

type LocationResolver = (
  input: {
    locationType?: SessionLocationType;
    venueId?: string;
    location?: string;
    customLocation?: {
      name: string;
      address?: string;
      placeId?: string;
      lat?: number;
      lng?: number;
      district?: string;
      city?: string;
    };
  },
  prismaClient?: unknown
) => Promise<{
  venueId?: string;
  location?: string;
  venueSearchText: string;
  customLocationName: string | null;
  customLocationAddress: string | null;
  customLocationPlaceId: string | null;
  customLocationLat: number | null;
  customLocationLng: number | null;
  customLocationDistrict: string | null;
  customLocationCity: string | null;
}>;

const createService = (venue: { findUnique: jest.Mock; create: jest.Mock }) => {
  const prisma = { venue };
  return new SessionsService(
    prisma as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never
  );
};

const getResolver = (service: SessionsService): LocationResolver => {
  const typedService = service as unknown as {
    resolveSessionLocation: LocationResolver;
  };
  return (input, prismaClient) =>
    typedService.resolveSessionLocation(input, prismaClient);
};

describe('SessionsService session location resolver', () => {
  const venueClient = {
    findUnique: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('stores a trimmed custom location without creating a venue', async () => {
    const resolve = getResolver(createService(venueClient));

    await expect(
      resolve({
        locationType: SessionLocationType.CUSTOM,
        location: '  Sân nội bộ ABC  ',
      })
    ).resolves.toEqual({
      location: 'Sân nội bộ ABC',
      venueSearchText: '',
      customLocationName: 'Sân nội bộ ABC',
      customLocationAddress: null,
      customLocationPlaceId: null,
      customLocationLat: null,
      customLocationLng: null,
      customLocationDistrict: null,
      customLocationCity: null,
    });
    expect(venueClient.findUnique).not.toHaveBeenCalled();
    expect(venueClient.create).not.toHaveBeenCalled();
  });

  it('stores a custom address snapshot without creating a venue', async () => {
    const resolve = getResolver(createService(venueClient));

    await expect(
      resolve({
        locationType: SessionLocationType.CUSTOM,
        customLocation: {
          name: ' Sân ABC ',
          address: ' 123 Nguyễn Trãi ',
          placeId: ' place-1 ',
          lat: 10.75,
          lng: 106.67,
          district: ' Quận 1 ',
          city: ' Hồ Chí Minh ',
        },
      })
    ).resolves.toEqual({
      location: 'Sân ABC',
      venueSearchText: '123 Nguyễn Trãi Quận 1 Hồ Chí Minh',
      customLocationName: 'Sân ABC',
      customLocationAddress: '123 Nguyễn Trãi',
      customLocationPlaceId: 'place-1',
      customLocationLat: 10.75,
      customLocationLng: 106.67,
      customLocationDistrict: 'Quận 1',
      customLocationCity: 'Hồ Chí Minh',
    });
    expect(venueClient.findUnique).not.toHaveBeenCalled();
    expect(venueClient.create).not.toHaveBeenCalled();
  });

  it('rejects an empty custom location', async () => {
    const resolve = getResolver(createService(venueClient));

    await expect(
      resolve({
        locationType: SessionLocationType.CUSTOM,
        location: '   ',
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('links an existing venue by id', async () => {
    venueClient.findUnique.mockResolvedValue({
      id: 'venue-1',
      name: 'Sân A',
      address: '1 Nguyễn Trãi',
    });
    const resolve = getResolver(createService(venueClient));

    await expect(
      resolve({
        locationType: SessionLocationType.VENUE,
        venueId: 'venue-1',
      })
    ).resolves.toEqual({
      venueId: 'venue-1',
      location: '1 Nguyễn Trãi',
      venueSearchText: 'Sân A 1 Nguyễn Trãi',
      customLocationName: null,
      customLocationAddress: null,
      customLocationPlaceId: null,
      customLocationLat: null,
      customLocationLng: null,
      customLocationDistrict: null,
      customLocationCity: null,
    });
  });

  it('rejects a venue id that does not exist', async () => {
    venueClient.findUnique.mockResolvedValue(null);
    const resolve = getResolver(createService(venueClient));

    await expect(
      resolve({
        locationType: SessionLocationType.VENUE,
        venueId: 'missing',
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SessionsService location updates', () => {
  const existingSession = {
    id: 'session-1',
    hostId: 'host-1',
    isCrawled: false,
    venueId: 'venue-1',
    name: 'Kèo tối',
    location: 'Địa chỉ sân cũ',
    hostName: 'Host',
    numberOfCourts: 1,
  };

  const createUpdateService = (
    currentSession: typeof existingSession = existingSession
  ) => {
    const session = {
      findUnique: jest.fn().mockResolvedValue(currentSession),
      update: jest.fn().mockResolvedValue({
        ...currentSession,
        venueId: null,
        venue: null,
        location: 'Sân nội bộ ABC',
      }),
    };
    const venue = { findUnique: jest.fn(), create: jest.fn() };
    const gateway = { notifySessionUpdate: jest.fn() };
    const service = new SessionsService(
      { session, venue } as never,
      undefined as never,
      gateway as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never
    );
    return { service, session, venue };
  };

  it('disconnects the previous venue when switching to a custom location', async () => {
    const { service, session } = createUpdateService();

    await service.update(
      'session-1',
      {
        locationType: SessionLocationType.CUSTOM,
        location: '  Sân nội bộ ABC  ',
      },
      'host-1'
    );

    expect(session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          location: 'Sân nội bộ ABC',
          customLocationName: 'Sân nội bộ ABC',
          venue: { disconnect: true },
        }) as unknown,
      })
    );
  });

  it('updates every custom snapshot field when editing the address', async () => {
    const { service, session } = createUpdateService();

    await service.update(
      'session-1',
      {
        locationType: SessionLocationType.CUSTOM,
        customLocation: {
          name: 'Sân ABC mới',
          address: '456 Lê Lợi',
          placeId: 'place-new',
          lat: 10.77,
          lng: 106.7,
          district: 'Quận 1',
          city: 'Hồ Chí Minh',
        },
      },
      'host-1'
    );

    expect(session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          location: 'Sân ABC mới',
          customLocationName: 'Sân ABC mới',
          customLocationAddress: '456 Lê Lợi',
          customLocationPlaceId: 'place-new',
          customLocationLat: 10.77,
          customLocationLng: 106.7,
          customLocationDistrict: 'Quận 1',
          customLocationCity: 'Hồ Chí Minh',
          searchTerms: expect.stringContaining('456 le loi'),
          venue: { disconnect: true },
        }) as unknown,
      })
    );
  });

  it('clears the custom snapshot when switching back to a linked venue', async () => {
    const customSession = {
      ...existingSession,
      venueId: null,
      location: 'Sân ABC',
    };
    const { service, session, venue } = createUpdateService(customSession);
    venue.findUnique.mockResolvedValue({
      id: 'venue-2',
      name: 'Sân chính thức',
      address: '789 Điện Biên Phủ',
    });

    await service.update(
      'session-1',
      {
        locationType: SessionLocationType.VENUE,
        venueId: 'venue-2',
      },
      'host-1'
    );

    expect(session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customLocationName: null,
          customLocationAddress: null,
          customLocationPlaceId: null,
          customLocationLat: null,
          customLocationLng: null,
          customLocationDistrict: null,
          customLocationCity: null,
          venue: { connect: { id: 'venue-2' } },
        }) as unknown,
      })
    );
  });
});
