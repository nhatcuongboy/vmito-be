import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClosureStatus,
  Prisma,
  VenueRequestStatus,
  VenueRequestType,
  VenueStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VenuesService } from '../venues/venues.service';
import { CreateVenueRequestDto, QueryVenueRequestsDto } from './dto';
import { VenueRequestPayloadDto } from './dto/venue-request-payload.dto';

const VENUE_REQUEST_INCLUDE = {
  submittedBy: { select: { id: true, name: true, email: true, image: true } },
  reviewedBy: { select: { id: true, name: true, email: true, image: true } },
  venue: true,
  appliedVenue: true,
} satisfies Prisma.VenueRequestInclude;

type VenuePatchPayload = Partial<{
  name: string;
  address: string;
  city: string;
  district: string;
  numberOfCourts: number;
  openingHours: string;
  hourlyRateFixed: number;
  hourlyRateWalkIn: number;
  phone: string;
  website: string;
  locatedWithin: string;
  bookingPolicy: string;
}>;

@Injectable()
export class VenueRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly venuesService: VenuesService
  ) {}

  async create(dto: CreateVenueRequestDto, userId: string) {
    const payload = this.sanitizePayload(dto.payload);
    this.validateRequest(dto.type, dto.venueId, payload);

    if (dto.type === VenueRequestType.UPDATE) {
      const venue = await this.prisma.venue.findUnique({
        where: { id: dto.venueId! },
        select: { id: true },
      });
      if (!venue) throw new NotFoundException('Venue not found');
    }

    return this.prisma.venueRequest.create({
      data: {
        type: dto.type,
        submittedByUserId: userId,
        venueId: dto.type === VenueRequestType.UPDATE ? dto.venueId : null,
        payload: payload as Prisma.InputJsonObject,
      },
      include: VENUE_REQUEST_INCLUDE,
    });
  }

  async findMine(userId: string, query: QueryVenueRequestsDto) {
    return this.prisma.venueRequest.findMany({
      where: {
        submittedByUserId: userId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: VENUE_REQUEST_INCLUDE,
    });
  }

  async findAllAdmin(query: QueryVenueRequestsDto) {
    return this.prisma.venueRequest.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: VENUE_REQUEST_INCLUDE,
    });
  }

  async approve(id: string, adminUserId: string) {
    const request = await this.getPendingRequest(id);
    const payload = this.sanitizePayload(
      request.payload as VenueRequestPayloadDto
    );

    if (request.type === VenueRequestType.CREATE) {
      this.validateCreatePayload(payload);
      const createPayload = this.toVenuePatchPayload(payload);
      const createdVenue = await this.venuesService.create({
        ...createPayload,
        name: payload.name!,
        address: payload.address!,
        city: payload.city!,
        district: payload.district!,
        status: VenueStatus.ACTIVE,
        closureStatus: ClosureStatus.OPERATING,
        isVerified: false,
      });

      return this.prisma.venueRequest.update({
        where: { id },
        data: {
          status: VenueRequestStatus.APPROVED,
          appliedVenueId: createdVenue.id,
          reviewedByUserId: adminUserId,
          reviewedAt: new Date(),
        },
        include: VENUE_REQUEST_INCLUDE,
      });
    }

    if (!request.venueId) {
      throw new BadRequestException('Update request must target a venue');
    }

    const patchPayload = this.toVenuePatchPayload(payload);
    if (Object.keys(patchPayload).length === 0) {
      throw new BadRequestException('No venue fields to update');
    }

    const updatedVenue = await this.venuesService.update(
      request.venueId,
      patchPayload
    );

    return this.prisma.venueRequest.update({
      where: { id },
      data: {
        status: VenueRequestStatus.APPROVED,
        appliedVenueId: updatedVenue.id,
        reviewedByUserId: adminUserId,
        reviewedAt: new Date(),
      },
      include: VENUE_REQUEST_INCLUDE,
    });
  }

  async reject(id: string, adminUserId: string, adminNote: string) {
    await this.getPendingRequest(id);

    return this.prisma.venueRequest.update({
      where: { id },
      data: {
        status: VenueRequestStatus.REJECTED,
        adminNote: adminNote.trim(),
        reviewedByUserId: adminUserId,
        reviewedAt: new Date(),
      },
      include: VENUE_REQUEST_INCLUDE,
    });
  }

  private async getPendingRequest(id: string) {
    const request = await this.prisma.venueRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Venue request not found');
    if (request.status !== VenueRequestStatus.PENDING) {
      throw new BadRequestException('Venue request has already been processed');
    }
    return request;
  }

  private validateRequest(
    type: VenueRequestType,
    venueId: string | undefined,
    payload: VenueRequestPayloadDto
  ) {
    if (type === VenueRequestType.CREATE) {
      this.validateCreatePayload(payload);
      return;
    }

    if (!venueId) {
      throw new BadRequestException('venueId is required for update requests');
    }

    if (Object.keys(this.toVenuePatchPayload(payload)).length === 0) {
      throw new BadRequestException('At least one venue field is required');
    }
  }

  private validateCreatePayload(payload: VenueRequestPayloadDto) {
    const missing = ['name', 'address', 'city', 'district'].filter((field) => {
      const value = payload[field as keyof VenueRequestPayloadDto];
      return typeof value !== 'string' || value.trim().length === 0;
    });

    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required venue fields: ${missing.join(', ')}`
      );
    }
  }

  private sanitizePayload(payload: VenueRequestPayloadDto) {
    const sanitized: VenueRequestPayloadDto = {};

    const assignString = (key: keyof VenueRequestPayloadDto) => {
      const value = payload?.[key];
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) sanitized[key] = trimmed as never;
      }
    };

    const assignNumber = (key: keyof VenueRequestPayloadDto) => {
      const value = payload?.[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        sanitized[key] = value as never;
      }
    };

    assignString('name');
    assignString('address');
    assignString('city');
    assignString('district');
    assignString('openingHours');
    assignString('phone');
    assignString('website');
    assignString('locatedWithin');
    assignString('bookingPolicy');
    assignString('note');
    assignNumber('numberOfCourts');
    assignNumber('hourlyRateFixed');
    assignNumber('hourlyRateWalkIn');

    return sanitized;
  }

  private toVenuePatchPayload(payload: VenueRequestPayloadDto) {
    const { note: _note, ...venueFields } = payload;
    return venueFields as VenuePatchPayload;
  }
}
