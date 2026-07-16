/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentAccessService } from '../common/tournament-access/tournament-access.service';
import { ScheduleService } from './services/schedule.service';
import { TournamentsGateway } from './realtime/tournaments.gateway';
import { FavoritesService } from '../favorites/favorites.service';

/**
 * Venue-sync invariant coverage: a non-null tournament.venueId always has a
 * matching TournamentVenue row, and no flow here ever creates a Venue record.
 */
describe('TournamentsService venue sync', () => {
  let service: TournamentsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      tournament: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      venue: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      tournamentVenue: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      tournamentCourt: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _max: { courtNumber: null } }),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        create: jest.fn(),
      },
      // Interactive transactions run the callback against the same mock set.
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: TournamentAccessService,
          useValue: { assertHostOrAdmin: jest.fn() },
        },
        {
          provide: ScheduleService,
          useValue: { syncQueueForScheduleType: jest.fn() },
        },
        { provide: TournamentsGateway, useValue: { emit: jest.fn() } },
        { provide: FavoritesService, useValue: {} },
      ],
    }).compile();

    service = module.get(TournamentsService);
  });

  describe('create', () => {
    const baseDto = {
      name: 'Test Cup',
      startDate: '2026-08-01',
      endDate: '2026-08-02',
    };

    beforeEach(() => {
      // uniqueSlug probes by slug (null = free); the final re-fetch is by id.
      prisma.tournament.findUnique.mockImplementation(({ where }: any) =>
        where.slug !== undefined
          ? Promise.resolve(null)
          : Promise.resolve({ id: 't1' })
      );
      prisma.tournament.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 't1', ...data })
      );
      prisma.tournamentVenue.create.mockResolvedValue({ id: 'tv1' });
    });

    it('links the venue and creates the TournamentVenue row when venueId is given', async () => {
      prisma.venue.findUnique.mockResolvedValue({ id: 'v1' });

      await service.create({ ...baseDto, venueId: 'v1' } as any, 'host-1');

      expect(prisma.tournament.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ venueId: 'v1' }),
        })
      );
      expect(prisma.tournamentVenue.create).toHaveBeenCalledWith({
        data: { tournamentId: 't1', venueId: 'v1' },
      });
      expect(prisma.venue.create).not.toHaveBeenCalled();
    });

    it('404s on an unknown venueId', async () => {
      prisma.venue.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ ...baseDto, venueId: 'nope' } as any, 'host-1')
      ).rejects.toThrow(NotFoundException);
      expect(prisma.tournament.create).not.toHaveBeenCalled();
    });

    it('resolves location.placeId to an existing venue (linked mode)', async () => {
      prisma.venue.findUnique.mockResolvedValue({ id: 'v9' });

      await service.create(
        {
          ...baseDto,
          location: { placeId: 'gp1', name: 'Be Badminton' },
        } as any,
        'host-1'
      );

      expect(prisma.venue.findUnique).toHaveBeenCalledWith({
        where: { placeId: 'gp1' },
      });
      expect(prisma.tournament.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ venueId: 'v9' }),
        })
      );
      expect(prisma.tournamentVenue.create).toHaveBeenCalledWith({
        data: { tournamentId: 't1', venueId: 'v9' },
      });
      expect(prisma.venue.create).not.toHaveBeenCalled();
    });

    it('stores the location inline when the placeId matches no venue — never creates a Venue', async () => {
      prisma.venue.findUnique.mockResolvedValue(null);

      await service.create(
        {
          ...baseDto,
          location: {
            placeId: 'gp-unknown',
            name: 'Be Badminton',
            address: '123 Quang Trung',
            lat: 10.8,
            lng: 106.6,
            city: 'Ho Chi Minh',
          },
        } as any,
        'host-1'
      );

      expect(prisma.tournament.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ venueId: undefined }),
        })
      );
      expect(prisma.tournamentVenue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tournamentId: 't1',
          venueId: null,
          name: 'Be Badminton',
          placeId: 'gp-unknown',
          address: '123 Quang Trung',
          city: 'Ho Chi Minh',
        }),
      });
      expect(prisma.venue.create).not.toHaveBeenCalled();
    });

    it('creates no TournamentVenue when neither venueId nor location is given', async () => {
      await service.create(baseDto as any, 'host-1');

      expect(prisma.tournamentVenue.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.tournament.findUnique.mockResolvedValue({
        id: 't1',
        hostId: 'host-1',
        isPublished: false,
        status: 'PREPARING',
      });
      prisma.tournament.update.mockResolvedValue({ id: 't1' });
    });

    it('upserts the TournamentVenue row when setting a new primary venue', async () => {
      prisma.venue.findUnique.mockResolvedValue({ id: 'v1' });
      prisma.tournamentVenue.findFirst.mockResolvedValue(null);

      await service.update('t1', { venueId: 'v1' } as any, 'host-1');

      expect(prisma.tournamentVenue.create).toHaveBeenCalledWith({
        data: { tournamentId: 't1', venueId: 'v1' },
      });
    });

    it('does not duplicate an existing TournamentVenue row', async () => {
      prisma.venue.findUnique.mockResolvedValue({ id: 'v1' });
      prisma.tournamentVenue.findFirst.mockResolvedValue({ id: 'tv1' });

      await service.update('t1', { venueId: 'v1' } as any, 'host-1');

      expect(prisma.tournamentVenue.create).not.toHaveBeenCalled();
    });

    it('clears the pointer without touching TournamentVenue rows', async () => {
      await service.update('t1', { venueId: null } as any, 'host-1');

      expect(prisma.tournament.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ venueId: null }),
        })
      );
      expect(prisma.tournamentVenue.findFirst).not.toHaveBeenCalled();
      expect(prisma.tournamentVenue.create).not.toHaveBeenCalled();
      expect(prisma.tournamentVenue.delete).not.toHaveBeenCalled();
    });

    it('404s on an unknown venueId instead of hitting the FK', async () => {
      prisma.venue.findUnique.mockResolvedValue(null);

      await expect(
        service.update('t1', { venueId: 'nope' } as any, 'host-1')
      ).rejects.toThrow(NotFoundException);
      expect(prisma.tournament.update).not.toHaveBeenCalled();
    });
  });

  describe('addVenue (linked mode)', () => {
    beforeEach(() => {
      prisma.venue.findUnique.mockResolvedValue({ id: 'v1' });
      prisma.tournamentVenue.findFirst.mockResolvedValue(null);
      prisma.tournamentVenue.create.mockResolvedValue({
        id: 'tv1',
        venueId: 'v1',
      });
      prisma.tournamentVenue.findUnique.mockResolvedValue({
        id: 'tv1',
        venueId: 'v1',
      });
    });

    it('auto-sets the primary pointer when the tournament has none', async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        id: 't1',
        venueId: null,
      });

      await service.addVenue('t1', { venueId: 'v1' });

      expect(prisma.tournament.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { venueId: 'v1' },
      });
    });

    it('leaves an existing primary pointer alone', async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        id: 't1',
        venueId: 'v0',
      });

      await service.addVenue('t1', { venueId: 'v1' });

      expect(prisma.tournament.update).not.toHaveBeenCalled();
    });
  });

  describe('removeVenue', () => {
    beforeEach(() => {
      prisma.tournamentVenue.delete.mockResolvedValue({});
      prisma.tournamentCourt.deleteMany.mockResolvedValue({});
    });

    it('repoints the primary pointer to the oldest remaining linked venue', async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        id: 't1',
        venueId: 'v1',
      });
      prisma.tournamentVenue.findFirst
        .mockResolvedValueOnce({ id: 'tv1', venueId: 'v1' }) // row being removed
        .mockResolvedValueOnce({ id: 'tv2', venueId: 'v2' }); // next linked row

      await service.removeVenue('t1', 'v1');

      expect(prisma.tournament.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { venueId: 'v2' },
      });
    });

    it('clears the pointer when no linked venue remains', async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        id: 't1',
        venueId: 'v1',
      });
      prisma.tournamentVenue.findFirst
        .mockResolvedValueOnce({ id: 'tv1', venueId: 'v1' })
        .mockResolvedValueOnce(null);

      await service.removeVenue('t1', 'v1');

      expect(prisma.tournament.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { venueId: null },
      });
    });

    it('does not touch the pointer when removing a non-primary venue', async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        id: 't1',
        venueId: 'v1',
      });
      prisma.tournamentVenue.findFirst.mockResolvedValueOnce({
        id: 'tv2',
        venueId: 'v2',
      });

      await service.removeVenue('t1', 'v2');

      expect(prisma.tournament.update).not.toHaveBeenCalled();
    });
  });

  describe('duplicateTournament', () => {
    const dto = {
      name: 'Copy Cup',
      startDate: '2026-09-01',
      endDate: '2026-09-02',
      copy: { format: true, schedule: false, teams: false, venues: true },
    };

    beforeEach(() => {
      prisma.tournament.findUnique.mockImplementation(({ where }: any) => {
        if (where.slug !== undefined) return Promise.resolve(null);
        return Promise.resolve({
          id: 'src1',
          hostId: 'host-1',
          venueId: 'v1',
          sportType: 'BADMINTON',
          scheduleType: null,
          coverPhoto: null,
          coverPhotoPublicId: null,
          youtubeVideoUrls: [],
          categories: [],
          tournamentVenues: [
            {
              id: 'tv1',
              venueId: 'v1',
              name: null,
              acronym: null,
              placeId: null,
              address: null,
              lat: null,
              lng: null,
              district: null,
              city: null,
            },
            {
              id: 'tv2',
              venueId: null,
              name: 'Inline Court',
              acronym: 'IC',
              placeId: 'gp2',
              address: '456 Street',
              lat: 10.1,
              lng: 106.1,
              district: 'Go Vap',
              city: 'HCMC',
            },
          ],
          courts: [],
          players: [],
          pairs: [],
          scheduleConfig: null,
        });
      });
      prisma.tournament.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'nt1', ...data })
      );
      prisma.tournamentVenue.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `n-${data.venueId ?? 'inline'}`, ...data })
      );
      // Invariant check after the copy loop finds the already-copied row.
      prisma.tournamentVenue.findFirst.mockResolvedValue({ id: 'n-v1' });
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'nt1' } as any);
    });

    it('carries the primary venueId and copies inline fields when copying venues', async () => {
      await service.duplicateTournament('src1', dto as any, 'host-1', 'HOST');

      expect(prisma.tournament.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ venueId: 'v1' }),
        })
      );
      expect(prisma.tournamentVenue.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tournamentId: 'nt1',
            venueId: null,
            name: 'Inline Court',
            acronym: 'IC',
            placeId: 'gp2',
            address: '456 Street',
            district: 'Go Vap',
            city: 'HCMC',
          }),
        })
      );
    });

    it('drops the primary pointer when venues are not copied', async () => {
      await service.duplicateTournament(
        'src1',
        { ...dto, copy: { ...dto.copy, venues: false } } as any,
        'host-1',
        'HOST'
      );

      expect(prisma.tournament.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ venueId: null }),
        })
      );
      expect(prisma.tournamentVenue.create).not.toHaveBeenCalled();
    });
  });
});
