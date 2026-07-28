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
  VenueRentalProposalStatus,
  VenueRentalSelectionMode,
  VenueRentalSource,
  VenueRentalStatus,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
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
import { VenuePricingService } from './venue-pricing.service';
import { VenueRentalPaymentsService } from './venue-rental-payments.service';

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

    const calculation = await this.pricing.calculate(venueId, {
      ...dto,
      requireFuture: true,
    });
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
      });
      return tx.venueRentalQuote.update({
        where: { id: quote.id },
        data: { requestedCourtIds: courtIds },
      });
    });
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
        await this.courts.releaseQuoteHold(tx, quote.id);
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
      request.id
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
    const calculation = await this.pricing.calculate(dto.venueId, {
      ...dto,
      requireFuture: true,
    });
    const selectionMode =
      dto.selectionMode || VenueRentalSelectionMode.AUTO_ASSIGN;
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
          requestedCourtIds: dto.courtIds || [],
          confirmedStartTime: calculation.startTime,
          confirmedEndTime: calculation.endTime,
          confirmedNumberOfCourts: dto.numberOfCourts,
          confirmedCustomerType: dto.customerType,
          confirmedAmount: calculation.totalAmount,
          confirmedCurrency: calculation.currency,
          confirmedBreakdown: {
            version: calculation.version,
            items: calculation.breakdown,
          } as unknown as Prisma.InputJsonValue,
          confirmedAt: new Date(),
          reviewedByUserId: userId,
          ...snapshot,
        },
      });
      let allocatedCourtIds: string[] = [];
      if (venue.courtSelectionEnabled) {
        allocatedCourtIds = await this.courts.allocateRequest(tx, {
          requestId: created.id,
          venueId: dto.venueId,
          startTime: calculation.startTime,
          endTime: calculation.endTime,
          numberOfCourts: dto.numberOfCourts,
          selectionMode,
          courtIds: dto.courtIds,
          timezone: venue.timezone,
        });
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
          dto.numberOfCourts
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
      request.id
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
      if (source.venue.courtSelectionEnabled) {
        allocatedCourtIds = await this.courts.allocateRequest(tx, {
          requestId: id,
          venueId: source.venueId,
          startTime: quote.startTime,
          endTime: quote.endTime,
          numberOfCourts: quote.numberOfCourts,
          selectionMode: source.selectionMode,
          courtIds: source.requestedCourtIds,
          timezone: source.venue.timezone,
          status: snapshot.depositAmount
            ? VenueRentalAllocationStatus.RESERVED
            : VenueRentalAllocationStatus.CONFIRMED,
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
      id
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
      id
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
    const calculation = await this.pricing.calculate(source.venueId, {
      ...dto,
      requireFuture: true,
    });
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
          numberOfCourts: dto.numberOfCourts,
          customerType: dto.customerType,
          currency: calculation.currency,
          totalAmount: calculation.totalAmount,
          priceBookId: calculation.priceBookId,
          breakdown: {
            version: calculation.version,
            items: calculation.breakdown,
          } as unknown as Prisma.InputJsonValue,
          selectionMode:
            dto.selectionMode || VenueRentalSelectionMode.AUTO_ASSIGN,
          requestedCourtIds: dto.courtIds || [],
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
      id
    );
    return proposal;
  }

  async acceptProposal(id: string, proposalId: string, userId: string) {
    const source = await this.getRequest(id);
    if (source.requesterId !== userId)
      throw new ForbiddenException('Rental requester access required');
    const proposal = source.proposals.find((item) => item.id === proposalId);
    if (!proposal) throw new NotFoundException('Rental proposal not found');
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
      let allocatedCourtIds: string[] = [];
      if (source.venue.courtSelectionEnabled) {
        allocatedCourtIds = await this.courts.allocateRequest(tx, {
          requestId: id,
          venueId: source.venueId,
          startTime: proposal.startTime,
          endTime: proposal.endTime,
          numberOfCourts: proposal.numberOfCourts,
          selectionMode: proposal.selectionMode,
          courtIds: proposal.requestedCourtIds,
          timezone: source.venue.timezone,
          status: snapshot.depositAmount
            ? VenueRentalAllocationStatus.RESERVED
            : VenueRentalAllocationStatus.CONFIRMED,
          expiresAt: snapshot.depositDueAt,
        });
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
      id
    );
    const acceptedRequest = await this.getRequest(id);
    if (acceptedRequest.status === VenueRentalStatus.AWAITING_DEPOSIT) {
      await this.notifyRequester(
        source.requesterId,
        'Lịch thuê sân đang chờ đặt cọc',
        'Vui lòng hoàn tất đặt cọc trước thời hạn để giữ sân.',
        id
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
      id
    );
    return this.getRequest(id);
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
      if (
        source.status === VenueRentalStatus.CONFIRMED ||
        source.status === VenueRentalStatus.AWAITING_DEPOSIT
      ) {
        await this.courts.releaseRequestAllocations(tx, id);
      }
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
        id
      );
    }
    if (isRequester) {
      await this.notifyManagers(
        source.venueId,
        'Yêu cầu thuê sân đã bị hủy',
        'Người thuê đã hủy yêu cầu.',
        id
      );
    } else {
      await this.notifyRequester(
        source.requesterId,
        'Lịch thuê sân đã bị hủy',
        reason?.trim() || 'Quản lý sân đã hủy lịch thuê.',
        id
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
        request: { select: { id: true, requesterId: true, status: true } },
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
        return true;
      });
      if (!changed) continue;
      await this.notifyRequester(
        proposal.request.requesterId,
        'Đề xuất thuê sân đã hết hạn',
        'Bạn có thể chờ quản lý gửi đề xuất mới.',
        proposal.request.id
      );
    }

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
      completed: completed.length,
      releasedHolds: releasedHolds.count,
    };
  }

  private async getRequest(id: string) {
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
    requestedCourts: number
  ) {
    const venue = await tx.venue.findUnique({
      where: { id: venueId },
      select: { numberOfCourts: true },
    });
    const rentals = await tx.venueRentalRequest.findMany({
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
    rentalRequestId: string
  ) {
    const managers = await this.prisma.venueManager.findMany({
      where: { venueId },
      select: { userId: true },
    });
    await Promise.allSettled(
      managers.map((manager) =>
        this.notifications.createForUser(
          manager.userId,
          NotificationType.VENUE_RENTAL,
          title,
          message,
          { rentalRequestId, venueId, manage: true }
        )
      )
    );
  }

  private notifyRequester(
    userId: string | null,
    title: string,
    message: string,
    rentalRequestId: string
  ) {
    if (!userId) return Promise.resolve(null);
    return this.notifications.createForUser(
      userId,
      NotificationType.VENUE_RENTAL,
      title,
      message,
      { rentalRequestId }
    );
  }

  private invalidTransition(): never {
    throw this.conflict(
      'INVALID_TRANSITION',
      'Rental request is not in a valid state for this action'
    );
  }

  private conflict(code: string, message: string) {
    return new ConflictException({ code, message });
  }
}
