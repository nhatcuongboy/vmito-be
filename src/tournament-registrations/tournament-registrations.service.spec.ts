/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { TournamentRegistrationsService } from './tournament-registrations.service';

describe('TournamentRegistrationsService', () => {
  let service: TournamentRegistrationsService;
  let prisma: any;
  let notifier: { submitted: jest.Mock };

  beforeEach(() => {
    prisma = {
      tournament: {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          name: 'Open',
          hostId: 'host',
          registrationOpen: true,
          registrationDeadline: null,
          isPublished: true,
          status: 'PREPARING',
        }),
      },
      category: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'c1',
          tournamentId: 't1',
          name: 'MD',
          registrationMode: 'TEAM',
          teamSize: 2,
          registrationEnabled: true,
          maxRegistrations: null,
        }),
      },
      categoryMatch: { count: jest.fn().mockResolvedValue(0) },
      categoryRegistration: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findMany: jest.fn(({ where }: any) =>
          Promise.resolve(
            where.id.in.map((id: string) => ({ id, name: `User ${id}` }))
          )
        ),
      },
      tournamentRegistrationRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }: any) =>
          Promise.resolve({ id: 'r1', ...data })
        ),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    notifier = { submitted: jest.fn() };
    service = new TournamentRegistrationsService(prisma, notifier as any);
  });

  const dto = { categoryId: 'c1', partnerUserIds: ['u2'] };

  it('creates a pending request and notifies organizers', async () => {
    await service.submit('t1', dto, 'u1');

    expect(prisma.tournamentRegistrationRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tournamentId: 't1',
          categoryId: 'c1',
          userId: 'u1',
          partnerUserIds: ['u2'],
          guestPartnerNames: [],
        }),
      })
    );
    expect(notifier.submitted).toHaveBeenCalledWith(
      expect.objectContaining({
        requesterId: 'u1',
        requesterName: 'User u1',
        partnerUserIds: ['u2'],
      }),
      'host'
    );
  });

  it('rejects when registration is closed', async () => {
    prisma.tournament.findUnique.mockResolvedValue({
      ...(await prisma.tournament.findUnique()),
      registrationOpen: false,
    });
    await expect(service.submit('t1', dto, 'u1')).rejects.toThrow(
      'Registration is not open'
    );
    expect(prisma.tournamentRegistrationRequest.create).not.toHaveBeenCalled();
  });

  it('rejects a category from another tournament', async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: 'c1',
      tournamentId: 'other',
    });
    await expect(service.submit('t1', dto, 'u1')).rejects.toThrow(
      'Category not found in this tournament'
    );
  });

  it('rejects an unknown partner', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'u1', name: 'U1' }]);
    await expect(service.submit('t1', dto, 'u1')).rejects.toThrow(
      BadRequestException
    );
  });

  it('rejects when a pending request already includes a member', async () => {
    prisma.tournamentRegistrationRequest.findFirst.mockResolvedValue({
      id: 'other',
    });
    await expect(service.submit('t1', dto, 'u1')).rejects.toThrow(
      ConflictException
    );
    expect(
      prisma.tournamentRegistrationRequest.findFirst.mock.calls[0][0].where
    ).toEqual(
      expect.objectContaining({
        categoryId: 'c1',
        status: 'PENDING',
        OR: [
          { userId: { in: ['u1', 'u2'] } },
          { partnerUserIds: { hasSome: ['u1', 'u2'] } },
        ],
      })
    );
  });

  it('rejects when a member already plays in the category', async () => {
    prisma.categoryRegistration.findMany.mockResolvedValue([
      { player: null, pair: { members: [{ player: { userId: 'u2' } }] } },
    ]);
    await expect(service.submit('t1', dto, 'u1')).rejects.toThrow(
      'You or your partner are already registered in this category'
    );
  });

  describe('cancel', () => {
    it('cancels own pending request', async () => {
      prisma.tournamentRegistrationRequest.findUnique.mockResolvedValue({
        id: 'r1',
        tournamentId: 't1',
        userId: 'u1',
        status: 'PENDING',
      });
      await service.cancel('t1', 'r1', 'u1');
      expect(prisma.tournamentRegistrationRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED' } })
      );
    });

    it("refuses someone else's request", async () => {
      prisma.tournamentRegistrationRequest.findUnique.mockResolvedValue({
        id: 'r1',
        tournamentId: 't1',
        userId: 'u2',
        status: 'PENDING',
      });
      await expect(service.cancel('t1', 'r1', 'u1')).rejects.toThrow(
        ForbiddenException
      );
    });

    it('refuses already reviewed requests', async () => {
      prisma.tournamentRegistrationRequest.findUnique.mockResolvedValue({
        id: 'r1',
        tournamentId: 't1',
        userId: 'u1',
        status: 'APPROVED',
      });
      await expect(service.cancel('t1', 'r1', 'u1')).rejects.toThrow(
        'Only pending requests can be cancelled'
      );
    });
  });
});
