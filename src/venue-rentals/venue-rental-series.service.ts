import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  VenueCustomerType,
  VenueRentalSelectionMode,
  VenueRentalSeriesStatus,
  VenueRentalSource,
  VenueRentalStatus,
  VenueRentalTransactionDirection,
  VenueRentalTransactionPurpose,
  VenueRentalTransactionStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { VenueAccessService } from '../venues/venue-access.service';
import type {
  CreateManualRentalSeriesDto,
  CreateRentalSeriesDto,
  ExtendRentalSeriesDto,
  RentalSeriesPlanDto,
  SubmitSeriesPaymentDto,
} from './dto/venue-rental-series.dto';
import { withoutRentalNotifications } from './rental-notify-scope';
import { startOfLocalDay } from './rental-report';
import { addDays, dayOfWeek, seriesDates } from './rental-series';
import { VenueCourtsService } from './venue-courts.service';
import { VenuePricingService } from './venue-pricing.service';
import { VenueRentalPaymentsService } from './venue-rental-payments.service';
import { VenueRentalsService } from './venue-rentals.service';

const SERIES_INCLUDE = {
  venue: { select: { id: true, name: true, slug: true, timezone: true } },
  requests: {
    orderBy: { createdAt: 'asc' },
    include: {
      quote: { select: { startTime: true, endTime: true, totalAmount: true } },
      transactions: { orderBy: { createdAt: 'desc' } },
    },
  },
} satisfies Prisma.VenueRentalSeriesInclude;

type Series = Prisma.VenueRentalSeriesGetPayload<{
  include: typeof SERIES_INCLUDE;
}>;

interface SeriesSchedule {
  startMinute: number;
  endMinute: number;
  courtIds: string[];
  customerType: VenueCustomerType;
}

/**
 * Weekly fixed bookings. A series owns no schedule logic of its own: it fans
 * out to ordinary rentals through `VenueRentalsService`, muting their
 * per-rental notifications and sending one message for the whole series.
 */
