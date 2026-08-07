import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ClosureStatus,
  NotificationType,
  Prisma,
  SportType,
  VenueRequestStatus,
  VenueRequestType,
  VenueStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VenuesService } from '../venues/venues.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isSportType } from '../common/utils/sport.utils';
import {
  ApproveVenueRequestDto,
  CreateVenueRequestDto,
  QueryVenueRequestsDto,
} from './dto';
import { VenueRequestPayloadDto } from './dto/venue-request-payload.dto';

const VENUE_REQUEST_INCLUDE = {
  submittedBy: { select: { id: true, name: true, email: true, image: true } },
  reviewedBy: { select: { id: true, name: true, email: true, image: true } },
  venue: true,
  appliedVenue: true,
} satisfies Prisma.VenueRequestInclude;

type VenuePatchPayload = Partial<{
  name: string;
  sportTypes: SportType[];
  address: string;
  city: string;
  district: string;
  newCity: string;
  newDistrict: string;
  numberOfCourts: number;
  openingHours: string;
  phone: string;
  website: string;
  locatedWithin: string;
  bookingPolicy: string;
  wifiName: string;
  wifiPassword: string;
  closureStatus: ClosureStatus;
  description: string;
}>;

// Payload keys that describe a correction attachment or a derivation input
// rather than a venue column directly — they must never be spread onto the
// Venue row. `street` is only ever consumed manually in the CREATE branch of
// approve() (to build a fallback `address` when the venue has no old address
// yet); VenuesService derives `newAddress`/`streetAddress` itself and never
// accepts either as direct input.
const NON_VENUE_PAYLOAD_KEYS = [
  'note',
  'priceImageUrl',
  'priceImagePublicId',
  'suggestedImages',
  'street',
] as const;

@Injectable()
export class VenueRequestsService {
  private readonly logger = new Logger(VenueRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly venuesService: VenuesService,
    private readonly notificationsService: NotificationsService
  ) {}

