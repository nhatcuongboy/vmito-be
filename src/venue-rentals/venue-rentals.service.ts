import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  Role,
  VenueRentalAllocationStatus,
  VenueRentalEventType,
  VenueCustomerType,
  VenueRentalProposalKind,
  VenueRentalSeriesStatus,
  VenueRentalProposalStatus,
  VenueRentalSelectionMode,
  VenueRentalSource,
  VenueRentalStatus,
  VenueRentalTransactionPurpose,
  VenueRentalTransactionStatus,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { areRentalNotificationsMuted } from './rental-notify-scope';
import { PrismaService } from '../prisma/prisma.service';
import { VenueAccessService } from '../venues/venue-access.service';
import {
  CreateRentalProposalDto,
  CreateManualRentalDto,
  CreateVenueRentalDto,
  QueryVenueRentalsDto,
  ReallocateRentalCourtsDto,
} from './dto/venue-rental.dto';
import { VenueCourtsService } from './venue-courts.service';
import {
  DEPOSIT_DUE_SOON_MS,
  rentalAttentionReasons,
} from './rental-attention';
import { readRentalSegments } from './rental-segments';
import { VenuePricingService } from './venue-pricing.service';
import { VenueRentalPaymentsService } from './venue-rental-payments.service';

type RentalWithVenue = Awaited<ReturnType<VenueRentalsService['getRequest']>>;

/** How long a submitted request keeps its courts while awaiting review. */
const PENDING_HOLD_HOURS = 24;

/** `cancellationReason` of a request nobody answered in time. */
const REQUEST_EXPIRED_REASON = 'REQUEST_EXPIRED';

const RENTAL_INCLUDE = {
  venue: {
    select: {
      id: true,
      slug: true,
      name: true,
      address: true,
      timezone: true,
      courtSelectionEnabled: true,
    },
  },
  requester: {
    select: { id: true, name: true, email: true, image: true, phone: true },
  },
  quote: true,
  session: {
    select: {
      id: true,
      slug: true,
      name: true,
      startTime: true,
      endTime: true,
    },
  },
  reviewedBy: { select: { id: true, name: true, image: true } },
  cancelledBy: { select: { id: true, name: true, image: true } },
  createdBy: { select: { id: true, name: true, image: true } },
  courtAllocations: {
    where: { status: { in: ['RESERVED' as const, 'CONFIRMED' as const] } },
    include: { court: { select: { id: true, name: true, code: true } } },
  },
  proposals: {
    orderBy: { createdAt: 'desc' as const },
    include: { proposedBy: { select: { id: true, name: true, image: true } } },
  },
  events: {
    orderBy: { createdAt: 'asc' as const },
    include: { actor: { select: { id: true, name: true, image: true } } },
  },
} satisfies Prisma.VenueRentalRequestInclude;