@Injectable()
export class VenueRentalSeriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: VenueAccessService,
    private readonly pricing: VenuePricingService,
    private readonly courts: VenueCourtsService,
    private readonly rentals: VenueRentalsService,
    private readonly payments: VenueRentalPaymentsService,
    private readonly notifications: NotificationsService
  ) {}

  /** What each week would cost and whether it is free. Holds nothing. */
  async preview(venueId: string, dto: RentalSeriesPlanDto, userId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { courtSelectionEnabled: true, timezone: true },
    });
    if (!venue) throw new NotFoundException('Venue not found');
    if (!venue.courtSelectionEnabled) {
      throw new ConflictException({
        code: 'SERIES_UNSUPPORTED',
        message: 'Weekly bookings need the court board to be enabled',
      });
    }
    // Like a re-quote: moving to a series supersedes the caller's open quote,
    // whose hold would otherwise make their own first week look taken.
    await this.prisma.$transaction((tx) =>
      this.courts.releaseRequesterQuoteHolds(tx, venueId, userId, '')
    );
    const weeks = await Promise.all(
      seriesDates(dto.startDate, dto.weeks).map((date) =>
        this.checkWeek(venueId, venue.timezone, date, dto)
      )
    );
    return {
      weeks,
      totalAmount: weeks
        .filter((week) => week.isAvailable)
        .reduce((sum, week) => sum + week.amount, 0),
    };
  }

  private async checkWeek(
    venueId: string,
    timezone: string,
    date: string,
    schedule: SeriesSchedule
  ) {
    const { startTime, endTime } = this.times(date, timezone, schedule);
    try {
      const calculation = await this.pricing.calculate(venueId, {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        numberOfCourts: schedule.courtIds.length,
        customerType: schedule.customerType,
        courtIds: schedule.courtIds,
        requireFuture: true,
      });
      const isFree = await this.courts.areCourtsFree(
        venueId,
        startTime,
        endTime,
        schedule.courtIds,
        timezone
      );
      return {
        date,
        startTime,
        endTime,
        amount: calculation.totalAmount,
        isAvailable: isFree,
        reason: isFree ? null : 'COURT_UNAVAILABLE',
      };
    } catch (error) {
      if (!(error instanceof HttpException)) throw error;
      const body = error.getResponse() as { code?: string };
      return {
        date,
        startTime,
        endTime,
        amount: 0,
        isAvailable: false,
        reason: body.code ?? 'UNAVAILABLE',
      };
    }
  }

  private times(date: string, timezone: string, schedule: SeriesSchedule) {
    const dayStart = startOfLocalDay(date, timezone).getTime();
    return {
      startTime: new Date(dayStart + schedule.startMinute * 60_000),
      endTime: new Date(dayStart + schedule.endMinute * 60_000),
    };
  }

  /** The bookable dates of a plan, refusing a clash nobody chose to skip. */
  private async bookableDates(
    venueId: string,
    plan: RentalSeriesPlanDto,
    userId: string,
    skipDates: string[] = []
  ) {
    const { weeks } = await this.preview(venueId, plan, userId);
    const wanted = weeks.filter((week) => !skipDates.includes(week.date));
    if (wanted.some((week) => !week.isAvailable)) {
      throw new ConflictException({
        code: 'COURT_UNAVAILABLE',
        message: 'A week in this series is no longer available',
      });
    }
    if (!wanted.length) {
      throw new BadRequestException('A series needs at least one session');
    }
    return wanted.map((week) => week.date);
  }

  async create(dto: CreateRentalSeriesDto, userId: string) {
    const dates = await this.bookableDates(
      dto.venueId,
      dto,
      userId,
      dto.skipDates
    );
    const series = await this.createRow(dto, userId, {
      requesterId: userId,
      source: VenueRentalSource.ONLINE,
      status: VenueRentalSeriesStatus.PENDING,
    });
    await this.bookOnline(series, dates, userId);
    await this.notifyManagers(
      series,
      'Yêu cầu đặt cố định mới',
      `Có yêu cầu đặt cố định ${dates.length} buổi cần xử lý.`,
      `series:${series.id}:created`,
      'rental_series_created',
      { count: String(dates.length) }
    );
    return this.findOne(series.id, userId, '');
  }

  async createManual(
    dto: CreateManualRentalSeriesDto,
    userId: string,
    role: string
  ) {
    await this.access.assertManager(dto.venueId, userId, role);
    const dates = await this.bookableDates(
      dto.venueId,
      dto,
      userId,
      dto.skipDates
    );
    const series = await this.createRow(dto, userId, {
      requesterId: dto.requesterId ?? null,
      source: VenueRentalSource.MANUAL,
      status: VenueRentalSeriesStatus.ACTIVE,
    });
    await this.bookManual(series, dates, userId, role);
    return this.findOne(series.id, userId, role);
  }

  private createRow(
    dto: CreateRentalSeriesDto,
    userId: string,
    origin: {
      requesterId: string | null;
      source: VenueRentalSource;
      status: VenueRentalSeriesStatus;
    }
  ) {
    return this.prisma.venueRentalSeries.create({
      data: {
        ...origin,
        venueId: dto.venueId,
        createdByUserId: userId,
        contactName: dto.contactName.trim(),
        contactPhone: dto.contactPhone.trim(),
        notes: dto.notes?.trim() || null,
        customerType: dto.customerType,
        dayOfWeek: dayOfWeek(dto.startDate),
        startMinute: dto.startMinute,
        endMinute: dto.endMinute,
        courtIds: dto.courtIds,
      },
      include: { venue: { select: { timezone: true } } },
    });
  }

  private async bookOnline(series: SeriesRow, dates: string[], userId: string) {
    await this.fanOut(series, userId, '', dates, async (times) => {
      const quote = await this.rentals.createQuote(
        series.venueId,
        {
          ...times,
          numberOfCourts: series.courtIds.length,
          customerType: series.customerType,
          selectionMode: VenueRentalSelectionMode.SELECT_COURTS,
          courtIds: series.courtIds,
        },
        userId
      );
      return this.rentals.create(
        {
          quoteId: quote.id,
          contactName: series.contactName,
          contactPhone: series.contactPhone,
          notes: series.notes ?? undefined,
        },
        userId
      );
    });
  }

  private async bookManual(
    series: SeriesRow,
    dates: string[],
    userId: string,
    role: string
  ) {
    await this.fanOut(series, userId, role, dates, (times) =>
      this.rentals.createManual(
        {
          ...times,
          venueId: series.venueId,
          requesterId: series.requesterId ?? undefined,
          numberOfCourts: series.courtIds.length,
          customerType: series.customerType,
          selectionMode: VenueRentalSelectionMode.SELECT_COURTS,
          courtIds: series.courtIds,
          contactName: series.contactName,
          contactPhone: series.contactPhone,
          notes: series.notes ?? undefined,
        },
        userId,
        role
      )
    );
  }

  /**
   * Books week by week. Each week is its own transaction, so a clash midway
   * undoes the weeks already booked rather than leaving half a series.
   */
  private async fanOut(
    series: SeriesRow,
    userId: string,
    role: string,
    dates: string[],
    book: (times: { startTime: string; endTime: string }) => Promise<{
      id: string;
    }>
  ) {
    const booked: string[] = [];
    await withoutRentalNotifications(async () => {
      try {
        for (const date of dates) {
          const { startTime, endTime } = this.times(
            date,
            series.venue.timezone,
            series
          );
          const rental = await book({
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
          });
          booked.push(rental.id);
          await this.prisma.venueRentalRequest.update({
            where: { id: rental.id },
            data: { seriesId: series.id },
          });
        }
      } catch (error) {
        for (const id of booked) {
          await this.rentals.cancel(id, 'SERIES_FAILED', userId, role);
        }
        if (!(await this.hasLiveSessions(series.id))) {
          await this.prisma.venueRentalSeries.update({
            where: { id: series.id },
            data: { status: VenueRentalSeriesStatus.CANCELLED },
          });
        }
        throw error;
      }
    });
  }

  private async hasLiveSessions(id: string) {
    const live = await this.prisma.venueRentalRequest.count({
      where: {
        seriesId: id,
        status: {
          in: [
            VenueRentalStatus.PENDING,
            VenueRentalStatus.COUNTER_OFFERED,
            VenueRentalStatus.AWAITING_DEPOSIT,
            VenueRentalStatus.CONFIRMED,
          ],
        },
      },
    });
    return live > 0;
  }

  private async load(id: string) {
    const series = await this.prisma.venueRentalSeries.findUnique({
      where: { id },
      include: SERIES_INCLUDE,
    });
    if (!series) throw new NotFoundException('Rental series not found');
    return series;
  }

  async findOne(id: string, userId: string, role: string) {
    const series = await this.load(id);
    if (series.requesterId !== userId) {
      await this.access.assertManager(series.venueId, userId, role);
    }
    const sessions = series.requests.map((request) =>
      this.session(request, series.venue.timezone)
    );
    const lastDate = sessions
      .map((session) => session.date)
      .sort()
      .at(-1);
    const batches = new Map<
      string,
      { id: string; amount: number; count: number; proofUrl: string | null }
    >();
    for (const request of series.requests) {
      for (const payment of request.transactions) {
        if (
          !payment.batchId ||
          payment.status !== VenueRentalTransactionStatus.SUBMITTED
        ) {
          continue;
        }
        const batch = batches.get(payment.batchId) ?? {
          id: payment.batchId,
          amount: 0,
          count: 0,
          proofUrl: payment.proofUrl,
        };
        batch.amount += payment.amount;
        batch.count += 1;
        batches.set(payment.batchId, batch);
      }
    }
    return {
      id: series.id,
      status: series.status,
      source: series.source,
      venue: series.venue,
      requesterId: series.requesterId,
      contactName: series.contactName,
      contactPhone: series.contactPhone,
      customerType: series.customerType,
      startMinute: series.startMinute,
      endMinute: series.endMinute,
      courtIds: series.courtIds,
      sessions,
      pendingBatches: [...batches.values()],
      nextDate: lastDate ? addDays(lastDate, 7) : null,
    };
  }

  private session(request: Series['requests'][number], timezone: string) {
    const startTime = request.confirmedStartTime ?? request.quote?.startTime;
    const endTime = request.confirmedEndTime ?? request.quote?.endTime;
    const paid = request.transactions
      .filter(
        (payment) =>
          payment.direction === VenueRentalTransactionDirection.IN &&
          payment.status === VenueRentalTransactionStatus.APPROVED
      )
      .reduce((sum, payment) => sum + payment.amount, 0);
    const amount = request.confirmedAmount ?? request.quote?.totalAmount ?? 0;
    const isSubmitted = request.transactions.some(
      (payment) => payment.status === VenueRentalTransactionStatus.SUBMITTED
    );
    return {
      id: request.id,
      status: request.status,
      date: startTime ? this.dateKey(startTime, timezone) : '',
      startTime,
      endTime,
      amount,
      paid,
      due:
        request.status === VenueRentalStatus.AWAITING_DEPOSIT
          ? Math.max(0, (request.depositAmount ?? 0) - paid)
          : request.status === VenueRentalStatus.CONFIRMED
            ? Math.max(0, amount - paid)
            : 0,
      isPaymentSubmitted: isSubmitted,
      noShowAt: request.noShowAt,
    };
  }

  async approve(id: string, userId: string, role: string) {
    const series = await this.load(id);
    await this.access.assertManager(series.venueId, userId, role);
    this.assertPending(series);
    let approved = 0;
    await withoutRentalNotifications(async () => {
      for (const request of series.requests) {
        if (request.status !== VenueRentalStatus.PENDING) continue;
        try {
          await this.rentals.approve(request.id, userId, role);
          approved += 1;
        } catch (error) {
          // A week can lapse or start while the manager decides; the others
          // still go through and the failed one stays visible on the series.
          if (!(error instanceof HttpException)) throw error;
        }
      }
    });
    if (!approved) {
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message: 'No session in this series could be approved',
      });
    }
    await this.prisma.venueRentalSeries.update({
      where: { id },
      data: { status: VenueRentalSeriesStatus.ACTIVE },
    });
    await this.notifyRequester(
      series,
      'Sân đã duyệt lịch cố định',
      `${approved} buổi đã được duyệt.`,
      `series:${id}:approved:${approved}`,
      'rental_series_approved',
      { count: String(approved) }
    );
    return this.findOne(id, userId, role);
  }

  async reject(id: string, reason: string, userId: string, role: string) {
    const series = await this.load(id);
    await this.access.assertManager(series.venueId, userId, role);
    this.assertPending(series);
    await withoutRentalNotifications(async () => {
      for (const request of series.requests) {
        if (request.status === VenueRentalStatus.PENDING) {
          await this.rentals.reject(request.id, reason, userId, role);
        }
      }
    });
    await this.prisma.venueRentalSeries.update({
      where: { id },
      data: { status: VenueRentalSeriesStatus.REJECTED },
    });
    await this.notifyRequester(
      series,
      'Sân đã từ chối lịch cố định',
      reason,
      `series:${id}:rejected`,
      'rental_series_rejected',
      { reason }
    );
    return this.findOne(id, userId, role);
  }

  /** Ends every session still ahead; ones already played stay as they are. */
  async cancelRemaining(
    id: string,
    reason: string | undefined,
    userId: string,
    role: string
  ) {
    const series = await this.load(id);
    const isRequester = series.requesterId === userId;
    if (!isRequester) {
      await this.access.assertManager(series.venueId, userId, role);
    }
    const now = new Date();
    const ahead = series.requests.filter((request) => {
      const start = request.confirmedStartTime ?? request.quote?.startTime;
      return (
        start !== undefined &&
        start > now &&
        request.status !== VenueRentalStatus.CANCELLED &&
        request.status !== VenueRentalStatus.REJECTED &&
        request.status !== VenueRentalStatus.COMPLETED
      );
    });
    const note = reason?.trim() || 'SERIES_CANCELLED';
    await withoutRentalNotifications(async () => {
      for (const request of ahead) {
        await this.rentals.cancel(request.id, note, userId, role);
      }
    });
    await this.prisma.venueRentalSeries.update({
      where: { id },
      data: { status: VenueRentalSeriesStatus.CANCELLED },
    });
    const title = 'Lịch cố định đã bị huỷ';
    const message = `${ahead.length} buổi còn lại đã được huỷ.`;
    const key = `series:${id}:cancelled`;
    const extra = { count: String(ahead.length) };
    if (isRequester) {
      await this.notifyManagers(
        series,
        title,
        message,
        key,
        'rental_series_cancelled',
        extra
      );
    } else {
      await this.notifyRequester(
        series,
        title,
        message,
        key,
        'rental_series_cancelled',
        extra
      );
    }
    return this.findOne(id, userId, role);
  }

  /** Adds weeks after the last one, the same way the series was booked. */
  async extend(
    id: string,
    dto: ExtendRentalSeriesDto,
    userId: string,
    role: string
  ) {
    const series = await this.load(id);
    const isRequester = series.requesterId === userId;
    if (!isRequester) {
      await this.access.assertManager(series.venueId, userId, role);
    }
    if (series.status !== VenueRentalSeriesStatus.ACTIVE) {
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message: 'Only an active series can be extended',
      });
    }
    const last = series.requests
      .map((request) => request.confirmedStartTime ?? request.quote?.startTime)
      .filter((value): value is Date => value !== undefined && value !== null)
      .sort((a, b) => a.getTime() - b.getTime())
      .at(-1);
    if (!last) throw new BadRequestException('Series has no sessions');
    const lastDate = this.dateKey(last, series.venue.timezone);
    const dates = await this.bookableDates(
      series.venueId,
      {
        startDate: addDays(lastDate, 7),
        weeks: dto.weeks,
        startMinute: series.startMinute,
        endMinute: series.endMinute,
        courtIds: series.courtIds,
        customerType: series.customerType,
      },
      userId,
      dto.skipDates
    );
    if (series.source === VenueRentalSource.MANUAL) {
      await this.bookManual(series, dates, userId, role);
    } else {
      await this.bookOnline(series, dates, series.requesterId!);
      await this.prisma.venueRentalSeries.update({
        where: { id },
        data: { status: VenueRentalSeriesStatus.PENDING },
      });
      await this.notifyManagers(
        series,
        'Yêu cầu gia hạn lịch cố định',
        `Có yêu cầu thêm ${dates.length} buổi cần xử lý.`,
        `series:${id}:extended:${dates[0]}`,
        'rental_series_created',
        { count: String(dates.length) }
      );
    }
    return this.findOne(id, userId, role);
  }

  /**
   * One transfer for several sessions. Each session gets its own transaction
   * for what it owes next, sharing a batch id, so the ledger of every rental
   * stays right and the venue still reviews a single proof.
   */
  async submitPayment(id: string, dto: SubmitSeriesPaymentDto, userId: string) {
    const series = await this.load(id);
    if (series.requesterId !== userId) {
      throw new ForbiddenException('Rental requester access required');
    }
    const batchId = randomUUID();
    let total = 0;
    await withoutRentalNotifications(async () => {
      for (const requestId of dto.requestIds) {
        const request = series.requests.find((item) => item.id === requestId);
        if (!request) throw new NotFoundException('Series session not found');
        const summary = await this.payments.getSummary(requestId, userId, '');
        const owesDeposit =
          request.status === VenueRentalStatus.AWAITING_DEPOSIT;
        const amount = owesDeposit
          ? summary.depositAmount - summary.depositPaid
          : summary.outstanding;
        if (amount <= 0) continue;
        const payment = await this.payments.submitPayment(
          requestId,
          {
            purpose: owesDeposit
              ? VenueRentalTransactionPurpose.DEPOSIT
              : VenueRentalTransactionPurpose.BALANCE,
            amount,
            proofUrl: dto.proofUrl,
            proofPublicId: dto.proofPublicId,
            notes: dto.notes,
          },
          userId
        );
        await this.prisma.venueRentalTransaction.update({
          where: { id: payment.id },
          data: { batchId },
        });
        total += amount;
      }
    });
    if (!total) {
      throw new ConflictException({
        code: 'PAYMENT_NOT_REQUIRED',
        message: 'Nothing is owed on these sessions',
      });
    }
    await this.notifyManagers(
      series,
      'Có chứng từ thanh toán lịch cố định',
      'Khách đã gửi một chứng từ cho nhiều buổi.',
      `series:${id}:batch:${batchId}`,
      'rental_series_payment_submitted',
      { amount: String(total) }
    );
    return this.findOne(id, userId, '');
  }

  private batchPayments(series: Series, batchId: string) {
    const payments = series.requests.flatMap((request) =>
      request.transactions
        .filter(
          (payment) =>
            payment.batchId === batchId &&
            payment.status === VenueRentalTransactionStatus.SUBMITTED
        )
        .map((payment) => ({ requestId: request.id, id: payment.id }))
    );
    if (!payments.length) {
      throw new NotFoundException('Payment batch not found');
    }
    return payments;
  }

  async approveBatch(
    id: string,
    batchId: string,
    userId: string,
    role: string
  ) {
    const series = await this.load(id);
    await this.access.assertManager(series.venueId, userId, role);
    const payments = this.batchPayments(series, batchId);
    await withoutRentalNotifications(async () => {
      for (const payment of payments) {
        await this.payments.approvePayment(
          payment.requestId,
          payment.id,
          userId,
          role
        );
      }
    });
    await this.notifyRequester(
      series,
      'Sân đã xác nhận thanh toán',
      'Chứng từ cho lịch cố định đã được duyệt.',
      `series:${id}:batch:${batchId}:approved`,
      'rental_series_payment_approved'
    );
    return this.findOne(id, userId, role);
  }

  async rejectBatch(
    id: string,
    batchId: string,
    reason: string,
    userId: string,
    role: string
  ) {
    const series = await this.load(id);
    await this.access.assertManager(series.venueId, userId, role);
    const payments = this.batchPayments(series, batchId);
    await withoutRentalNotifications(async () => {
      for (const payment of payments) {
        await this.payments.rejectPayment(
          payment.requestId,
          payment.id,
          { reason },
          userId,
          role
        );
      }
    });
    await this.notifyRequester(
      series,
      'Sân từ chối chứng từ',
      reason,
      `series:${id}:batch:${batchId}:rejected`,
      'rental_series_payment_rejected',
      { reason }
    );
    return this.findOne(id, userId, role);
  }

  private dateKey(instant: Date, timeZone: string) {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);
  }

  private assertPending(series: { status: VenueRentalSeriesStatus }) {
    if (series.status !== VenueRentalSeriesStatus.PENDING) {
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message: 'This series is not waiting for review',
      });
    }
  }

  /**
   * A session to open from a notification, for web and older apps, which
   * route by `rentalRequestId` and know nothing of series.
   */
  private async firstSessionId(seriesId: string) {
    const first = await this.prisma.venueRentalRequest.findFirst({
      where: { seriesId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return first?.id;
  }

  private async notifyRequester(
    series: { id: string; venueId: string; requesterId: string | null },
    title: string,
    message: string,
    eventKey: string,
    action: string,
    extra: Record<string, string> = {}
  ) {
    if (!series.requesterId) return;
    await this.notifications.createForUser(
      series.requesterId,
      NotificationType.VENUE_RENTAL,
      title,
      message,
      {
        rentalSeriesId: series.id,
        rentalRequestId: await this.firstSessionId(series.id),
        eventKey,
        action,
        ...extra,
      },
      {
        dedupeKey: `venue-rental:${eventKey}:requester:${series.requesterId}`,
        conflictMode: 'ONCE',
      }
    );
  }

  private async notifyManagers(
    series: { id: string; venueId: string },
    title: string,
    message: string,
    eventKey: string,
    action: string,
    extra: Record<string, string> = {}
  ) {
    const managers = await this.prisma.venueManager.findMany({
      where: { venueId: series.venueId },
      select: { userId: true },
    });
    await this.notifications.createManyForUsers(
      managers.map((manager) => manager.userId),
      NotificationType.VENUE_RENTAL,
      title,
      message,
      {
        rentalSeriesId: series.id,
        rentalRequestId: await this.firstSessionId(series.id),
        venueId: series.venueId,
        manage: true,
        eventKey,
        action,
        ...extra,
      },
      { dedupeKey: (userId) => `venue-rental:${eventKey}:manager:${userId}` }
    );
  }
}

type SeriesRow = {
  id: string;
  venueId: string;
  requesterId: string | null;
  contactName: string;
  contactPhone: string;
  notes: string | null;
  customerType: VenueCustomerType;
  startMinute: number;
  endMinute: number;
  courtIds: string[];
  venue: { timezone: string };
};