  async create(dto: CreateVenueRequestDto, userId: string) {
    const payload = this.sanitizePayload(dto.payload);
    this.validateRequest(dto.type, dto.venueId, payload);

    // Every non-CREATE type targets an existing venue.
    const targetsVenue = dto.type !== VenueRequestType.CREATE;

    if (targetsVenue) {
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
        venueId: targetsVenue ? dto.venueId : null,
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

  async findOneAdmin(id: string) {
    const request = await this.prisma.venueRequest.findUnique({
      where: { id },
      include: VENUE_REQUEST_INCLUDE,
    });

    if (!request) {
      throw new NotFoundException('Venue request not found');
    }

    return request;
  }

  async approve(
    id: string,
    adminUserId: string,
    dto: ApproveVenueRequestDto = {}
  ) {
    const request = await this.getPendingRequest(id);
    const payload = this.sanitizePayload(
      request.payload as VenueRequestPayloadDto
    );

    if (request.type === VenueRequestType.CREATE) {
      this.validateCreatePayload(payload);
      const createPayload = this.toVenuePatchPayload(payload);
      // Prefer newAddress (full formatted string from FE) as address fallback.
      // If absent, compose from street + newDistrict + newCity.
      const composedAddress = [
        payload.street,
        payload.newDistrict,
        payload.newCity,
      ]
        .filter(Boolean)
        .join(', ');
      const fallbackAddress = payload.street || composedAddress;
      const createdVenue = await this.venuesService.create({
        ...createPayload,
        name: payload.name!,
        address: payload.address || fallbackAddress,
        city: payload.city,
        district: payload.district,
        status: VenueStatus.ACTIVE,
        closureStatus: ClosureStatus.OPERATING,
        isVerified: false,
      });

      const updatedRequest = await this.prisma.venueRequest.update({
        where: { id },
        data: {
          status: VenueRequestStatus.APPROVED,
          appliedVenueId: createdVenue.id,
          reviewedByUserId: adminUserId,
          reviewedAt: new Date(),
        },
        include: VENUE_REQUEST_INCLUDE,
      });

      await this.sendApprovalNotification(
        updatedRequest,
        createdVenue.id,
        createdVenue.name
      );

      return updatedRequest;
    }

    if (!request.venueId) {
      throw new BadRequestException('Update request must target a venue');
    }

    // Price corrections are photo suggestions only — approving just closes the
    // review; the admin configures the structured price book separately.
    if (request.type === VenueRequestType.PRICE_CORRECTION) {
      return this.markApproved(id, adminUserId, request.venueId);
    }

    // Image corrections apply the admin-selected subset of suggested photos.
    if (request.type === VenueRequestType.IMAGE_CORRECTION) {
      await this.applyImageCorrection(
        request.venueId,
        payload,
        dto.applyImagePublicIds
      );
      return this.markApproved(id, adminUserId, request.venueId);
    }

    const patchPayload = this.toVenuePatchPayload(payload);
    if (Object.keys(patchPayload).length === 0) {
      throw new BadRequestException('No venue fields to update');
    }

    const updatedVenue = await this.venuesService.update(
      request.venueId,
      patchPayload
    );

    const updatedRequest = await this.prisma.venueRequest.update({
      where: { id },
      data: {
        status: VenueRequestStatus.APPROVED,
        appliedVenueId: updatedVenue.id,
        reviewedByUserId: adminUserId,
        reviewedAt: new Date(),
      },
      include: VENUE_REQUEST_INCLUDE,
    });

    await this.sendApprovalNotification(
      updatedRequest,
      updatedVenue.id,
      updatedVenue.name
    );

    return updatedRequest;
  }

  private async markApproved(
    id: string,
    adminUserId: string,
    appliedVenueId: string
  ) {
    const updatedRequest = await this.prisma.venueRequest.update({
      where: { id },
      data: {
        status: VenueRequestStatus.APPROVED,
        appliedVenueId,
        reviewedByUserId: adminUserId,
        reviewedAt: new Date(),
      },
      include: VENUE_REQUEST_INCLUDE,
    });

    const venueName =
      updatedRequest.venue?.name ||
      updatedRequest.appliedVenue?.name ||
      (updatedRequest.payload as VenueRequestPayloadDto)?.name ||
      'Sân cầu lông';

    await this.sendApprovalNotification(
      updatedRequest,
      appliedVenueId,
      venueName
    );

    return updatedRequest;
  }

  private async applyImageCorrection(
    venueId: string,
    payload: VenueRequestPayloadDto,
    applyImagePublicIds?: string[]
  ) {
    const suggested = payload.suggestedImages ?? [];
    // If the admin passed a selection, keep only those; otherwise apply all.
    const selected = applyImagePublicIds
      ? suggested.filter(
          (image) =>
            image.publicId && applyImagePublicIds.includes(image.publicId)
        )
      : suggested;

    if (selected.length === 0) {
      throw new BadRequestException('No images selected to apply');
    }

    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { images: true, imagePublicIds: true },
    });
    if (!venue) throw new NotFoundException('Venue not found');

    const images = [...venue.images];
    const imagePublicIds = [...venue.imagePublicIds];
    const existing = new Set([...venue.images, ...venue.imagePublicIds]);

    for (const image of selected) {
      const key = image.publicId || image.url;
      if (existing.has(key) || images.includes(image.url)) continue;
      images.push(image.url);
      imagePublicIds.push(image.publicId ?? '');
      existing.add(key);
    }

    await this.venuesService.update(venueId, { images, imagePublicIds });
  }

  async reject(id: string, adminUserId: string, adminNote: string) {
    const _request = await this.getPendingRequest(id);

    const updatedRequest = await this.prisma.venueRequest.update({
      where: { id },
      data: {
        status: VenueRequestStatus.REJECTED,
        adminNote: adminNote.trim(),
        reviewedByUserId: adminUserId,
        reviewedAt: new Date(),
      },
      include: VENUE_REQUEST_INCLUDE,
    });

    await this.sendRejectionNotification(updatedRequest, adminNote.trim());

    return updatedRequest;
  }

  private async getPendingRequest(id: string) {
    const request = await this.prisma.venueRequest.findUnique({
      where: { id },
      include: VENUE_REQUEST_INCLUDE,
    });
    if (!request) throw new NotFoundException('Venue request not found');
    if (request.status !== VenueRequestStatus.PENDING) {
      throw new BadRequestException('Venue request has already been processed');
    }
    return request;
  }