@Injectable()
export class VenueRentalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: VenuePricingService,
    private readonly access: VenueAccessService,
    private readonly notifications: NotificationsService,
    private readonly courts: VenueCourtsService,
    private readonly payments: VenueRentalPaymentsService
  ) {}

  async createQuote(
    venueId: string,
    dto: CreateRentalProposalDto,
    requesterId: string
  ) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        rentalEnabled: true,
        courtSelectionEnabled: true,
        timezone: true,
      },
    });
    if (!venue) throw new NotFoundException('Venue not found');
    if (!venue.rentalEnabled) {
      throw this.conflict(
        'RENTAL_DISABLED',
        'Online rental is not enabled for this venue'
      );
    }

    if (dto.segments) {
      return this.createSegmentedQuote(venueId, dto, requesterId, venue);
    }
    const calculation = await this.pricing.calculate(venueId, {
      ...dto,
      requireFuture: true,
    });
    if (!venue.courtSelectionEnabled) {
      // Court-selection venues are covered by per-court holds; here nothing
      // else stops one player stacking requests for the same hours.
      await this.assertNoOverlappingRequest(
        requesterId,
        venueId,
        calculation.startTime,
        calculation.endTime
      );
    }
    const selectionMode = venue.courtSelectionEnabled
      ? dto.selectionMode || VenueRentalSelectionMode.AUTO_ASSIGN
      : VenueRentalSelectionMode.AUTO_ASSIGN;
    const expiresAt = new Date(
      Date.now() + (venue.courtSelectionEnabled ? 10 : 30) * 60 * 1000
    );
    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.venueRentalQuote.create({
        data: {
          venueId,
          requesterId,
          startTime: calculation.startTime,
          endTime: calculation.endTime,
          numberOfCourts: dto.numberOfCourts,
          customerType: dto.customerType,
          currency: calculation.currency,
          totalAmount: calculation.totalAmount,
          priceBookId: calculation.priceBookId,
          breakdown: {
            version: calculation.version,
            items: calculation.breakdown,
          } as unknown as Prisma.InputJsonValue,
          selectionMode,
          requestedCourtIds: venue.courtSelectionEnabled
            ? dto.courtIds || []
            : [],
          expiresAt,
        },
      });
      if (!venue.courtSelectionEnabled) return quote;
      const courtIds = await this.courts.holdForQuote(tx, {
        quoteId: quote.id,
        venueId,
        startTime: calculation.startTime,
        endTime: calculation.endTime,
        numberOfCourts: dto.numberOfCourts,
        selectionMode,
        courtIds: dto.courtIds,
        expiresAt,
        timezone: venue.timezone,
        requesterId,
      });
      return tx.venueRentalQuote.update({
        where: { id: quote.id },
        data: { requestedCourtIds: courtIds },
      });
    });
  }

  /**
   * Different time ranges on different courts of one day, in one quote. The
   * single-range columns keep the envelope (earliest start, latest end, number
   * of distinct courts) so every start/end-based rule — cancel cutoff,
   * refunds, completion, list filters — and older clients keep working.
   */
  private async createSegmentedQuote(
    venueId: string,
    dto: CreateRentalProposalDto,
    requesterId: string,
    venue: { courtSelectionEnabled: boolean; timezone: string }
  ) {
    if (!venue.courtSelectionEnabled) {
      throw new BadRequestException({
        code: 'SEGMENTS_UNSUPPORTED',
        message: 'Multi-segment rentals need court selection to be enabled',
      });
    }
    const calculation = await this.pricing.calculateSegments(venueId, {
      segments: dto.segments!,
      customerType: dto.customerType,
      requireFuture: true,
    });
    const storedSegments = await this.labelSegments(
      venueId,
      calculation.courtIds,
      calculation.segments
    );
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.venueRentalQuote.create({
        data: {
          venueId,
          requesterId,
          startTime: calculation.startTime,
          endTime: calculation.endTime,
          numberOfCourts: calculation.courtIds.length,
          customerType: dto.customerType,
          currency: calculation.currency,
          totalAmount: calculation.totalAmount,
          priceBookId: calculation.priceBookId,
          breakdown: {
            version: calculation.version,
            items: calculation.breakdown,
          } as unknown as Prisma.InputJsonValue,
          selectionMode: VenueRentalSelectionMode.SELECT_COURTS,
          requestedCourtIds: calculation.courtIds,
          segments: storedSegments as unknown as Prisma.InputJsonValue,
          expiresAt,
        },
      });
      // Advisory day locks stack within the transaction, so one hold per
      // segment is safe; all segments share a day.
      for (const segment of calculation.segments) {
        await this.courts.holdForQuote(tx, {
          quoteId: quote.id,
          venueId,
          startTime: new Date(segment.startTime),
          endTime: new Date(segment.endTime),
          numberOfCourts: segment.numberOfCourts,
          selectionMode: VenueRentalSelectionMode.SELECT_COURTS,
          courtIds: segment.courtIds,
          expiresAt,
          timezone: venue.timezone,
          requesterId,
        });
      }
      return quote;
    });
  }

  /**
   * Court labels travel with each segment so a pending request can show
   * "Sân 1 · 17:00–18:30" before any allocation exists.
   */
  private async labelSegments<T extends { courtIds: string[] }>(
    venueId: string,
    courtIds: string[],
    segments: T[]
  ) {
    const courts = await this.prisma.venueCourt.findMany({
      where: { venueId, id: { in: courtIds } },
      select: { id: true, name: true, code: true },
    });
    return segments.map((segment) => ({
      ...segment,
      courts: segment.courtIds
        .map((courtId) => courts.find((court) => court.id === courtId))
        .filter((court) => court !== undefined),
    }));
  }

  /** Prices a manager's schedule, single-range or multi-segment. */
  private async priceSchedule(
    venueId: string,
    dto: CreateRentalProposalDto,
    courtSelectionEnabled: boolean
  ) {
    if (dto.segments?.length) {
      if (!courtSelectionEnabled) {
        throw new BadRequestException({
          code: 'SEGMENTS_UNSUPPORTED',
          message: 'Multi-segment rentals need court selection to be enabled',
        });
      }
      const calculation = await this.pricing.calculateSegments(venueId, {
        segments: dto.segments,
        customerType: dto.customerType,
        requireFuture: true,
      });
      return {
        calculation,
        numberOfCourts: calculation.courtIds.length,
        selectionMode: VenueRentalSelectionMode.SELECT_COURTS,
        courtIds: calculation.courtIds,
        segments: await this.labelSegments(
          venueId,
          calculation.courtIds,
          calculation.segments
        ),
      };
    }
    const calculation = await this.pricing.calculate(venueId, {
      ...dto,
      requireFuture: true,
    });
    return {
      calculation,
      numberOfCourts: dto.numberOfCourts,
      selectionMode: dto.selectionMode || VenueRentalSelectionMode.AUTO_ASSIGN,
      courtIds: dto.courtIds || [],
      segments: null,
    };
  }

  /** Books a schedule's courts: one row per court × time piece. */
  private async allocateSchedule(
    tx: Prisma.TransactionClient,
    target: {
      requestId: string;
      venueId: string;
      timezone: string;
      status?: VenueRentalAllocationStatus;
      expiresAt?: Date | null;
    },
    schedule: {
      startTime: Date;
      endTime: Date;
      numberOfCourts: number;
      selectionMode: VenueRentalSelectionMode;
      courtIds: string[];
      segments: Array<{
        startTime: string;
        endTime: string;
        courtIds: string[];
      }> | null;
    }
  ) {
    const pieces = schedule.segments?.map((segment) => ({
      startTime: new Date(segment.startTime),
      endTime: new Date(segment.endTime),
      numberOfCourts: segment.courtIds.length,
      selectionMode: VenueRentalSelectionMode.SELECT_COURTS,
      courtIds: segment.courtIds,
    })) ?? [schedule];
    let allocated: string[] = [];
    for (const piece of pieces) {
      const courtIds = await this.courts.allocateRequest(tx, {
        ...target,
        startTime: piece.startTime,
        endTime: piece.endTime,
        numberOfCourts: piece.numberOfCourts,
        selectionMode: piece.selectionMode,
        courtIds: piece.courtIds,
      });
      allocated = [...new Set([...allocated, ...courtIds])];
    }
    return allocated;
  }

  async availability(venueId: string, startValue: string, endValue: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        id: true,
        numberOfCourts: true,
        rentalEnabled: true,
        timezone: true,
      },
    });
    if (!venue) throw new NotFoundException('Venue not found');
    const { start: startTime, end: endTime } = this.pricing.validateTimeRange(
      startValue,
      endValue,
      venue.timezone,
      true
    );

    const rentals = await this.prisma.venueRentalRequest.findMany({
      where: {
        venueId,
        status: {
          in: [VenueRentalStatus.AWAITING_DEPOSIT, VenueRentalStatus.CONFIRMED],
        },
        confirmedStartTime: { lt: endTime },
        confirmedEndTime: { gt: startTime },
      },
      select: {
        confirmedStartTime: true,
        confirmedEndTime: true,
        confirmedNumberOfCourts: true,
      },
    });
    const reservedCourts = this.maxConcurrentCourts(
      rentals,
      startTime,
      endTime
    );
    const capacity = venue.numberOfCourts || 0;
    return {
      venueId,
      rentalEnabled: venue.rentalEnabled,
      capacity,
      reservedCourts,
      availableCourts: Math.max(0, capacity - reservedCourts),
      startTime,
      endTime,
    };
  }

  async create(dto: CreateVenueRentalDto, requesterId: string) {
    const request = await this.prisma.$transaction(async (tx) => {
      const quote = await tx.venueRentalQuote.findUnique({
        where: { id: dto.quoteId },
        include: {
          venue: {
            select: { rentalEnabled: true, courtSelectionEnabled: true },
          },
        },
      });
      if (!quote || quote.requesterId !== requesterId)
        throw new NotFoundException('Rental quote not found');
      if (quote.consumedAt)
        throw this.conflict(
          'QUOTE_ALREADY_USED',
          'Rental quote has already been used'
        );
      if (quote.expiresAt <= new Date())
        throw this.conflict('QUOTE_EXPIRED', 'Rental quote has expired');
      if (!quote.venue.rentalEnabled)
        throw this.conflict('RENTAL_DISABLED', 'Online rental is disabled');

      if (dto.sessionId) {
        await this.assertSessionLink(
          tx,
          dto.sessionId,
          requesterId,
          quote.venueId,
          quote.startTime,
          quote.endTime
        );
      }

      const consumed = await tx.venueRentalQuote.updateMany({
        where: {
          id: quote.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (!consumed.count) {
        throw this.conflict(
          'QUOTE_ALREADY_USED',
          'Rental quote has already been used'
        );
      }
      const created = await tx.venueRentalRequest.create({
        data: {
          venueId: quote.venueId,
          requesterId,
          quoteId: quote.id,
          sessionId: dto.sessionId,
          contactName: dto.contactName.trim(),
          contactPhone: dto.contactPhone.trim(),
          notes: dto.notes?.trim() || null,
          selectionMode: quote.selectionMode,
          requestedCourtIds: quote.requestedCourtIds,
        },
      });
      if (quote.venue.courtSelectionEnabled) {
        // Hold the courts through review — at most a day, and never past
        // the start — instead of freeing them for a second requester.
        const until = new Date(
          Math.min(
            Date.now() + PENDING_HOLD_HOURS * 60 * 60 * 1000,
            quote.startTime.getTime()
          )
        );
        await this.courts.holdForRequest(tx, quote.id, created.id, until);
      }
      await tx.venueRentalEvent.create({
        data: {
          requestId: created.id,
          actorId: requesterId,
          type: VenueRentalEventType.CREATED,
          toStatus: VenueRentalStatus.PENDING,
        },
      });
      return created;
    });

    await this.notifyManagers(
      request.venueId,
      'Yêu cầu thuê sân mới',
      'Có một yêu cầu thuê sân mới cần xử lý.',
      request.id,
      `request:${request.id}:created`,
      'rental_request_created'
    );
    return this.getRequest(request.id);
  }

  async createManual(dto: CreateManualRentalDto, userId: string, role: string) {
    await this.access.assertManager(dto.venueId, userId, role);
    const venue = await this.prisma.venue.findUnique({
      where: { id: dto.venueId },
      select: {
        timezone: true,
        courtSelectionEnabled: true,
      },
    });
    if (!venue) throw new NotFoundException('Venue not found');
    if (dto.requesterId) {
      const requester = await this.prisma.user.findUnique({
        where: { id: dto.requesterId },
        select: { id: true },
      });
      if (!requester) throw new NotFoundException('Requester not found');
    }
    const priced = await this.priceSchedule(
      dto.venueId,
      dto,
      venue.courtSelectionEnabled
    );
    const { calculation, selectionMode, numberOfCourts, segments } = priced;
    const request = await this.prisma.$transaction(async (tx) => {
      const acceptedAt = new Date();
      const snapshot = await this.payments.buildSnapshot(
        tx,
        dto.venueId,
        calculation.totalAmount,
        calculation.startTime,
        acceptedAt,
        true
      );
      const created = await tx.venueRentalRequest.create({
        data: {
          venueId: dto.venueId,
          requesterId: dto.requesterId,
          createdByUserId: userId,
          source: VenueRentalSource.MANUAL,
          status: VenueRentalStatus.CONFIRMED,
          contactName: dto.contactName.trim(),
          contactPhone: dto.contactPhone.trim(),
          notes: dto.notes?.trim() || null,
          selectionMode,
          requestedCourtIds: priced.courtIds,
          confirmedStartTime: calculation.startTime,
          confirmedEndTime: calculation.endTime,
          confirmedNumberOfCourts: numberOfCourts,
          confirmedCustomerType: dto.customerType,
          confirmedAmount: calculation.totalAmount,
          confirmedCurrency: calculation.currency,
          confirmedBreakdown: {
            version: calculation.version,
            items: calculation.breakdown,
          } as unknown as Prisma.InputJsonValue,
          ...(segments
            ? {
                confirmedSegments: segments as unknown as Prisma.InputJsonValue,
              }
            : {}),
          confirmedAt: new Date(),
          reviewedByUserId: userId,
          ...snapshot,
        },
      });
      let allocatedCourtIds: string[] = [];
      if (venue.courtSelectionEnabled) {
        allocatedCourtIds = await this.allocateSchedule(
          tx,
          {
            requestId: created.id,
            venueId: dto.venueId,
            timezone: venue.timezone,
          },
          {
            startTime: calculation.startTime,
            endTime: calculation.endTime,
            numberOfCourts,
            selectionMode,
            courtIds: priced.courtIds,
            segments,
          }
        );
        await tx.venueRentalRequest.update({
          where: { id: created.id },
          data: { requestedCourtIds: allocatedCourtIds },
        });
      } else {
        await this.lockCapacity(tx, dto.venueId, calculation.startTime);
        await this.assertCapacity(
          tx,
          dto.venueId,
          calculation.startTime,
          calculation.endTime,
          numberOfCourts
        );
      }
      await this.createEvent(
        tx,
        created.id,
        userId,
        VenueRentalEventType.MANUAL_CREATED,
        null,
        VenueRentalStatus.CONFIRMED,
        allocatedCourtIds.length ? { courtIds: allocatedCourtIds } : undefined
      );
      return created;
    });
    await this.notifyRequester(
      dto.requesterId || null,
      'Lịch thuê sân đã được tạo',
      'Quản lý sân đã tạo và xác nhận lịch thuê cho bạn.',
      request.id,
      `request:${request.id}:manual-created`,
      'rental_manual_created'
    );
    return this.getRequest(request.id);
  }

  async reallocateCourts(
    id: string,
    dto: ReallocateRentalCourtsDto,
    userId: string,
    role: string
  ) {
    const source = await this.getRequest(id);
    await this.access.assertManager(source.venueId, userId, role);
    if (readRentalSegments(source.confirmedSegments)) {
      throw this.conflict(
        'MULTI_SEGMENT_UNSUPPORTED',
        'Courts of a multi-segment rental cannot be reallocated'
      );
    }
    if (
      source.status !== VenueRentalStatus.CONFIRMED ||
      !source.confirmedStartTime ||
      !source.confirmedEndTime ||
      !source.confirmedNumberOfCourts ||
      !source.venue.courtSelectionEnabled
    ) {
      this.invalidTransition();
    }
    const previousCourtIds = source.courtAllocations.map(
      (allocation) => allocation.courtId
    );
    const courtIds = await this.prisma.$transaction(async (tx) => {
      await this.courts.lockVenueDay(
        tx,
        source.venueId,
        source.confirmedStartTime!,
        source.venue.timezone
      );
      await this.courts.releaseRequestAllocations(tx, id);
      const allocated = await this.courts.allocateRequest(tx, {
        requestId: id,
        venueId: source.venueId,
        startTime: source.confirmedStartTime!,
        endTime: source.confirmedEndTime!,
        numberOfCourts: source.confirmedNumberOfCourts!,
        selectionMode: VenueRentalSelectionMode.SELECT_COURTS,
        courtIds: dto.courtIds,
        timezone: source.venue.timezone,
      });
      await tx.venueRentalRequest.update({
        where: { id },
        data: {
          selectionMode: VenueRentalSelectionMode.SELECT_COURTS,
          requestedCourtIds: allocated,
        },
      });
      await this.createEvent(
        tx,
        id,
        userId,
        VenueRentalEventType.COURTS_REALLOCATED,
        VenueRentalStatus.CONFIRMED,
        VenueRentalStatus.CONFIRMED,
        { previousCourtIds, courtIds: allocated }
      );
      return allocated;
    });
    return { courtIds, rental: await this.getRequest(id) };
  }

  findMine(userId: string, query: QueryVenueRentalsDto) {
    return this.findPage(
      { requesterId: userId, ...this.queryWhere(query) },
      query
    );
  }

  async findManaged(userId: string, role: string, query: QueryVenueRentalsDto) {
    const venueIds =
      role === Role.ADMIN
        ? undefined
        : (
            await this.prisma.venueManager.findMany({
              where: { userId },
              select: { venueId: true },
            })
          ).map((item) => item.venueId);
    if (venueIds && venueIds.length === 0) return this.emptyPage(query);
    if (query.venueId && venueIds && !venueIds.includes(query.venueId)) {
      throw new ForbiddenException('Venue manager access required');
    }
    return this.findPage(
      {
        ...this.queryWhere(query),
        ...(venueIds ? { venueId: query.venueId || { in: venueIds } } : {}),
      },
      query
    );
  }

  /**
   * Rentals waiting on the manager (approval, payment review, refund,
   * deposit about to lapse, overdue balance), each with its reasons — one
   * call for the app's "Cần xử lý" inbox and badges.
   */
  async findAttention(userId: string, role: string, venueId?: string) {
    const venueIds =
      role === Role.ADMIN
        ? undefined
        : (
            await this.prisma.venueManager.findMany({
              where: { userId },
              select: { venueId: true },
            })
          ).map((item) => item.venueId);
    if (venueIds && venueIds.length === 0) return { items: [], count: 0 };
    if (venueId && venueIds && !venueIds.includes(venueId)) {
      throw new ForbiddenException('Venue manager access required');
    }
    const now = new Date();
    const candidates = await this.prisma.venueRentalRequest.findMany({
      where: {
        ...(venueIds ? { venueId: venueId || { in: venueIds } } : {}),
        ...(venueId && !venueIds ? { venueId } : {}),
        OR: [
          { status: VenueRentalStatus.PENDING },
          {
            transactions: {
              some: { status: VenueRentalTransactionStatus.SUBMITTED },
            },
          },
          {
            transactions: {
              some: {
                purpose: VenueRentalTransactionPurpose.REFUND,
                status: VenueRentalTransactionStatus.PENDING,
              },
            },
          },
          {
            status: VenueRentalStatus.AWAITING_DEPOSIT,
            depositDueAt: {
              gt: now,
              lte: new Date(now.getTime() + DEPOSIT_DUE_SOON_MS),
            },
          },
          {
            status: VenueRentalStatus.CONFIRMED,
            balanceAmount: { gt: 0 },
            balanceDueAt: { lt: now },
          },
        ],
      },
      include: {
        ...RENTAL_INCLUDE,
        transactions: {
          select: {
            purpose: true,
            direction: true,
            status: true,
            amount: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    const items = candidates
      .map(({ transactions, ...rental }) => ({
        reasons: rentalAttentionReasons({ ...rental, transactions }, now),
        rental,
      }))
      .filter((item) => item.reasons.length > 0);
    return { items, count: items.length };
  }

  async findOne(id: string, userId: string, role: string) {
    const request = await this.getRequest(id);
    if (request.requesterId !== userId && role !== Role.ADMIN) {
      await this.access.assertManager(request.venueId, userId, role);
    }
    return request;
  }

  async approve(id: string, userId: string, role: string) {
    const source = await this.getRequest(id);
    await this.access.assertManager(source.venueId, userId, role);
    if (source.status !== VenueRentalStatus.PENDING) this.invalidTransition();
    const quote = source.quote;
    if (!quote) throw new BadRequestException('Online request has no quote');
    if (quote.startTime <= new Date())
      throw new BadRequestException('Rental startTime has passed');

    await this.prisma.$transaction(async (tx) => {
      const acceptedAt = new Date();
      const snapshot = await this.payments.buildSnapshot(
        tx,
        source.venueId,
        quote.totalAmount,
        quote.startTime,
        acceptedAt
      );
      const targetStatus = snapshot.depositAmount
        ? VenueRentalStatus.AWAITING_DEPOSIT
        : VenueRentalStatus.CONFIRMED;
      let allocatedCourtIds: string[] = [];
      // The review hold becomes the real allocation below.
      await this.courts.releaseRequestAllocations(tx, id);
      const segments = readRentalSegments(quote.segments);
      const allocationStatus = snapshot.depositAmount
        ? VenueRentalAllocationStatus.RESERVED
        : VenueRentalAllocationStatus.CONFIRMED;
      if (segments) {
        // The quote only priced segments on court-selection venues; book each
        // court × time piece as its own allocation rows.
        for (const segment of segments) {
          const courtIds = await this.courts.allocateRequest(tx, {
            requestId: id,
            venueId: source.venueId,
            startTime: new Date(segment.startTime),
            endTime: new Date(segment.endTime),
            numberOfCourts: segment.courtIds.length,
            selectionMode: VenueRentalSelectionMode.SELECT_COURTS,
            courtIds: segment.courtIds,
            timezone: source.venue.timezone,
            status: allocationStatus,
            expiresAt: snapshot.depositDueAt,
          });
          allocatedCourtIds = [...new Set([...allocatedCourtIds, ...courtIds])];
        }
      } else if (source.venue.courtSelectionEnabled) {
        allocatedCourtIds = await this.courts.allocateRequest(tx, {
          requestId: id,
          venueId: source.venueId,
          startTime: quote.startTime,
          endTime: quote.endTime,
          numberOfCourts: quote.numberOfCourts,
          selectionMode: source.selectionMode,
          courtIds: source.requestedCourtIds,
          timezone: source.venue.timezone,
          status: allocationStatus,
          expiresAt: snapshot.depositDueAt,
        });
      } else {
        await this.lockCapacity(tx, source.venueId, quote.startTime);
        await this.assertCapacity(
          tx,
          source.venueId,
          quote.startTime,
          quote.endTime,
          quote.numberOfCourts
        );
      }
      const updated = await tx.venueRentalRequest.updateMany({
        where: { id, status: VenueRentalStatus.PENDING },
        data: {
          status: targetStatus,
          reviewedByUserId: userId,
          confirmedStartTime: quote.startTime,
          confirmedEndTime: quote.endTime,
          confirmedNumberOfCourts: quote.numberOfCourts,
          confirmedCustomerType: quote.customerType,
          confirmedAmount: quote.totalAmount,
          confirmedCurrency: quote.currency,
          confirmedBreakdown: quote.breakdown as Prisma.InputJsonValue,
          ...(segments
            ? { confirmedSegments: quote.segments as Prisma.InputJsonValue }
            : {}),
          requestedCourtIds: allocatedCourtIds.length
            ? allocatedCourtIds
            : source.requestedCourtIds,
          confirmedAt:
            targetStatus === VenueRentalStatus.CONFIRMED ? acceptedAt : null,
          ...snapshot,
        },
      });
      if (!updated.count) this.invalidTransition();
      await this.createEvent(
        tx,
        id,
        userId,
        VenueRentalEventType.APPROVED,
        VenueRentalStatus.PENDING,
        targetStatus
      );
      if (allocatedCourtIds.length) {
        await this.createEvent(
          tx,
          id,
          userId,
          VenueRentalEventType.COURTS_ALLOCATED,
          targetStatus,
          targetStatus,
          { courtIds: allocatedCourtIds }
        );
      }
    });
    const approvedRequest = await this.getRequest(id);
    await this.notifyRequester(
      source.requesterId,
      approvedRequest.status === VenueRentalStatus.AWAITING_DEPOSIT
        ? 'Yêu cầu thuê sân đang chờ đặt cọc'
        : 'Yêu cầu thuê sân đã được xác nhận',
      approvedRequest.status === VenueRentalStatus.AWAITING_DEPOSIT
        ? 'Vui lòng hoàn tất đặt cọc trước thời hạn để giữ sân.'
        : 'Sân đã xác nhận lịch thuê của bạn.',
      id,
      `request:${id}:approved`,
      approvedRequest.status === VenueRentalStatus.AWAITING_DEPOSIT
        ? 'rental_awaiting_deposit'
        : 'rental_confirmed'
    );
    return approvedRequest;
  }

  async reject(
    id: string,
    reason: string | undefined,
    userId: string,
    role: string
  ) {
    if (!reason?.trim())
      throw new BadRequestException('Rejection reason is required');
    const source = await this.getRequest(id);
    await this.access.assertManager(source.venueId, userId, role);
    if (
      source.status !== VenueRentalStatus.PENDING &&
      source.status !== VenueRentalStatus.COUNTER_OFFERED
    )
      this.invalidTransition();
    await this.prisma.$transaction(async (tx) => {
      await this.courts.releaseRequestAllocations(tx, id);
      await tx.venueRentalProposal.updateMany({
        where: { requestId: id, status: VenueRentalProposalStatus.PENDING },
        data: {
          status: VenueRentalProposalStatus.SUPERSEDED,
          respondedAt: new Date(),
        },
      });
      await tx.venueRentalRequest.update({
        where: { id },
        data: {
          status: VenueRentalStatus.REJECTED,
          rejectionReason: reason.trim(),
          reviewedByUserId: userId,
          rejectedAt: new Date(),
        },
      });
      await this.createEvent(
        tx,
        id,
        userId,
        VenueRentalEventType.REJECTED,
        source.status,
        VenueRentalStatus.REJECTED,
        { reason: reason.trim() }
      );
    });
    await this.notifyRequester(
      source.requesterId,
      'Yêu cầu thuê sân bị từ chối',
      reason.trim(),
      id,
      `request:${id}:rejected`,
      'rental_rejected',
      { reason: reason.trim() }
    );
    return this.getRequest(id);
  }

  async propose(
    id: string,
    dto: CreateRentalProposalDto,
    userId: string,
    role: string
  ) {
    const source = await this.getRequest(id);
    await this.access.assertManager(source.venueId, userId, role);
    if (
      source.status !== VenueRentalStatus.PENDING &&
      source.status !== VenueRentalStatus.COUNTER_OFFERED
    )
      this.invalidTransition();
    const priced = await this.priceSchedule(
      source.venueId,
      dto,
      source.venue.courtSelectionEnabled
    );
    const { calculation } = priced;
    const expiresAt = new Date(
      Math.min(
        Date.now() + 24 * 60 * 60 * 1000,
        calculation.startTime.getTime()
      )
    );
    const proposal = await this.prisma.$transaction(async (tx) => {
      await tx.venueRentalProposal.updateMany({
        where: { requestId: id, status: VenueRentalProposalStatus.PENDING },
        data: {
          status: VenueRentalProposalStatus.SUPERSEDED,
          respondedAt: new Date(),
        },
      });
      const created = await tx.venueRentalProposal.create({
        data: {
          requestId: id,
          proposedById: userId,
          startTime: calculation.startTime,
          endTime: calculation.endTime,
          numberOfCourts: priced.numberOfCourts,
          customerType: dto.customerType,
          currency: calculation.currency,
          totalAmount: calculation.totalAmount,
          priceBookId: calculation.priceBookId,
          breakdown: {
            version: calculation.version,
            items: calculation.breakdown,
          } as unknown as Prisma.InputJsonValue,
          selectionMode: priced.selectionMode,
          requestedCourtIds: priced.courtIds,
          ...(priced.segments
            ? {
                segments: priced.segments as unknown as Prisma.InputJsonValue,
              }
            : {}),
          expiresAt,
        },
      });
      await tx.venueRentalRequest.update({
        where: { id },
        data: {
          status: VenueRentalStatus.COUNTER_OFFERED,
          reviewedByUserId: userId,
        },
      });
      await this.createEvent(
        tx,
        id,
        userId,
        VenueRentalEventType.COUNTER_OFFERED,
        source.status,
        VenueRentalStatus.COUNTER_OFFERED,
        { proposalId: created.id }
      );
      return created;
    });
    await this.notifyRequester(
      source.requesterId,
      'Sân đề xuất lịch thuê mới',
      'Vui lòng xem và phản hồi đề xuất mới.',
      id,
      `proposal:${proposal.id}:created`,
      'rental_proposal_created'
    );
    return proposal;
  }

  async acceptProposal(id: string, proposalId: string, userId: string) {
    const source = await this.getRequest(id);
    if (source.requesterId !== userId)
      throw new ForbiddenException('Rental requester access required');
    const proposal = source.proposals.find((item) => item.id === proposalId);
    if (!proposal) throw new NotFoundException('Rental proposal not found');
    if (proposal.kind === VenueRentalProposalKind.RESCHEDULE) {
      return this.acceptReschedule(source, proposal, userId);
    }
    if (
      source.status !== VenueRentalStatus.COUNTER_OFFERED ||
      proposal.status !== VenueRentalProposalStatus.PENDING
    )
      this.invalidTransition();
    if (proposal.expiresAt <= new Date())
      throw this.conflict('PROPOSAL_EXPIRED', 'Rental proposal has expired');

    await this.prisma.$transaction(async (tx) => {
      const acceptedAt = new Date();
      const snapshot = await this.payments.buildSnapshot(
        tx,
        source.venueId,
        proposal.totalAmount,
        proposal.startTime,
        acceptedAt
      );
      const targetStatus = snapshot.depositAmount
        ? VenueRentalStatus.AWAITING_DEPOSIT
        : VenueRentalStatus.CONFIRMED;
      // The original request's review hold gives way to the proposal.
      await this.courts.releaseRequestAllocations(tx, id);
      const segments = readRentalSegments(proposal.segments);
      let allocatedCourtIds: string[] = [];
      if (source.venue.courtSelectionEnabled) {
        allocatedCourtIds = await this.allocateSchedule(
          tx,
          {
            requestId: id,
            venueId: source.venueId,
            timezone: source.venue.timezone,
            status: snapshot.depositAmount
              ? VenueRentalAllocationStatus.RESERVED
              : VenueRentalAllocationStatus.CONFIRMED,
            expiresAt: snapshot.depositDueAt,
          },
          {
            startTime: proposal.startTime,
            endTime: proposal.endTime,
            numberOfCourts: proposal.numberOfCourts,
            selectionMode: proposal.selectionMode,
            courtIds: proposal.requestedCourtIds,
            segments,
          }
        );
      } else {
        await this.lockCapacity(tx, source.venueId, proposal.startTime);
        await this.assertCapacity(
          tx,
          source.venueId,
          proposal.startTime,
          proposal.endTime,
          proposal.numberOfCourts
        );
      }
      const changed = await tx.venueRentalProposal.updateMany({
        where: { id: proposalId, status: VenueRentalProposalStatus.PENDING },
        data: {
          status: VenueRentalProposalStatus.ACCEPTED,
          respondedAt: new Date(),
        },
      });
      if (!changed.count) this.invalidTransition();
      await tx.venueRentalRequest.update({
        where: { id },
        data: {
          status: targetStatus,
          confirmedStartTime: proposal.startTime,
          confirmedEndTime: proposal.endTime,
          confirmedNumberOfCourts: proposal.numberOfCourts,
          confirmedCustomerType: proposal.customerType,
          confirmedAmount: proposal.totalAmount,
          confirmedCurrency: proposal.currency,
          confirmedBreakdown: proposal.breakdown as Prisma.InputJsonValue,
          ...(segments
            ? { confirmedSegments: proposal.segments as Prisma.InputJsonValue }
            : {}),
          selectionMode: proposal.selectionMode,
          requestedCourtIds: allocatedCourtIds.length
            ? allocatedCourtIds
            : proposal.requestedCourtIds,
          confirmedAt:
            targetStatus === VenueRentalStatus.CONFIRMED ? acceptedAt : null,
          ...snapshot,
        },
      });
      await this.createEvent(
        tx,
        id,
        userId,
        VenueRentalEventType.PROPOSAL_ACCEPTED,
        VenueRentalStatus.COUNTER_OFFERED,
        targetStatus,
        { proposalId }
      );
      if (allocatedCourtIds.length) {
        await this.createEvent(
          tx,
          id,
          userId,
          VenueRentalEventType.COURTS_ALLOCATED,
          targetStatus,
          targetStatus,
          { courtIds: allocatedCourtIds }
        );
      }
    });
    await this.notifyManagers(
      source.venueId,
      'Đề xuất thuê sân đã được chấp nhận',
      'Người thuê đã chấp nhận lịch đề xuất.',
      id,
      `proposal:${proposalId}:accepted`,
      'rental_proposal_accepted'
    );
    const acceptedRequest = await this.getRequest(id);
    if (acceptedRequest.status === VenueRentalStatus.AWAITING_DEPOSIT) {
      await this.notifyRequester(
        source.requesterId,
        'Lịch thuê sân đang chờ đặt cọc',
        'Vui lòng hoàn tất đặt cọc trước thời hạn để giữ sân.',
        id,
        `proposal:${proposalId}:awaiting-deposit`,
        'rental_proposal_awaiting_deposit'
      );
    }
    return acceptedRequest;
  }

  async declineProposal(id: string, proposalId: string, userId: string) {
    const source = await this.getRequest(id);
    if (source.requesterId !== userId)
      throw new ForbiddenException('Rental requester access required');
    const proposal = source.proposals.find((item) => item.id === proposalId);
    if (!proposal) throw new NotFoundException('Rental proposal not found');
    if (proposal.kind === VenueRentalProposalKind.RESCHEDULE) {
      return this.declineReschedule(source, proposal, userId);
    }
    if (
      source.status !== VenueRentalStatus.COUNTER_OFFERED ||
      proposal.status !== VenueRentalProposalStatus.PENDING
    )
      this.invalidTransition();
    await this.prisma.$transaction(async (tx) => {
      await tx.venueRentalProposal.update({
        where: { id: proposalId },
        data: {
          status: VenueRentalProposalStatus.DECLINED,
          respondedAt: new Date(),
        },
      });
      await tx.venueRentalRequest.update({
        where: { id },
        data: { status: VenueRentalStatus.PENDING },
      });
      await this.createEvent(
        tx,
        id,
        userId,
        VenueRentalEventType.PROPOSAL_DECLINED,
        VenueRentalStatus.COUNTER_OFFERED,
        VenueRentalStatus.PENDING,
        { proposalId }
      );
    });
    await this.notifyManagers(
      source.venueId,
      'Đề xuất thuê sân bị từ chối',
      'Người thuê đã từ chối lịch đề xuất.',
      id,
      `proposal:${proposalId}:declined`,
      'rental_proposal_declined'
    );
    return this.getRequest(id);
  }

  /**
   * Moves a confirmed booking. With a customer on the app it becomes a
   * proposal they answer, and the booking keeps its slot until then. A walk-in
   * has nobody to ask, so the manager's word settles it.
   */
  async reschedule(
    id: string,
    dto: CreateRentalProposalDto,
    userId: string,
    role: string
  ) {
    const source = await this.getRequest(id);
    await this.access.assertManager(source.venueId, userId, role);
    const currentStart = source.confirmedStartTime;
    if (source.status !== VenueRentalStatus.CONFIRMED || !currentStart) {
      this.invalidTransition();
    }
    if (currentStart <= new Date()) {
      throw this.conflict('RENTAL_STARTED', 'A started rental cannot be moved');
    }
    const priced = await this.priceSchedule(
      source.venueId,
      dto,
      source.venue.courtSelectionEnabled
    );
    const { calculation } = priced;
    const schedule = {
      startTime: calculation.startTime,
      endTime: calculation.endTime,
      numberOfCourts: priced.numberOfCourts,
      selectionMode: priced.selectionMode,
      courtIds: priced.courtIds,
      segments: priced.segments,
      customerType: dto.customerType,
      currency: calculation.currency,
      totalAmount: calculation.totalAmount,
      breakdown: {
        version: calculation.version,
        items: calculation.breakdown,
      } as unknown as Prisma.InputJsonValue,
    };
    if (!source.requesterId) {
      const refund = await this.prisma.$transaction((tx) =>
        this.applySchedule(tx, source, schedule, userId)
      );
      if (refund) await this.notifyRefundRequired(source.venueId, id);
      return this.getRequest(id);
    }
    const expiresAt = new Date(
      Math.min(
        Date.now() + 24 * 60 * 60 * 1000,
        currentStart.getTime(),
        calculation.startTime.getTime()
      )
    );
    const proposal = await this.prisma.$transaction(async (tx) => {
      await this.supersedeProposals(tx, id);
      const courtIds = source.venue.courtSelectionEnabled
        ? await this.holdSchedule(tx, source, schedule, expiresAt)
        : schedule.courtIds;
      const created = await tx.venueRentalProposal.create({
        data: {
          requestId: id,
          proposedById: userId,
          kind: VenueRentalProposalKind.RESCHEDULE,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          numberOfCourts: schedule.numberOfCourts,
          customerType: schedule.customerType,
          currency: schedule.currency,
          totalAmount: schedule.totalAmount,
          priceBookId: calculation.priceBookId,
          breakdown: schedule.breakdown,
          selectionMode: source.venue.courtSelectionEnabled
            ? VenueRentalSelectionMode.SELECT_COURTS
            : schedule.selectionMode,
          requestedCourtIds: courtIds,
          ...(schedule.segments
            ? {
                segments: schedule.segments as unknown as Prisma.InputJsonValue,
              }
            : {}),
          expiresAt,
        },
      });
      await this.createEvent(
        tx,
        id,
        userId,
        VenueRentalEventType.RESCHEDULE_PROPOSED,
        VenueRentalStatus.CONFIRMED,
        VenueRentalStatus.CONFIRMED,
        { proposalId: created.id }
      );
      return created;
    });
    await this.notifyRequester(
      source.requesterId,
      'Sân đề xuất dời lịch',
      'Vui lòng xem và phản hồi lịch mới. Lịch cũ được giữ tới khi bạn trả lời.',
      id,
      `proposal:${proposal.id}:reschedule`,
      'rental_reschedule_proposed'
    );
    return this.getRequest(id);
  }

  /** Takes back a move the customer has not answered. */
  async withdrawReschedule(id: string, userId: string, role: string) {
    const source = await this.getRequest(id);
    await this.access.assertManager(source.venueId, userId, role);
    const pending = source.proposals.find(
      (item) =>
        item.kind === VenueRentalProposalKind.RESCHEDULE &&
        item.status === VenueRentalProposalStatus.PENDING
    );
    if (!pending) this.invalidTransition();
    await this.prisma.$transaction((tx) => this.supersedeProposals(tx, id));
    await this.notifyRequester(
      source.requesterId,
      'Sân đã rút đề xuất dời lịch',
      'Lịch của bạn giữ nguyên như cũ.',
      id,
      `proposal:${pending.id}:reschedule-withdrawn`,
      'rental_reschedule_withdrawn'
    );
    return this.getRequest(id);
  }

  /** Ends any open proposal and the holds a pending move took. */
  private async supersedeProposals(tx: Prisma.TransactionClient, id: string) {
    await tx.venueRentalProposal.updateMany({
      where: { requestId: id, status: VenueRentalProposalStatus.PENDING },
      data: {
        status: VenueRentalProposalStatus.SUPERSEDED,
        respondedAt: new Date(),
      },
    });
    await this.courts.releaseRequestHolds(tx, id);
  }

  private async holdSchedule(
    tx: Prisma.TransactionClient,
    source: RentalWithVenue,
    schedule: {
      startTime: Date;
      endTime: Date;
      numberOfCourts: number;
      selectionMode: VenueRentalSelectionMode;
      courtIds: string[];
      segments: Array<{
        startTime: string;
        endTime: string;
        courtIds: string[];
      }> | null;
    },
    expiresAt: Date
  ) {
    const pieces = schedule.segments?.map((segment) => ({
      startTime: new Date(segment.startTime),
      endTime: new Date(segment.endTime),
      numberOfCourts: segment.courtIds.length,
      selectionMode: VenueRentalSelectionMode.SELECT_COURTS,
      courtIds: segment.courtIds,
    })) ?? [schedule];
    let held: string[] = [];
    for (const piece of pieces) {
      const courtIds = await this.courts.holdForReschedule(tx, {
        requestId: source.id,
        venueId: source.venueId,
        startTime: piece.startTime,
        endTime: piece.endTime,
        numberOfCourts: piece.numberOfCourts,
        selectionMode: piece.selectionMode,
        courtIds: piece.courtIds,
        timezone: source.venue.timezone,
        expiresAt,
      });
      held = [...new Set([...held, ...courtIds])];
    }
    return held;
  }

  /** Swaps a confirmed booking onto [schedule]; returns any refund it owes. */
  private async applySchedule(
    tx: Prisma.TransactionClient,
    source: RentalWithVenue,
    schedule: {
      startTime: Date;
      endTime: Date;
      numberOfCourts: number;
      selectionMode: VenueRentalSelectionMode;
      courtIds: string[];
      segments: Array<{
        startTime: string;
        endTime: string;
        courtIds: string[];
      }> | null;
      customerType: VenueCustomerType;
      currency: string;
      totalAmount: number;
      breakdown: Prisma.InputJsonValue;
    },
    userId: string
  ) {
    await this.courts.releaseRequestAllocations(tx, source.id);
    let allocated: string[] = [];
    if (source.venue.courtSelectionEnabled) {
      allocated = await this.allocateSchedule(
        tx,
        {
          requestId: source.id,
          venueId: source.venueId,
          timezone: source.venue.timezone,
        },
        schedule
      );
    } else {
      await this.lockCapacity(tx, source.venueId, schedule.startTime);
      await this.assertCapacity(
        tx,
        source.venueId,
        schedule.startTime,
        schedule.endTime,
        schedule.numberOfCourts,
        source.id
      );
    }
    const settlement = await this.payments.settleReschedule(
      tx,
      source,
      schedule.totalAmount,
      schedule.startTime,
      userId
    );
    await tx.venueRentalRequest.update({
      where: { id: source.id },
      data: {
        confirmedStartTime: schedule.startTime,
        confirmedEndTime: schedule.endTime,
        confirmedNumberOfCourts: schedule.numberOfCourts,
        confirmedCustomerType: schedule.customerType,
        confirmedAmount: schedule.totalAmount,
        confirmedCurrency: schedule.currency,
        confirmedBreakdown: schedule.breakdown,
        confirmedSegments: schedule.segments
          ? (schedule.segments as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
        selectionMode: schedule.selectionMode,
        requestedCourtIds: allocated.length ? allocated : schedule.courtIds,
        balanceOverdueNotifiedAt: null,
        ...settlement.money,
      },
    });
    await this.createEvent(
      tx,
      source.id,
      userId,
      VenueRentalEventType.RESCHEDULED,
      VenueRentalStatus.CONFIRMED,
      VenueRentalStatus.CONFIRMED,
      { from: source.confirmedStartTime?.toISOString() ?? null }
    );
    return settlement.refund;
  }

  private async acceptReschedule(
    source: RentalWithVenue,
    proposal: RentalWithVenue['proposals'][number],
    userId: string
  ) {
    if (
      source.status !== VenueRentalStatus.CONFIRMED ||
      proposal.status !== VenueRentalProposalStatus.PENDING ||
      proposal.expiresAt <= new Date()
    ) {
      this.invalidTransition();
    }
    const refund = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.venueRentalProposal.updateMany({
        where: { id: proposal.id, status: VenueRentalProposalStatus.PENDING },
        data: {
          status: VenueRentalProposalStatus.ACCEPTED,
          respondedAt: new Date(),
        },
      });
      if (!changed.count) this.invalidTransition();
      return this.applySchedule(
        tx,
        source,
        {
          startTime: proposal.startTime,
          endTime: proposal.endTime,
          numberOfCourts: proposal.numberOfCourts,
          selectionMode: proposal.selectionMode,
          courtIds: proposal.requestedCourtIds,
          segments: readRentalSegments(proposal.segments),
          customerType: proposal.customerType,
          currency: proposal.currency,
          totalAmount: proposal.totalAmount,
          breakdown: proposal.breakdown as Prisma.InputJsonValue,
        },
        userId
      );
    });
    await this.notifyManagers(
      source.venueId,
      'Khách đã đồng ý dời lịch',
      'Lịch thuê sân đã được chuyển sang giờ mới.',
      source.id,
      `proposal:${proposal.id}:reschedule-accepted`,
      'rental_reschedule_accepted'
    );
    if (refund) await this.notifyRefundRequired(source.venueId, source.id);
    return this.getRequest(source.id);
  }

  private async declineReschedule(
    source: RentalWithVenue,
    proposal: RentalWithVenue['proposals'][number],
    userId: string
  ) {
    if (proposal.status !== VenueRentalProposalStatus.PENDING) {
      this.invalidTransition();
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.venueRentalProposal.update({
        where: { id: proposal.id },
        data: {
          status: VenueRentalProposalStatus.DECLINED,
          respondedAt: new Date(),
        },
      });
      await this.courts.releaseRequestHolds(tx, source.id);
      await this.createEvent(
        tx,
        source.id,
        userId,
        VenueRentalEventType.PROPOSAL_DECLINED,
        source.status,
        source.status,
        { proposalId: proposal.id }
      );
    });
    await this.notifyManagers(
      source.venueId,
      'Khách từ chối dời lịch',
      'Lịch thuê sân giữ nguyên như cũ.',
      source.id,
      `proposal:${proposal.id}:reschedule-declined`,
      'rental_reschedule_declined'
    );
    return this.getRequest(source.id);
  }

  private notifyRefundRequired(venueId: string, id: string) {
    return this.notifyManagers(
      venueId,
      'Có khoản hoàn tiền thuê sân cần xử lý',
      'Giá mới thấp hơn số tiền khách đã trả.',
      id,
      `request:${id}:refund-required:${Date.now()}`,
      'rental_refund_required'
    );
  }

  /** Records that the customer never came. Money and status stay as they are. */
  async markNoShow(id: string, userId: string, role: string) {
    const source = await this.getRequest(id);
    await this.access.assertManager(source.venueId, userId, role);
    if (
      source.status !== VenueRentalStatus.CONFIRMED &&
      source.status !== VenueRentalStatus.COMPLETED
    ) {
      this.invalidTransition();
    }
    if (!source.confirmedStartTime || source.confirmedStartTime > new Date()) {
      throw this.conflict(
        'RENTAL_NOT_STARTED',
        'A rental cannot be a no-show before it starts'
      );
    }
    return this.setNoShow(source, new Date(), userId);
  }

  async clearNoShow(id: string, userId: string, role: string) {
    const source = await this.getRequest(id);
    await this.access.assertManager(source.venueId, userId, role);
    return this.setNoShow(source, null, userId);
  }

  private async setNoShow(
    source: RentalWithVenue,
    at: Date | null,
    userId: string
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.venueRentalRequest.update({
        where: { id: source.id },
        data: { noShowAt: at, noShowMarkedById: at ? userId : null },
      });
      await this.createEvent(
        tx,
        source.id,
        userId,
        at
          ? VenueRentalEventType.NO_SHOW_MARKED
          : VenueRentalEventType.NO_SHOW_CLEARED,
        source.status,
        source.status
      );
    });
    return this.getRequest(source.id);
  }

  /** How this customer has behaved at this venue, for the manager's call. */
  async customerHistory(id: string, userId: string, role: string) {
    const source = await this.getRequest(id);
    await this.access.assertManager(source.venueId, userId, role);
    const customer = source.requesterId
      ? { requesterId: source.requesterId }
      : { contactPhone: source.contactPhone };
    const where = { venueId: source.venueId, ...customer };
    const [bookings, noShows] = await Promise.all([
      this.prisma.venueRentalRequest.count({
        where: {
          ...where,
          status: {
            in: [VenueRentalStatus.CONFIRMED, VenueRentalStatus.COMPLETED],
          },
        },
      }),
      this.prisma.venueRentalRequest.count({
        where: { ...where, noShowAt: { not: null } },
      }),
    ]);
    return { bookings, noShows };
  }

  async cancel(
    id: string,
    reason: string | undefined,
    userId: string,
    role: string
  ) {
    const source = await this.getRequest(id);
    const isRequester = source.requesterId === userId;
    if (!isRequester)
      await this.access.assertManager(source.venueId, userId, role);
    if (
      source.status === VenueRentalStatus.REJECTED ||
      source.status === VenueRentalStatus.CANCELLED ||
      source.status === VenueRentalStatus.COMPLETED
    )
      this.invalidTransition();
    if (!isRequester && !reason?.trim())
      throw new BadRequestException(
        'Cancellation reason is required for venue managers'
      );
    const startTime = source.confirmedStartTime || source.quote?.startTime;
    if (!startTime)
      throw new BadRequestException('Rental does not have a scheduled time');
    if (startTime <= new Date())
      throw new BadRequestException('A started rental cannot be cancelled');
    const cancelledAt = new Date();
    const refund = await this.prisma.$transaction(async (tx) => {
      await tx.venueRentalProposal.updateMany({
        where: { requestId: id, status: VenueRentalProposalStatus.PENDING },
        data: {
          status: VenueRentalProposalStatus.SUPERSEDED,
          respondedAt: new Date(),
        },
      });
      await tx.venueRentalRequest.update({
        where: { id },
        data: {
          status: VenueRentalStatus.CANCELLED,
          cancelledByUserId: userId,
          cancellationReason: reason?.trim() || null,
          cancelledAt,
        },
      });
      // Confirmed bookings and pending-review holds alike.
      await this.courts.releaseRequestAllocations(tx, id);
      const pendingRefund = await this.payments.createRefundForCancellation(
        tx,
        source,
        isRequester,
        cancelledAt,
        userId
      );
      await this.createEvent(
        tx,
        id,
        userId,
        VenueRentalEventType.CANCELLED,
        source.status,
        VenueRentalStatus.CANCELLED,
        reason ? { reason: reason.trim() } : undefined
      );
      return pendingRefund;
    });
    if (refund) {
      await this.notifyManagers(
        source.venueId,
        'Có khoản hoàn tiền thuê sân cần xử lý',
        'Booking đã hủy có khoản hoàn tiền đang chờ xử lý.',
        id,
        `request:${id}:refund-required`,
        'rental_refund_required'
      );
    }
    if (isRequester) {
      await this.notifyManagers(
        source.venueId,
        'Yêu cầu thuê sân đã bị hủy',
        'Người thuê đã hủy yêu cầu.',
        id,
        `request:${id}:cancelled-by-requester`,
        'rental_cancelled_by_requester'
      );
    } else {
      await this.notifyRequester(
        source.requesterId,
        'Lịch thuê sân đã bị hủy',
        reason?.trim() || 'Quản lý sân đã hủy lịch thuê.',
        id,
        `request:${id}:cancelled-by-manager`,
        'rental_cancelled_by_manager',
        { reason: reason?.trim() || undefined }
      );
    }
    return this.getRequest(id);
  }

  async linkSession(id: string, sessionId: string, userId: string) {
    const source = await this.getRequest(id);
    if (source.requesterId !== userId)
      throw new ForbiddenException('Rental requester access required');
    if (
      source.status !== VenueRentalStatus.CONFIRMED ||
      !source.confirmedStartTime ||
      !source.confirmedEndTime
    )
      this.invalidTransition();
    await this.assertSessionLink(
      this.prisma,
      sessionId,
      userId,
      source.venueId,
      source.confirmedStartTime,
      source.confirmedEndTime
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.venueRentalRequest.update({
        where: { id },
        data: { sessionId },
      });
      await this.createEvent(
        tx,
        id,
        userId,
        VenueRentalEventType.SESSION_LINKED,
        source.status,
        source.status,
        { sessionId }
      );
    });
    return this.getRequest(id);
  }

  async processLifecycle() {
    const now = new Date();
    const releasedHolds = await this.courts.releaseExpiredHolds();
    const expired = await this.prisma.venueRentalProposal.findMany({
      where: {
        status: VenueRentalProposalStatus.PENDING,
        expiresAt: { lte: now },
      },
      include: {
        request: {
          select: { id: true, requesterId: true, status: true, venueId: true },
        },
      },
      take: 100,
    });
    for (const proposal of expired) {
      const changed = await this.prisma.$transaction(async (tx) => {
        const changed = await tx.venueRentalProposal.updateMany({
          where: { id: proposal.id, status: VenueRentalProposalStatus.PENDING },
          data: { status: VenueRentalProposalStatus.EXPIRED, respondedAt: now },
        });
        if (!changed.count) return false;
        if (proposal.request.status === VenueRentalStatus.COUNTER_OFFERED) {
          await tx.venueRentalRequest.update({
            where: { id: proposal.request.id },
            data: { status: VenueRentalStatus.PENDING },
          });
          await this.createEvent(
            tx,
            proposal.request.id,
            null,
            VenueRentalEventType.PROPOSAL_EXPIRED,
            VenueRentalStatus.COUNTER_OFFERED,
            VenueRentalStatus.PENDING,
            { proposalId: proposal.id }
          );
        }
        if (proposal.kind === VenueRentalProposalKind.RESCHEDULE) {
          await this.courts.releaseRequestHolds(tx, proposal.request.id);
        }
        return true;
      });
      if (!changed) continue;
      if (proposal.kind === VenueRentalProposalKind.RESCHEDULE) {
        await this.notifyManagers(
          proposal.request.venueId,
          'Đề xuất dời lịch đã hết hạn',
          'Khách chưa phản hồi nên lịch cũ được giữ nguyên.',
          proposal.request.id,
          `proposal:${proposal.id}:reschedule-expired`,
          'rental_reschedule_expired'
        );
      }
      await this.notifyRequester(
        proposal.request.requesterId,
        'Đề xuất thuê sân đã hết hạn',
        'Bạn có thể chờ quản lý gửi đề xuất mới.',
        proposal.request.id,
        `proposal:${proposal.id}:expired`,
        'rental_proposal_expired'
      );
    }

    const lapsed = await this.expireStaleRequests(now);
    const reminded = await this.remindUpcoming(now);

    const completed = await this.prisma.venueRentalRequest.findMany({
      where: {
        status: VenueRentalStatus.CONFIRMED,
        confirmedEndTime: { lte: now },
      },
      select: { id: true },
      take: 100,
    });
    for (const request of completed) {
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.venueRentalRequest.updateMany({
          where: { id: request.id, status: VenueRentalStatus.CONFIRMED },
          data: { status: VenueRentalStatus.COMPLETED, completedAt: now },
        });
        if (changed.count) {
          await this.createEvent(
            tx,
            request.id,
            null,
            VenueRentalEventType.COMPLETED,
            VenueRentalStatus.CONFIRMED,
            VenueRentalStatus.COMPLETED
          );
        }
      });
    }
    return {
      expired: expired.length,
      lapsed,
      reminded,
      completed: completed.length,
      releasedHolds: releasedHolds.count,
    };
  }

  async getRequest(id: string) {
    const request = await this.prisma.venueRentalRequest.findUnique({
      where: { id },
      include: RENTAL_INCLUDE,
    });
    if (!request) throw new NotFoundException('Venue rental request not found');
    return request;
  }

  private async findPage(
    where: Prisma.VenueRentalRequestWhereInput,
    query: QueryVenueRentalsDto
  ) {
    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.venueRentalRequest.findMany({
        where,
        include: RENTAL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.venueRentalRequest.count({ where }),
    ]);
    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  private emptyPage(query: QueryVenueRentalsDto) {
    return {
      data: [],
      pagination: {
        page: query.page,
        limit: query.limit,
        total: 0,
        totalPages: 0,
      },
    };
  }

  private queryWhere(
    query: QueryVenueRentalsDto
  ): Prisma.VenueRentalRequestWhereInput {
    return {
      ...(query.status ? { status: query.status } : {}),
      ...(query.venueId ? { venueId: query.venueId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            OR: [
              {
                quote: {
                  startTime: {
                    ...(query.dateFrom
                      ? { gte: new Date(query.dateFrom) }
                      : {}),
                    ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
                  },
                },
              },
              {
                confirmedStartTime: {
                  ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
                  ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
                },
              },
            ],
          }
        : {}),
    };
  }

  private async lockCapacity(
    tx: Prisma.TransactionClient,
    venueId: string,
    startTime: Date
  ) {
    const venue = await tx.venue.findUnique({
      where: { id: venueId },
      select: { timezone: true },
    });
    if (!venue) throw new NotFoundException('Venue not found');
    const key = `${venueId}:${this.pricing.getLocalDateKey(startTime, venue.timezone)}`;
    await tx.$queryRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))::text AS lock_result',
      key
    );
  }

  private async assertCapacity(
    tx: Prisma.TransactionClient,
    venueId: string,
    startTime: Date,
    endTime: Date,
    requestedCourts: number,
    ignoreRequestId?: string
  ) {
    const venue = await tx.venue.findUnique({
      where: { id: venueId },
      select: { numberOfCourts: true },
    });
    const rentals = await tx.venueRentalRequest.findMany({
      where: {
        venueId,
        ...(ignoreRequestId ? { id: { not: ignoreRequestId } } : {}),
        status: {
          in: [VenueRentalStatus.AWAITING_DEPOSIT, VenueRentalStatus.CONFIRMED],
        },
        confirmedStartTime: { lt: endTime },
        confirmedEndTime: { gt: startTime },
      },
      select: {
        confirmedStartTime: true,
        confirmedEndTime: true,
        confirmedNumberOfCourts: true,
      },
    });
    const maxReserved = this.maxConcurrentCourts(
      rentals,
      startTime,
      endTime,
      requestedCourts
    );
    if (!venue?.numberOfCourts || maxReserved > venue.numberOfCourts) {
      throw this.conflict(
        'CAPACITY_UNAVAILABLE',
        'Not enough courts are available for this time range'
      );
    }
  }

  private maxConcurrentCourts(
    rentals: Array<{
      confirmedStartTime: Date | null;
      confirmedEndTime: Date | null;
      confirmedNumberOfCourts: number | null;
    }>,
    rangeStart: Date,
    rangeEnd: Date,
    prospectiveCourts = 0
  ) {
    const points: Array<{ time: number; delta: number }> = [];
    for (const rental of rentals) {
      if (
        !rental.confirmedStartTime ||
        !rental.confirmedEndTime ||
        !rental.confirmedNumberOfCourts
      )
        continue;
      points.push({
        time: Math.max(
          rangeStart.getTime(),
          rental.confirmedStartTime.getTime()
        ),
        delta: rental.confirmedNumberOfCourts,
      });
      points.push({
        time: Math.min(rangeEnd.getTime(), rental.confirmedEndTime.getTime()),
        delta: -rental.confirmedNumberOfCourts,
      });
    }
    if (prospectiveCourts) {
      points.push({ time: rangeStart.getTime(), delta: prospectiveCourts });
      points.push({ time: rangeEnd.getTime(), delta: -prospectiveCourts });
    }
    points.sort((a, b) => a.time - b.time || a.delta - b.delta);
    let current = 0;
    let maximum = 0;
    for (const point of points) {
      current += point.delta;
      maximum = Math.max(maximum, current);
    }
    return maximum;
  }

  private async assertSessionLink(
    client: Prisma.TransactionClient | PrismaService,
    sessionId: string,
    userId: string,
    venueId: string,
    startTime: Date,
    endTime: Date
  ) {
    const session = await client.session.findUnique({
      where: { id: sessionId },
      select: { hostId: true, venueId: true, startTime: true, endTime: true },
    });
    if (!session || session.hostId !== userId)
      throw new ForbiddenException(
        'Only the session host can link this session'
      );
    if (
      session.venueId !== venueId ||
      !session.startTime ||
      !session.endTime ||
      session.startTime < startTime ||
      session.endTime > endTime
    ) {
      throw new BadRequestException(
        'Session must use the same venue and fit within the rental time'
      );
    }
  }

  private createEvent(
    tx: Prisma.TransactionClient,
    requestId: string,
    actorId: string | null,
    type: VenueRentalEventType,
    fromStatus: VenueRentalStatus | null,
    toStatus: VenueRentalStatus | null,
    payload?: Prisma.InputJsonObject
  ) {
    return tx.venueRentalEvent.create({
      data: {
        requestId,
        actorId,
        type,
        fromStatus,
        toStatus,
        payload: payload || Prisma.JsonNull,
      },
    });
  }

  private async notifyManagers(
    venueId: string,
    title: string,
    message: string,
    rentalRequestId: string,
    eventKey: string,
    action: string
  ) {
    if (areRentalNotificationsMuted()) return;
    const managers = await this.prisma.venueManager.findMany({
      where: { venueId },
      select: { userId: true },
    });
    await this.notifications.createManyForUsers(
      managers.map((manager) => manager.userId),
      NotificationType.VENUE_RENTAL,
      title,
      message,
      { rentalRequestId, venueId, manage: true, eventKey, action },
      eventKey
        ? {
            dedupeKey: (userId) => `venue-rental:${eventKey}:manager:${userId}`,
          }
        : undefined
    );
  }

  private notifyRequester(
    userId: string | null,
    title: string,
    message: string,
    rentalRequestId: string,
    eventKey: string,
    action: string,
    extra: Record<string, string | undefined> = {}
  ) {
    if (!userId || areRentalNotificationsMuted()) return Promise.resolve(null);
    return this.notifications.createForUser(
      userId,
      NotificationType.VENUE_RENTAL,
      title,
      message,
      { rentalRequestId, eventKey, action, ...extra },
      eventKey
        ? {
            dedupeKey: `venue-rental:${eventKey}:requester:${userId}`,
            conflictMode: 'ONCE',
          }
        : undefined
    );
  }

  private invalidTransition(): never {
    throw this.conflict(
      'INVALID_TRANSITION',
      'Rental request is not in a valid state for this action'
    );
  }

  private async assertNoOverlappingRequest(
    requesterId: string,
    venueId: string,
    startTime: Date,
    endTime: Date
  ) {
    const overlapping = await this.prisma.venueRentalRequest.findFirst({
      where: {
        venueId,
        requesterId,
        status: {
          in: [
            VenueRentalStatus.PENDING,
            VenueRentalStatus.COUNTER_OFFERED,
            VenueRentalStatus.AWAITING_DEPOSIT,
            VenueRentalStatus.CONFIRMED,
          ],
        },
        OR: [
          {
            confirmedStartTime: { lt: endTime },
            confirmedEndTime: { gt: startTime },
          },
          {
            confirmedStartTime: null,
            quote: { startTime: { lt: endTime }, endTime: { gt: startTime } },
          },
        ],
      },
      select: { id: true },
    });
    if (overlapping) {
      throw this.conflict(
        'DUPLICATE_RENTAL',
        'You already have an open rental request for these hours'
      );
    }
  }

  /**
   * Requests the venue never answered. Without this they sit in the manager's
   * inbox forever and the player is never told: past the review window, or
   * once the slot has started, whichever comes first. `updatedAt` restarts
   * the window after a proposal is declined or lapses, and COUNTER_OFFERED
   * is left to its proposal's own expiry, which drops it back to PENDING.
   */
  private async expireStaleRequests(now: Date) {
    const cutoff = new Date(
      now.getTime() - PENDING_HOLD_HOURS * 60 * 60 * 1000
    );
    const stale = await this.prisma.venueRentalRequest.findMany({
      where: {
        status: VenueRentalStatus.PENDING,
        OR: [
          { updatedAt: { lte: cutoff } },
          { quote: { startTime: { lte: now } } },
        ],
      },
      select: { id: true, venueId: true, requesterId: true, seriesId: true },
      take: 100,
    });
    let lapsed = 0;
    for (const request of stale) {
      const changed = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.venueRentalRequest.updateMany({
          where: { id: request.id, status: VenueRentalStatus.PENDING },
          data: {
            status: VenueRentalStatus.CANCELLED,
            cancellationReason: REQUEST_EXPIRED_REASON,
            cancelledAt: now,
          },
        });
        if (!updated.count) return false;
        await this.courts.releaseRequestAllocations(tx, request.id);
        await this.createEvent(
          tx,
          request.id,
          null,
          VenueRentalEventType.CANCELLED,
          VenueRentalStatus.PENDING,
          VenueRentalStatus.CANCELLED,
          { reason: REQUEST_EXPIRED_REASON }
        );
        return true;
      });
      if (!changed) continue;
      lapsed += 1;
      if (request.seriesId) {
        await this.prisma.venueRentalSeries.updateMany({
          where: {
            id: request.seriesId,
            status: VenueRentalSeriesStatus.PENDING,
            requests: { none: { status: VenueRentalStatus.PENDING } },
          },
          data: { status: VenueRentalSeriesStatus.CANCELLED },
        });
      }
      await this.notifyRequester(
        request.requesterId,
        'Yêu cầu thuê sân đã hết hạn',
        'Sân chưa phản hồi kịp nên yêu cầu đã được huỷ. Bạn có thể đặt lại.',
        request.id,
        `request:${request.id}:expired`,
        'rental_request_expired'
      );
      await this.notifyManagers(
        request.venueId,
        'Yêu cầu thuê sân đã tự huỷ',
        'Một yêu cầu thuê sân quá hạn phản hồi đã được huỷ.',
        request.id,
        `request:${request.id}:expired`,
        'rental_request_expired_manager'
      );
    }
    return lapsed;
  }

  /** One reminder per booking, shortly before it starts. */
  private async remindUpcoming(now: Date) {
    const from = new Date(now.getTime() + 115 * 60 * 1000);
    const to = new Date(now.getTime() + 120 * 60 * 1000);
    const upcoming = await this.prisma.venueRentalRequest.findMany({
      where: {
        status: VenueRentalStatus.CONFIRMED,
        confirmedStartTime: { gt: from, lte: to },
      },
      select: {
        id: true,
        requesterId: true,
        confirmedStartTime: true,
        venue: { select: { name: true, timezone: true } },
      },
      take: 200,
    });
    for (const request of upcoming) {
      const startTime = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: request.venue.timezone,
      }).format(request.confirmedStartTime!);
      await this.notifyRequester(
        request.requesterId,
        'Sắp đến giờ chơi',
        `Bạn có lịch thuê sân "${request.venue.name}" lúc ${startTime}.`,
        request.id,
        `request:${request.id}:starts-soon`,
        'rental_starts_soon',
        { venueName: request.venue.name, startTime }
      );
    }
    return upcoming.length;
  }

  private conflict(code: string, message: string) {
    return new ConflictException({ code, message });
  }
}
