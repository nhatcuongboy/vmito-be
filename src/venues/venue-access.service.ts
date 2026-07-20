import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, VenueManagerRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VenueAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertManager(venueId: string, userId: string, role?: string) {
    if (role === Role.ADMIN) return;

    const manager = await this.prisma.venueManager.findUnique({
      where: { venueId_userId: { venueId, userId } },
    });
    if (!manager) {
      throw new ForbiddenException('Venue manager access required');
    }
  }

  async assertOwner(venueId: string, userId: string, role?: string) {
    if (role === Role.ADMIN) return;

    const owner = await this.prisma.venueManager.findFirst({
      where: { venueId, userId, role: VenueManagerRole.OWNER },
    });
    if (!owner) {
      throw new ForbiddenException('Venue owner access required');
    }
  }

  async ensureVenue(venueId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
    });
    if (!venue) throw new NotFoundException('Venue not found');
    return venue;
  }
}
