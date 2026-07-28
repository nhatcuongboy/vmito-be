import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionLocationType } from './dto/create-session.dto';

type LocationResolver = (
  input: {
    locationType?: SessionLocationType;
    venueId?: string;
    location?: string;
  },
  prismaClient?: unknown
) => Promise<{
  venueId?: string;
  location?: string;
  venueSearchText: string;
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

  const createUpdateService = () => {
    const session = {
      findUnique: jest.fn().mockResolvedValue(existingSession),
      update: jest.fn().mockResolvedValue({
        ...existingSession,
        venueId: null,
        venue: null,
        location: 'Sân nội bộ ABC',
      }),
    };
    const gateway = { notifySessionUpdate: jest.fn() };
    const service = new SessionsService(
      { session, venue: { findUnique: jest.fn(), create: jest.fn() } } as never,
      undefined as never,
      gateway as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never
    );
    return { service, session };
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
          venue: { disconnect: true },
        }) as unknown,
      })
    );
  });
});
