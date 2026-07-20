import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  VenueCourtBlockType,
  VenueCourtStatus,
  VenueCustomerType,
  VenueRentalAllocationStatus,
  VenueRentalSelectionMode,
  VenueRentalStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VenueAccessService } from '../venues/venue-access.service';
import {
  CreateCourtBlockDto,
  CreateVenueCourtDto,
  OperatingPeriodDto,
  ReplaceOperatingPeriodsDto,
  UpdateVenueCourtDto,
} from './dto/venue-court.dto';
import { VenuePricingService } from './venue-pricing.service';

@Injectable()
export class VenueCourtsService {
  static readonly SLOT_MINUTES = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: VenueAccessService,
    private readonly pricing: VenuePricingService
  ) {}

  async listCourts(venueId: string) {
    await this.access.ensureVenue(venueId);
    return this.prisma.venueCourt.findMany({
      where: { venueId },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCourt(
    venueId: string,
    dto: CreateVenueCourtDto,
    userId: string,
    role: string
  ) {
    await this.access.assertOwner(venueId, userId, role);
    const court = await this.prisma.venueCourt.create({
      data: {
        venueId,
        name: dto.name.trim(),
        code: dto.code.trim(),
        status: dto.status,
        displayOrder: dto.displayOrder,
        notes: dto.notes?.trim() || null,
      },
    });
    await this.syncCapacity(venueId);
    return court;
  }

  async updateCourt(
    venueId: string,
    courtId: string,
    dto: UpdateVenueCourtDto,
    userId: string,
    role: string
  ) {
    await this.access.assertOwner(venueId, userId, role);
    await this.ensureCourt(venueId, courtId);
    const court = await this.prisma.venueCourt.update({
      where: { id: courtId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.displayOrder !== undefined
          ? { displayOrder: dto.displayOrder }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
      },
    });
    await this.syncCapacity(venueId);
    return court;
  }

  async removeCourt(
    venueId: string,
    courtId: string,
    userId: string,
    role: string
  ) {
    await this.access.assertOwner(venueId, userId, role);
    await this.ensureCourt(venueId, courtId);
    const futureAllocation =
      await this.prisma.venueRentalCourtAllocation.findFirst({
        where: {
          courtId,
          endTime: { gt: new Date() },
          status: {
            in: [
              VenueRentalAllocationStatus.HELD,
              VenueRentalAllocationStatus.CONFIRMED,
            ],
          },
        },
        select: { id: true },
      });
    const result = futureAllocation
      ? await this.prisma.venueCourt.update({
          where: { id: courtId },
          data: { status: VenueCourtStatus.INACTIVE },
        })
      : await this.prisma.venueCourt.delete({ where: { id: courtId } });
    await this.syncCapacity(venueId);
    return result;
  }

  async getOperatingPeriods(venueId: string) {
    const venue = await this.access.ensureVenue(venueId);
    const periods = await this.prisma.venueOperatingPeriod.findMany({
      where: { venueId },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
    });
    return { scheduleNeedsReview: venue.scheduleNeedsReview, periods };
  }

  async replaceOperatingPeriods(
    venueId: string,
    dto: ReplaceOperatingPeriodsDto,
    userId: string,
    role: string
  ) {
    await this.access.assertOwner(venueId, userId, role);
    this.validatePeriods(dto.periods);
    await this.prisma.$transaction(async (tx) => {
      await tx.venueOperatingPeriod.deleteMany({ where: { venueId } });
      await tx.venueOperatingPeriod.createMany({
        data: dto.periods.map((period) => ({ venueId, ...period })),
      });
      if (dto.markReviewed) {
        await tx.venue.update({
          where: { id: venueId },
          data: { scheduleNeedsReview: false },
        });
      }
    });
    return this.getOperatingPeriods(venueId);
  }

  async listBlocks(
    venueId: string,
    userId: string,
    role: string,
    startTime?: Date,
    endTime?: Date
  ) {
    await this.access.assertManager(venueId, userId, role);
    return this.prisma.venueCourtBlock.findMany({
      where: {
        venueId,
        ...(startTime && endTime
          ? { startTime: { lt: endTime }, endTime: { gt: startTime } }
          : {}),
      },
      include: {
        court: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async createBlock(
    venueId: string,
    dto: CreateCourtBlockDto,
    userId: string,
    role: string
  ) {
    await this.access.assertManager(venueId, userId, role);
    const venue = await this.access.ensureVenue(venueId);
    const { start, end } = this.pricing.validateTimeRange(
      dto.startTime,
      dto.endTime,
      venue.timezone
    );
    if (dto.courtId) await this.ensureCourt(venueId, dto.courtId);

    return this.prisma.$transaction(async (tx) => {
      await this.lockVenueDay(tx, venueId, start, venue.timezone);
      const conflicting = await tx.venueRentalCourtAllocation.findFirst({
        where: {
          venueId,
          ...(dto.courtId ? { courtId: dto.courtId } : {}),
          startTime: { lt: end },
          endTime: { gt: start },
          OR: [
            { status: VenueRentalAllocationStatus.CONFIRMED },
            {
              status: VenueRentalAllocationStatus.HELD,
              expiresAt: { gt: new Date() },
            },
          ],
        },
      });
      if (conflicting) this.courtUnavailable();
      return tx.venueCourtBlock.create({
        data: {
          venueId,
          courtId: dto.courtId,
          type: dto.type,
          startTime: start,
          endTime: end,
          reason: dto.reason?.trim() || null,
          createdByUserId: userId,
        },
      });
    });
  }

  async removeBlock(
    venueId: string,
    blockId: string,
    userId: string,
    role: string
  ) {
    await this.access.assertManager(venueId, userId, role);
    const block = await this.prisma.venueCourtBlock.findFirst({
      where: { id: blockId, venueId },
    });
    if (!block) throw new NotFoundException('Court block not found');
    return this.prisma.venueCourtBlock.delete({ where: { id: blockId } });
  }

  async publicSchedule(
    venueId: string,
    date: string,
    customerType: VenueCustomerType
  ) {
    const result = await this.buildSchedule(venueId, date, false);
    if (!result.courtSelectionEnabled) {
      throw new ConflictException({
        code: 'COURT_SELECTION_DISABLED',
        message: 'Visual court selection is not enabled for this venue',
      });
    }
    const prices = await this.getSlotPrices(
      venueId,
      result.timezone,
      date,
      result.slots,
      customerType
    );
    return {
      venueId,
      timezone: result.timezone,
      slotMinutes: VenueCourtsService.SLOT_MINUTES,
      operatingWindow: result.operatingWindow,
      courts: result.courts.map((court) => ({
        id: court.id,
        name: court.name,
        code: court.code,
        slots: court.slots.map((slot) => ({
          startMinute: slot.startMinute,
          endMinute: slot.endMinute,
          status: slot.status === 'AVAILABLE' ? 'AVAILABLE' : 'UNAVAILABLE',
        })),
      })),
      slots: result.slots.map((slot, index) => ({
        ...slot,
        pricePerHour: prices[index],
      })),
    };
  }

  async managerSchedule(
    venueId: string,
    date: string,
    userId: string,
    role: string
  ) {
    await this.access.assertManager(venueId, userId, role);
    return this.buildSchedule(venueId, date, true);
  }

  async holdForQuote(
    tx: Prisma.TransactionClient,
    input: {
      quoteId: string;
      venueId: string;
      startTime: Date;
      endTime: Date;
      numberOfCourts: number;
      selectionMode: VenueRentalSelectionMode;
      courtIds?: string[];
      expiresAt: Date;
      timezone: string;
    }
  ) {
    await this.lockVenueDay(tx, input.venueId, input.startTime, input.timezone);
    await this.releaseExpiredVenueHolds(tx, input.venueId);
    await this.assertOpenRange(
      tx,
      input.venueId,
      input.startTime,
      input.endTime,
      input.timezone
    );
    const courtIds = await this.resolveCourts(tx, input);
    await tx.venueRentalCourtAllocation.createMany({
      data: courtIds.map((courtId) => ({
        venueId: input.venueId,
        courtId,
        quoteId: input.quoteId,
        startTime: input.startTime,
        endTime: input.endTime,
        status: VenueRentalAllocationStatus.HELD,
        expiresAt: input.expiresAt,
      })),
    });
    return courtIds;
  }

  async allocateRequest(
    tx: Prisma.TransactionClient,
    input: {
      requestId: string;
      venueId: string;
      startTime: Date;
      endTime: Date;
      numberOfCourts: number;
      selectionMode: VenueRentalSelectionMode;
      courtIds?: string[];
      timezone: string;
    }
  ) {
    await this.lockVenueDay(tx, input.venueId, input.startTime, input.timezone);
    await this.releaseExpiredVenueHolds(tx, input.venueId);
    await this.assertOpenRange(
      tx,
      input.venueId,
      input.startTime,
      input.endTime,
      input.timezone
    );
    const courtIds = await this.resolveCourts(tx, input);
    await tx.venueRentalCourtAllocation.createMany({
      data: courtIds.map((courtId) => ({
        venueId: input.venueId,
        courtId,
        requestId: input.requestId,
        startTime: input.startTime,
        endTime: input.endTime,
        status: VenueRentalAllocationStatus.CONFIRMED,
      })),
    });
    return courtIds;
  }

  releaseQuoteHold(tx: Prisma.TransactionClient, quoteId: string) {
    return tx.venueRentalCourtAllocation.updateMany({
      where: { quoteId, status: VenueRentalAllocationStatus.HELD },
      data: {
        status: VenueRentalAllocationStatus.RELEASED,
        releasedAt: new Date(),
      },
    });
  }

  releaseRequestAllocations(tx: Prisma.TransactionClient, requestId: string) {
    return tx.venueRentalCourtAllocation.updateMany({
      where: {
        requestId,
        status: VenueRentalAllocationStatus.CONFIRMED,
      },
      data: {
        status: VenueRentalAllocationStatus.RELEASED,
        releasedAt: new Date(),
      },
    });
  }

  async releaseExpiredHolds() {
    return this.prisma.venueRentalCourtAllocation.updateMany({
      where: {
        status: VenueRentalAllocationStatus.HELD,
        expiresAt: { lte: new Date() },
      },
      data: {
        status: VenueRentalAllocationStatus.RELEASED,
        releasedAt: new Date(),
      },
    });
  }

  async validateVisualSelection(venueId: string) {
    const [venue, activeCourts, periods, unresolved] = await Promise.all([
      this.access.ensureVenue(venueId),
      this.prisma.venueCourt.count({
        where: { venueId, status: VenueCourtStatus.ACTIVE },
      }),
      this.prisma.venueOperatingPeriod.count({ where: { venueId } }),
      this.prisma.venueRentalRequest.count({
        where: {
          venueId,
          status: VenueRentalStatus.CONFIRMED,
          confirmedEndTime: { gt: new Date() },
          courtAllocations: {
            none: { status: VenueRentalAllocationStatus.CONFIRMED },
          },
        },
      }),
    ]);
    return {
      valid:
        activeCourts > 0 &&
        periods > 0 &&
        !venue.scheduleNeedsReview &&
        unresolved === 0,
      activeCourts,
      periods,
      scheduleNeedsReview: venue.scheduleNeedsReview,
      unresolvedBookings: unresolved,
    };
  }

  async lockVenueDay(
    tx: Prisma.TransactionClient,
    venueId: string,
    startTime: Date,
    timezone: string
  ) {
    const key = `${venueId}:${this.pricing.getLocalDateKey(startTime, timezone)}`;
    await tx.$queryRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))::text AS lock_result',
      key
    );
  }

  toUtc(date: string, minute: number, timezone: string) {
    const [year, month, day] = date.split('-').map(Number);
    const localTarget = Date.UTC(year, month - 1, day, 0, minute);
    let candidate = new Date(localTarget);
    for (let index = 0; index < 3; index += 1) {
      const parts = this.localParts(candidate, timezone);
      const rendered = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        0,
        parts.minute
      );
      candidate = new Date(candidate.getTime() + localTarget - rendered);
    }
    return candidate;
  }

  private async buildSchedule(venueId: string, date: string, manager: boolean) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        timezone: true,
        courtSelectionEnabled: true,
        courts: {
          where: { status: VenueCourtStatus.ACTIVE },
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });
    if (!venue) throw new NotFoundException('Venue not found');
    const dayOfWeek = this.dayOfWeek(date);
    const periods = await this.prisma.venueOperatingPeriod.findMany({
      where: { venueId, dayOfWeek },
      orderBy: { startMinute: 'asc' },
    });
    const firstMinute = periods.length
      ? Math.min(...periods.map((item) => item.startMinute))
      : 0;
    const lastMinute = periods.length
      ? Math.max(...periods.map((item) => item.endMinute))
      : 1440;
    const startTime = this.toUtc(date, firstMinute, venue.timezone);
    const endTime = this.toUtc(date, lastMinute, venue.timezone);
    const [blocks, allocations] = await Promise.all([
      this.prisma.venueCourtBlock.findMany({
        where: {
          venueId,
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      }),
      this.prisma.venueRentalCourtAllocation.findMany({
        where: {
          venueId,
          startTime: { lt: endTime },
          endTime: { gt: startTime },
          OR: [
            { status: VenueRentalAllocationStatus.CONFIRMED },
            {
              status: VenueRentalAllocationStatus.HELD,
              expiresAt: { gt: new Date() },
            },
          ],
        },
        include: {
          request: {
            select: {
              id: true,
              contactName: true,
              contactPhone: true,
              status: true,
            },
          },
        },
      }),
    ]);
    const pending = manager
      ? await this.prisma.venueRentalRequest.findMany({
          where: {
            venueId,
            status: {
              in: [
                VenueRentalStatus.PENDING,
                VenueRentalStatus.COUNTER_OFFERED,
              ],
            },
            quote: {
              startTime: { lt: endTime },
              endTime: { gt: startTime },
            },
          },
          include: { quote: true },
        })
      : [];

    const slots: Array<{ startMinute: number; endMinute: number }> = [];
    for (
      let minute = firstMinute;
      minute < lastMinute;
      minute += VenueCourtsService.SLOT_MINUTES
    ) {
      slots.push({
        startMinute: minute,
        endMinute: Math.min(
          minute + VenueCourtsService.SLOT_MINUTES,
          lastMinute
        ),
      });
    }

    const courts = venue.courts.map((court) => ({
      id: court.id,
      name: court.name,
      code: court.code,
      displayOrder: court.displayOrder,
      slots: slots.map((slot) => {
        const slotStart = this.toUtc(date, slot.startMinute, venue.timezone);
        const slotEnd = this.toUtc(date, slot.endMinute, venue.timezone);
        const isOpen = periods.some(
          (period) =>
            period.startMinute <= slot.startMinute &&
            period.endMinute >= slot.endMinute
        );
        const block = blocks.find(
          (item) =>
            (!item.courtId || item.courtId === court.id) &&
            item.startTime < slotEnd &&
            item.endTime > slotStart
        );
        const allocation = allocations.find(
          (item) =>
            item.courtId === court.id &&
            item.startTime < slotEnd &&
            item.endTime > slotStart
        );
        const pendingRequest = pending.find(
          (item) =>
            item.requestedCourtIds.includes(court.id) &&
            item.quote &&
            item.quote.startTime < slotEnd &&
            item.quote.endTime > slotStart
        );
        let status = 'AVAILABLE';
        if (!isOpen) status = 'CLOSED';
        else if (block)
          status =
            block.type === VenueCourtBlockType.MAINTENANCE
              ? 'MAINTENANCE'
              : 'CLOSED';
        else if (allocation)
          status =
            allocation.status === VenueRentalAllocationStatus.HELD
              ? 'HELD'
              : 'BOOKED';
        else if (pendingRequest) status = 'PENDING_REQUEST';
        return {
          ...slot,
          status,
          ...(manager
            ? {
                blockId: block?.id,
                blockReason: block?.reason,
                requestId:
                  allocation?.requestId || pendingRequest?.id || undefined,
                contactName:
                  allocation?.request?.contactName ||
                  pendingRequest?.contactName ||
                  undefined,
                contactPhone:
                  allocation?.request?.contactPhone ||
                  pendingRequest?.contactPhone ||
                  undefined,
              }
            : {}),
        };
      }),
    }));
    return {
      venueId,
      timezone: venue.timezone,
      courtSelectionEnabled: venue.courtSelectionEnabled,
      slotMinutes: VenueCourtsService.SLOT_MINUTES,
      operatingWindow: { startMinute: firstMinute, endMinute: lastMinute },
      slots,
      courts,
    };
  }

  private async getSlotPrices(
    venueId: string,
    timezone: string,
    date: string,
    slots: Array<{ startMinute: number; endMinute: number }>,
    customerType: VenueCustomerType
  ) {
    return Promise.all(
      slots.map(async (slot) => {
        try {
          const calculation = await this.pricing.calculate(venueId, {
            startTime: this.toUtc(date, slot.startMinute, timezone),
            endTime: this.toUtc(date, slot.endMinute, timezone),
            numberOfCourts: 1,
            customerType,
          });
          return calculation.breakdown[0]?.pricePerHour ?? null;
        } catch {
          return null;
        }
      })
    );
  }

  private async resolveCourts(
    tx: Prisma.TransactionClient,
    input: {
      venueId: string;
      startTime: Date;
      endTime: Date;
      numberOfCourts: number;
      selectionMode: VenueRentalSelectionMode;
      courtIds?: string[];
    }
  ) {
    const available = await this.findAvailableCourts(
      tx,
      input.venueId,
      input.startTime,
      input.endTime
    );
    if (input.selectionMode === VenueRentalSelectionMode.SELECT_COURTS) {
      const requested = [...new Set(input.courtIds || [])];
      if (requested.length !== input.numberOfCourts) {
        throw new BadRequestException(
          'courtIds must match numberOfCourts for SELECT_COURTS'
        );
      }
      if (!requested.every((id) => available.some((court) => court.id === id)))
        this.courtUnavailable();
      return requested;
    }
    if (available.length < input.numberOfCourts) this.courtUnavailable();
    return available.slice(0, input.numberOfCourts).map((court) => court.id);
  }

  private async findAvailableCourts(
    tx: Prisma.TransactionClient,
    venueId: string,
    startTime: Date,
    endTime: Date
  ) {
    return tx.venueCourt.findMany({
      where: {
        venueId,
        status: VenueCourtStatus.ACTIVE,
        blocks: {
          none: { startTime: { lt: endTime }, endTime: { gt: startTime } },
        },
        allocations: {
          none: {
            startTime: { lt: endTime },
            endTime: { gt: startTime },
            OR: [
              { status: VenueRentalAllocationStatus.CONFIRMED },
              {
                status: VenueRentalAllocationStatus.HELD,
                expiresAt: { gt: new Date() },
              },
            ],
          },
        },
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  }

  private releaseExpiredVenueHolds(
    tx: Prisma.TransactionClient,
    venueId: string
  ) {
    return tx.venueRentalCourtAllocation.updateMany({
      where: {
        venueId,
        status: VenueRentalAllocationStatus.HELD,
        expiresAt: { lte: new Date() },
      },
      data: {
        status: VenueRentalAllocationStatus.RELEASED,
        releasedAt: new Date(),
      },
    });
  }

  private async assertOpenRange(
    tx: Prisma.TransactionClient,
    venueId: string,
    startTime: Date,
    endTime: Date,
    timezone: string
  ) {
    const validated = this.pricing.validateTimeRange(
      startTime,
      endTime,
      timezone
    );
    if (
      validated.startParts.minute % VenueCourtsService.SLOT_MINUTES !== 0 ||
      validated.endParts.minute % VenueCourtsService.SLOT_MINUTES !== 0
    ) {
      throw new BadRequestException(
        'Rental times must align to 30-minute slots'
      );
    }
    const period = await tx.venueOperatingPeriod.findFirst({
      where: {
        venueId,
        dayOfWeek: this.dayOfWeek(validated.startParts.dateKey),
        startMinute: { lte: validated.startParts.minute },
        endMinute: { gte: validated.endParts.minute },
      },
    });
    if (!period) {
      throw new ConflictException({
        code: 'OUTSIDE_OPERATING_HOURS',
        message: 'Rental time is outside venue operating hours',
      });
    }
  }

  private validatePeriods(periods: OperatingPeriodDto[]) {
    const byDay = new Map<number, OperatingPeriodDto[]>();
    for (const period of periods) {
      if (
        period.endMinute <= period.startMinute ||
        period.startMinute % VenueCourtsService.SLOT_MINUTES !== 0 ||
        period.endMinute % VenueCourtsService.SLOT_MINUTES !== 0
      ) {
        throw new BadRequestException(
          'Operating periods must be valid and align to 30-minute slots'
        );
      }
      const day = byDay.get(period.dayOfWeek) || [];
      day.push(period);
      byDay.set(period.dayOfWeek, day);
    }
    for (const day of byDay.values()) {
      day.sort((a, b) => a.startMinute - b.startMinute);
      if (
        day.some(
          (item, index) =>
            index > 0 && item.startMinute < day[index - 1].endMinute
        )
      ) {
        throw new BadRequestException('Operating periods cannot overlap');
      }
    }
  }

  private async syncCapacity(venueId: string) {
    const numberOfCourts = await this.prisma.venueCourt.count({
      where: { venueId, status: VenueCourtStatus.ACTIVE },
    });
    await this.prisma.venue.update({
      where: { id: venueId },
      data: { numberOfCourts },
    });
  }

  private async ensureCourt(venueId: string, courtId: string) {
    const court = await this.prisma.venueCourt.findFirst({
      where: { id: courtId, venueId },
    });
    if (!court) throw new NotFoundException('Venue court not found');
    return court;
  }

  private dayOfWeek(date: string) {
    const [year, month, day] = date.split('-').map(Number);
    const value = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return value === 0 ? 7 : value;
  }

  private localParts(value: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(value);
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value || 0);
    return {
      year: read('year'),
      month: read('month'),
      day: read('day'),
      minute: read('hour') * 60 + read('minute'),
    };
  }

  private courtUnavailable(): never {
    throw new ConflictException({
      code: 'COURT_UNAVAILABLE',
      message: 'One or more selected courts are no longer available',
    });
  }
}
