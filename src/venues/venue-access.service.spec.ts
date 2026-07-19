import { ForbiddenException } from '@nestjs/common';
import { VenueManagerRole } from '@prisma/client';
import { VenueAccessService } from './venue-access.service';

describe('VenueAccessService', () => {
  const prisma = {
    venueManager: { findUnique: jest.fn(), findFirst: jest.fn() },
    venue: { findUnique: jest.fn() },
  };
  const service = new VenueAccessService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('allows a PLAYER assigned as a venue manager', async () => {
    prisma.venueManager.findUnique.mockResolvedValue({
      venueId: 'venue-1',
      userId: 'player-1',
      role: VenueManagerRole.MANAGER,
    });
    await expect(
      service.assertManager('venue-1', 'player-1', 'PLAYER')
    ).resolves.toBeUndefined();
  });

  it('rejects a HOST who is not assigned to the venue', async () => {
    prisma.venueManager.findUnique.mockResolvedValue(null);
    await expect(
      service.assertManager('venue-1', 'host-1', 'HOST')
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an ADMIN without a membership record', async () => {
    await expect(
      service.assertManager('venue-1', 'admin-1', 'ADMIN')
    ).resolves.toBeUndefined();
    expect(prisma.venueManager.findUnique).not.toHaveBeenCalled();
  });
});