  private async sendApprovalNotification(
    request: Prisma.VenueRequestGetPayload<{
      include: typeof VENUE_REQUEST_INCLUDE;
    }>,
    venueId: string,
    venueName: string
  ) {
    if (!request.submittedByUserId) return;

    try {
      await this.notificationsService.createForUser(
        request.submittedByUserId,
        'VENUE_REQUEST' as NotificationType,
        'Yêu cầu thông tin sân đã được phê duyệt',
        `Đề xuất về sân "${venueName}" của bạn đã được quản trị viên phê duyệt.`,
        {
          action: 'venue_request_approved',
          requestId: request.id,
          venueId,
          venueName,
        }
      );
    } catch (err: unknown) {
      this.logger.error(
        `Failed to send approval notification for venue request ${request.id}`,
        err
      );
    }
  }

  private async sendRejectionNotification(
    request: Prisma.VenueRequestGetPayload<{
      include: typeof VENUE_REQUEST_INCLUDE;
    }>,
    adminNote: string
  ) {
    if (!request.submittedByUserId) return;

    const payload = request.payload as VenueRequestPayloadDto;
    const venueName = request.venue?.name || payload?.name || 'Sân cầu lông';
    const venueId = request.venueId ?? undefined;

    try {
      await this.notificationsService.createForUser(
        request.submittedByUserId,
        'VENUE_REQUEST' as NotificationType,
        'Yêu cầu thông tin sân bị từ chối',
        `Đề xuất về sân "${venueName}" của bạn bị từ chối. Lý do: ${adminNote}`,
        {
          action: 'venue_request_rejected',
          requestId: request.id,
          venueId,
          venueName,
          adminNote,
          rejectionReason: adminNote,
        }
      );
    } catch (err: unknown) {
      this.logger.error(
        `Failed to send rejection notification for venue request ${request.id}`,
        err
      );
    }
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

    if (type === VenueRequestType.PRICE_CORRECTION) {
      if (!payload.priceImageUrl) {
        throw new BadRequestException(
          'A price board image is required for price correction requests'
        );
      }
      return;
    }

    if (type === VenueRequestType.IMAGE_CORRECTION) {
      if (!payload.suggestedImages || payload.suggestedImages.length === 0) {
        throw new BadRequestException(
          'At least one image is required for image correction requests'
        );
      }
      return;
    }

    if (Object.keys(this.toVenuePatchPayload(payload)).length === 0) {
      throw new BadRequestException('At least one venue field is required');
    }
  }

  private validateCreatePayload(payload: VenueRequestPayloadDto) {
    const missing: string[] = [];
    if (!payload.name) missing.push('name');
    if (!payload.address && !payload.street) {
      missing.push('address/street');
    }
    if (!payload.city && !payload.newCity) missing.push('city/newCity');
    if (!payload.district && !payload.newDistrict) {
      missing.push('district/newDistrict');
    }

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
    assignString('street');
    assignString('newCity');
    assignString('newDistrict');
    assignString('openingHours');
    assignString('phone');
    assignString('website');
    assignString('locatedWithin');
    assignString('bookingPolicy');
    assignString('wifiName');
    assignString('wifiPassword');
    assignString('description');
    assignString('priceImageUrl');
    assignString('priceImagePublicId');
    assignString('note');
    assignNumber('numberOfCourts');

    if (
      payload?.closureStatus &&
      Object.values(ClosureStatus).includes(payload.closureStatus)
    ) {
      sanitized.closureStatus = payload.closureStatus;
    }

    if (Array.isArray(payload?.sportTypes)) {
      const sports = Array.from(
        new Set(payload.sportTypes.filter(isSportType))
      );
      if (sports.length > 0) sanitized.sportTypes = sports;
    }

    if (Array.isArray(payload?.suggestedImages)) {
      const images = payload.suggestedImages
        .filter(
          (image): image is { url: string; publicId?: string } =>
            !!image && typeof image.url === 'string' && image.url.trim() !== ''
        )
        .map((image) => ({
          url: image.url.trim(),
          publicId:
            typeof image.publicId === 'string' ? image.publicId.trim() : '',
        }));
      if (images.length > 0) {
        sanitized.suggestedImages = images;
      }
    }

    return sanitized;
  }

  private toVenuePatchPayload(payload: VenueRequestPayloadDto) {
    const venueFields = { ...payload } as Record<string, unknown>;
    for (const key of NON_VENUE_PAYLOAD_KEYS) {
      delete venueFields[key];
    }
    return venueFields as VenuePatchPayload;
  }
}
