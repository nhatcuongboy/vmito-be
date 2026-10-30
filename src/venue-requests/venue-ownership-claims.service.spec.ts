import { BadRequestException, ConflictException } from '@nestjs/common';
import { VenueManagerRole, VenueRequestStatus } from '@prisma/client';
import { VenueOwnershipClaimsService } from './venue-ownership-claims.service';
import type { VenueRequestWithRelations } from './venue-request.include';

describe('VenueOwnershipClaimsService', () => {
  const tx = {
    $queryRawUnsafe: jest.fn(),
    venueManager: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    venueRequest: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };
  const prisma = {
    venue: { findUnique: jest.fn() },
    user: { findMany: jest.fn() },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const notifications = {
    createForUser: jest.fn(),
    createManyForUsers: jest.fn(),
  };
  const auditLogs = { create: jest.fn() };
  const service = new VenueOwnershipClaimsService(
    prisma as never,
    notifications as never,
    auditLogs as never
  );
  const claim = {
    claim: {
      contactName: 'An',
      contactPhone: '0900000000',
      proofImages: [{ url: 'https://img/1.jpg' }],
    },
  };
  const request = {
    id: 'request-1',
    venueId: 'venue-1',
    submittedByUserId: 'user-1',
  } as VenueRequestWithRelations;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.venue.findUnique.mockResolvedValue({ id: 'venue-1', name: 'Sân A' });
    prisma.user.findMany.mockResolvedValue([]);
    tx.venueManager.findUnique.mockResolvedValue(null);
    tx.venueManager.findMany.mockResolvedValue([]);
    tx.venueRequest.findFirst.mockResolvedValue(null);
    tx.venueRequest.create.mockResolvedValue({ id: 'request-1' });
    tx.venueRequest.updateMany.mockResolvedValue({ count: 1 });
    tx.venueRequest.findUniqueOrThrow.mockResolvedValue({
      ...request,
      venue: { name: 'Sân A' },
    });
  });

  it('requires contact details and a proof image', () => {
    expect(() =>
      service.validate('venue-1', {
        claim: { ...claim.claim, proofImages: [] },
      })
    ).toThrow(BadRequestException);
    expect(() => service.validate(undefined, claim)).toThrow(
      BadRequestException
    );
    expect(() => service.validate('venue-1', claim)).not.toThrow();
  });

  it('refuses a user who already owns the venue', async () => {
    tx.venueManager.findUnique.mockResolvedValue({
      role: VenueManagerRole.OWNER,
    });
    await expect(
      service.submit('user-1', 'venue-1', claim)
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a second pending claim', async () => {
    tx.venueRequest.findFirst.mockResolvedValue({ id: 'other' });
    await expect(
      service.submit('user-1', 'venue-1', claim)
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.venueRequest.create).not.toHaveBeenCalled();
  });

  it('lets a manager claim ownership', async () => {
    tx.venueManager.findUnique.mockResolvedValue({
      role: VenueManagerRole.MANAGER,
    });
    await expect(service.submit('user-1', 'venue-1', claim)).resolves.toEqual({
      id: 'request-1',
    });
  });

  it('ADD upserts the owner and keeps existing owners', async () => {
    await service.approve(request, 'admin-1', 'ADD');

    expect(tx.venueManager.updateMany).not.toHaveBeenCalled();
    expect(tx.venueManager.upsert).toHaveBeenCalledWith({
      where: { venueId_userId: { venueId: 'venue-1', userId: 'user-1' } },
      create: {
        venueId: 'venue-1',
        userId: 'user-1',
        role: VenueManagerRole.OWNER,
      },
      update: { role: VenueManagerRole.OWNER },
    });
    expect(auditLogs.create).toHaveBeenCalledTimes(1);
  });

  it('REPLACE demotes other owners and tells them', async () => {
    tx.venueManager.findMany.mockResolvedValue([{ userId: 'old-owner' }]);

    await service.approve(request, 'admin-1', 'REPLACE');

    expect(tx.venueManager.updateMany).toHaveBeenCalledWith({
      where: { venueId: 'venue-1', userId: { in: ['old-owner'] } },
      data: { role: VenueManagerRole.MANAGER },
    });
    const [userIds] = notifications.createManyForUsers.mock.calls[0] as [
      string[],
    ];
    expect(userIds).toEqual(['old-owner']);
  });

  it('does not re-apply a claim that was already processed', async () => {
    tx.venueRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.approve(request, 'admin-1', 'ADD')
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.venueManager.upsert).not.toHaveBeenCalled();
    expect(tx.venueRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'request-1', status: VenueRequestStatus.PENDING },
      })
    );
  });
});
