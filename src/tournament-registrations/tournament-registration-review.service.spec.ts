/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentAccessService } from '../common/tournament-access/tournament-access.service';
import { TournamentRegistrationReviewService } from './tournament-registration-review.service';
import { TournamentRegistrationNotifier } from './tournament-registration.notifier';

const TOURNAMENT = {
  id: 't1',
  name: 'Open',
  hostId: 'host',
  status: 'PREPARING',
};

const user = (id: string) => ({
  id,
  name: `User ${id}`,
  email: `${id}@x.com`,
  phone: null,
  gender: 'MALE',
  level: 3,
  levelDescription: null,
  image: `https://img/${id}.png`,
});

describe('TournamentRegistrationReviewService.approve', () => {
  let service: TournamentRegistrationReviewService;
  let prisma: any;
  let notifier: { reviewed: jest.Mock; submitted: jest.Mock };
  let request: any;
  let category: any;

  beforeEach(async () => {
    request = {
      id: 'r1',
      tournamentId: 't1',
      categoryId: 'c1',
      userId: 'u1',
      partnerUserIds: [],
      guestPartnerNames: [],
      phone: '0900',
      status: 'PENDING',
    };
    category = {
      id: 'c1',
      tournamentId: 't1',
      type: 'MENS_SINGLE',
      registrationMode: 'INDIVIDUAL',
      teamSize: 1,
      registrationEnabled: true,
      maxRegistrations: null,
    };

    let playerSeq = 0;
    prisma = {
      tournament: { findUnique: jest.fn().mockResolvedValue(TOURNAMENT) },
      tournamentRegistrationRequest: {
        findUnique: jest.fn(() => Promise.resolve(request)),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn(() =>
          Promise.resolve({
            ...request,
            status: 'APPROVED',
            response: null,
            user: { id: request.userId, name: 'User u1' },
            category: { name: 'MS' },
          })
        ),
      },
      category: { findUniqueOrThrow: jest.fn(() => Promise.resolve(category)) },
      categoryMatch: { count: jest.fn().mockResolvedValue(0) },
      categoryRegistration: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'reg1' }),
      },
      user: {
        findMany: jest.fn(({ where }: any) =>
          Promise.resolve(where.id.in.map(user))
        ),
      },
      tournamentPlayer: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }: any) =>
          Promise.resolve({ id: `p${++playerSeq}`, name: data.name })
        ),
        update: jest.fn(),
        delete: jest.fn(),
      },
      tournamentPair: { create: jest.fn().mockResolvedValue({ id: 'pair1' }) },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    notifier = { reviewed: jest.fn(), submitted: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentRegistrationReviewService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: TournamentAccessService,
          useValue: { assertManageAccess: jest.fn() },
        },
        { provide: TournamentRegistrationNotifier, useValue: notifier },
      ],
    }).compile();
    service = module.get(TournamentRegistrationReviewService);
  });

  it('creates a user-linked player and an individual registration', async () => {
    await service.approve('t1', 'r1', {}, 'host');

    expect(prisma.tournamentPlayer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tournamentId: 't1',
          userId: 'u1',
          name: 'User u1',
          phone: '0900',
        }),
      })
    );
    expect(
      prisma.tournamentPlayer.create.mock.calls[0][0].data
    ).not.toHaveProperty('imagePublicId');
    expect(prisma.categoryRegistration.create).toHaveBeenCalledWith({
      data: { categoryId: 'c1', tournamentPlayerId: 'p1' },
    });
    expect(
      prisma.tournamentRegistrationRequest.updateMany
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'r1', status: 'PENDING' },
        data: expect.objectContaining({
          status: 'APPROVED',
          categoryRegistrationId: 'reg1',
          reviewedById: 'host',
        }),
      })
    );
    expect(notifier.reviewed).toHaveBeenCalledWith(
      expect.objectContaining({ requesterId: 'u1' }),
      true,
      null
    );
  });

  it('creates a pair of a Vmito partner and a guest for TEAM categories', async () => {
    category = {
      ...category,
      type: 'MENS_DOUBLE',
      registrationMode: 'TEAM',
      teamSize: 3,
    };
    request = {
      ...request,
      partnerUserIds: ['u2'],
      guestPartnerNames: ['Guest'],
    };

    await service.approve('t1', 'r1', {}, 'host');

    const created = prisma.tournamentPlayer.create.mock.calls.map(
      (c: any) => c[0].data
    );
    expect(created).toEqual([
      expect.objectContaining({ userId: 'u1' }),
      expect.objectContaining({ userId: 'u2', phone: null }),
      { tournamentId: 't1', name: 'Guest' },
    ]);
    expect(prisma.tournamentPair.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tournamentId: 't1',
        name: 'User u1 / User u2 / Guest',
        type: 'MENS_DOUBLE',
        members: {
          create: [
            { playerId: 'p1', position: 1 },
            { playerId: 'p2', position: 2 },
            { playerId: 'p3', position: 3 },
          ],
        },
      }),
    });
    expect(prisma.categoryRegistration.create).toHaveBeenCalledWith({
      data: { categoryId: 'c1', tournamentPairId: 'pair1' },
    });
  });

  it('reuses an existing tournament player without modifying it', async () => {
    prisma.tournamentPlayer.findFirst.mockResolvedValue({
      id: 'existing',
      name: 'Old name',
    });

    await service.approve('t1', 'r1', {}, 'host');

    expect(prisma.tournamentPlayer.create).not.toHaveBeenCalled();
    expect(prisma.tournamentPlayer.update).not.toHaveBeenCalled();
    expect(prisma.categoryRegistration.create).toHaveBeenCalledWith({
      data: { categoryId: 'c1', tournamentPlayerId: 'existing' },
    });
  });

  it('refuses categories that already have matches', async () => {
    prisma.categoryMatch.count.mockResolvedValue(4);

    await expect(service.approve('t1', 'r1', {}, 'host')).rejects.toThrow(
      'Matches have already been generated for this category'
    );
    expect(prisma.categoryRegistration.create).not.toHaveBeenCalled();
    expect(prisma.tournamentPlayer.create).not.toHaveBeenCalled();
  });

  it('refuses full categories', async () => {
    category = { ...category, maxRegistrations: 8 };
    prisma.categoryRegistration.count.mockResolvedValue(8);

    await expect(service.approve('t1', 'r1', {}, 'host')).rejects.toThrow(
      'This category is full'
    );
  });

  it('still approves into a category closed to new requests', async () => {
    category = { ...category, registrationEnabled: false };
    await expect(
      service.approve('t1', 'r1', {}, 'host')
    ).resolves.toBeDefined();
  });

  it('refuses when the tournament is no longer preparing', async () => {
    prisma.tournament.findUnique.mockResolvedValue({
      ...TOURNAMENT,
      status: 'FINISHED',
    });
    await expect(service.approve('t1', 'r1', {}, 'host')).rejects.toThrow(
      BadRequestException
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses when a member is already registered in the category', async () => {
    prisma.categoryRegistration.findMany.mockResolvedValue([
      { player: { userId: 'u1' }, pair: null },
    ]);
    await expect(service.approve('t1', 'r1', {}, 'host')).rejects.toThrow(
      ConflictException
    );
  });

  it('refuses non-pending requests', async () => {
    request = { ...request, status: 'REJECTED' };
    await expect(service.approve('t1', 'r1', {}, 'host')).rejects.toThrow(
      'Only pending requests can be reviewed'
    );
  });

  it('fails when a concurrent review already handled the request', async () => {
    prisma.tournamentRegistrationRequest.updateMany.mockResolvedValue({
      count: 0,
    });
    await expect(service.approve('t1', 'r1', {}, 'host')).rejects.toThrow(
      'This request was already reviewed'
    );
  });
});

describe('TournamentRegistrationReviewService.reject', () => {
  it('marks the request rejected with the organizer note', async () => {
    const prisma: any = {
      tournament: { findUnique: jest.fn().mockResolvedValue(TOURNAMENT) },
      tournamentRegistrationRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'r1',
          tournamentId: 't1',
          status: 'PENDING',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'r1',
          tournamentId: 't1',
          userId: 'u1',
          partnerUserIds: [],
          response: 'Full',
          user: { name: 'U1' },
          category: { name: 'MS' },
        }),
      },
    };
    const notifier = { reviewed: jest.fn() };
    const service = new TournamentRegistrationReviewService(
      prisma,
      { assertManageAccess: jest.fn() } as any,
      notifier as any
    );

    await service.reject('t1', 'r1', { response: ' Full ' }, 'host');

    expect(
      prisma.tournamentRegistrationRequest.updateMany
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED', response: 'Full' }),
      })
    );
    expect(notifier.reviewed).toHaveBeenCalledWith(
      expect.objectContaining({ requesterId: 'u1' }),
      false,
      'Full'
    );
  });
});
