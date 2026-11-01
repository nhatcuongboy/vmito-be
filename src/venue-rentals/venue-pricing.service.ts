import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  VenueCustomerType,
  VenueDayType,
  VenuePriceRule,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RentalPriceInput {
  startTime: string | Date;
  endTime: string | Date;
  numberOfCourts: number;
  customerType: VenueCustomerType;
  /** Specific courts being rented; picks a court-specific price book. */
  courtIds?: string[];
  requireFuture?: boolean;
}

export interface RentalPriceBreakdownItem {
  fromMinute: number;
  toMinute: number;
  from: string;
  to: string;
  minutes: number;
  billableMinutes: number;
  numberOfCourts: number;
  pricePerHour: number;
  amount: number;
  ruleId: string | null;
  source: 'PRICE_BOOK' | 'LEGACY';
  /** Multi-segment quotes only: which segment, and its courts. */
  segmentIndex?: number;
  courtIds?: string[];
}

export interface RentalSegmentInput {
  startTime: string | Date;
  endTime: string | Date;
  courtIds: string[];
}

/** One priced segment, as stored in `VenueRentalQuote.segments`. */
export interface RentalSegment {
  startTime: string;
  endTime: string;
  courtIds: string[];
  numberOfCourts: number;
  amount: number;
  priceBookId: string | null;
}

@Injectable()
export class VenuePricingService {
  constructor(private readonly prisma: PrismaService) {}

  async calculate(venueId: string, input: RentalPriceInput) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        id: true,
        timezone: true,
        numberOfCourts: true,
        hourlyRateFixed: true,
        hourlyRateWalkIn: true,
        priceBooks: {
          where: { isActive: true },
          include: { rules: true, courts: { select: { id: true } } },
          orderBy: [{ priority: 'desc' }, { effectiveFrom: 'desc' }],
        },
      },
    });
    if (!venue) throw new NotFoundException('Venue not found');

    const { start, end, startParts, endParts } = this.validateTimeRange(
      input.startTime,
      input.endTime,
      venue.timezone,
      input.requireFuture
    );
    if (!venue.numberOfCourts || input.numberOfCourts > venue.numberOfCourts) {
      throw new BadRequestException('numberOfCourts exceeds venue capacity');
    }

    // A price book linked to the rented courts wins; otherwise the venue-wide
    // book (no courts linked), then any effective book as a last resort.
    const effectiveBooks = venue.priceBooks.filter(
      (book) =>
        book.effectiveFrom <= start &&
        (!book.effectiveTo || book.effectiveTo >= start)
    );
    const courtIds = input.courtIds ?? [];
    const priceBook =
      (courtIds.length
        ? effectiveBooks.find(
            (book) =>
              book.courts.length > 0 &&
              courtIds.every((id) => book.courts.some((c) => c.id === id))
          )
        : undefined) ??
      effectiveBooks.find((book) => book.courts.length === 0) ??
      effectiveBooks[0];
    const dayOfWeek = this.getDayOfWeek(startParts.dateKey);
    const rules = (priceBook?.rules || []).filter((rule) =>
      this.ruleApplies(
        rule,
        startParts.dateKey,
        dayOfWeek,
        input.customerType,
        venue.timezone
      )
    );
    const boundaries = new Set([startParts.minute, endParts.minute]);
    for (const rule of rules) {
      if (
        rule.endMinute > startParts.minute &&
        rule.startMinute < endParts.minute
      ) {
        boundaries.add(Math.max(startParts.minute, rule.startMinute));
        boundaries.add(Math.min(endParts.minute, rule.endMinute));
      }
    }

    const points = [...boundaries].sort((a, b) => a - b);
    const breakdown: RentalPriceBreakdownItem[] = [];
    let totalAmount = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      const fromMinute = points[index];
      const toMinute = points[index + 1];
      const rule = rules
        .filter(
          (item) => item.startMinute < toMinute && item.endMinute > fromMinute
        )
        .sort(
          (a, b) => b.priority - a.priority || b.pricePerHour - a.pricePerHour
        )[0];
      const pricePerHour =
        rule?.pricePerHour ?? this.getLegacyRate(venue, input.customerType);
      if (!pricePerHour) {
        throw new ConflictException({
          code: 'PRICING_UNAVAILABLE',
          message: 'No rental price is configured for this time range',
        });
      }
      const minutes = toMinute - fromMinute;
      const billableMinutes = this.getBillableMinutes(minutes, rule);
      const amount = Math.round(
        (pricePerHour * billableMinutes * input.numberOfCourts) / 60
      );
      totalAmount += amount;
      breakdown.push({
        fromMinute,
        toMinute,
        from: this.formatMinute(fromMinute),
        to: this.formatMinute(toMinute),
        minutes,
        billableMinutes,
        numberOfCourts: input.numberOfCourts,
        pricePerHour,
        amount,
        ruleId: rule?.id ?? null,
        source: rule ? 'PRICE_BOOK' : 'LEGACY',
      });
    }

    return {
      version: 1,
      totalAmount,
      priceBookId: priceBook?.id ?? null,
      currency: priceBook?.currency ?? 'VND',
      timezone: venue.timezone,
      startTime: start,
      endTime: end,
      breakdown,
    };
  }

  /**
   * Prices a multi-segment booking: each segment on its own courts (so a
   * court-specific price book still applies), then summed. All segments must
   * fall on one local day and must not overlap on a shared court.
   */
  async calculateSegments(
    venueId: string,
    input: {
      segments: RentalSegmentInput[];
      customerType: VenueCustomerType;
      requireFuture?: boolean;
    }
  ) {
    // Sorted first so `segmentIndex` in the breakdown matches `segments`.
    const ordered = [...input.segments].sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
    const priced: Array<{
      index: number;
      courtIds: string[];
      calculation: Awaited<ReturnType<VenuePricingService['calculate']>>;
    }> = [];
    for (const [index, segment] of ordered.entries()) {
      const courtIds = [...new Set(segment.courtIds)];
      const calculation = await this.calculate(venueId, {
        startTime: segment.startTime,
        endTime: segment.endTime,
        numberOfCourts: courtIds.length,
        customerType: input.customerType,
        courtIds,
        requireFuture: input.requireFuture,
      });
      priced.push({ index, courtIds, calculation });
    }

    const timezone = priced[0].calculation.timezone;
    const dateKeys = new Set(
      priced.map((item) =>
        this.getLocalDateKey(item.calculation.startTime, timezone)
      )
    );
    if (dateKeys.size > 1) {
      throw new BadRequestException({
        code: 'SEGMENTS_MULTIPLE_DAYS',
        message: 'All rental segments must be on the same local day',
      });
    }
    for (const a of priced) {
      for (const b of priced) {
        if (
          a.index < b.index &&
          a.courtIds.some((id) => b.courtIds.includes(id)) &&
          a.calculation.startTime < b.calculation.endTime &&
          b.calculation.startTime < a.calculation.endTime
        ) {
          throw new BadRequestException({
            code: 'SEGMENTS_OVERLAP',
            message: 'Rental segments overlap on the same court',
          });
        }
      }
    }

    const segments: RentalSegment[] = priced.map(
      ({ courtIds, calculation }) => ({
        startTime: calculation.startTime.toISOString(),
        endTime: calculation.endTime.toISOString(),
        courtIds,
        numberOfCourts: courtIds.length,
        amount: calculation.totalAmount,
        priceBookId: calculation.priceBookId,
      })
    );
    const breakdown: RentalPriceBreakdownItem[] = priced.flatMap(
      ({ index, courtIds, calculation }) =>
        calculation.breakdown.map((item) => ({
          ...item,
          segmentIndex: index,
          courtIds,
        }))
    );
    const starts = priced.map((item) => item.calculation.startTime.getTime());
    const ends = priced.map((item) => item.calculation.endTime.getTime());
    return {
      version: 1,
      totalAmount: segments.reduce((sum, segment) => sum + segment.amount, 0),
      priceBookId: priced[0].calculation.priceBookId,
      currency: priced[0].calculation.currency,
      timezone,
      startTime: new Date(Math.min(...starts)),
      endTime: new Date(Math.max(...ends)),
      breakdown,
      segments,
      courtIds: [...new Set(priced.flatMap((item) => item.courtIds))],
    };
  }

  getLocalDateKey(value: Date, timezone: string) {
    return this.getLocalParts(value, timezone).dateKey;
  }

  validateTimeRange(
    startValue: string | Date,
    endValue: string | Date,
    timezone: string,
    requireFuture = false
  ) {
    const start = new Date(startValue);
    const end = new Date(endValue);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end <= start
    ) {
      throw new BadRequestException('endTime must be after startTime');
    }
    if (requireFuture && start <= new Date()) {
      throw new BadRequestException('Rental startTime must be in the future');
    }
    if (end.getTime() - start.getTime() > 12 * 60 * 60 * 1000) {
      throw new BadRequestException('Rental duration cannot exceed 12 hours');
    }

    const startParts = this.getLocalParts(start, timezone);
    const endParts = this.getLocalParts(end, timezone);
    const endsAtNextMidnight =
      endParts.dateKey === this.getNextDateKey(startParts.dateKey) &&
      endParts.minute === 0;
    if (
      (startParts.dateKey !== endParts.dateKey && !endsAtNextMidnight) ||
      (!endsAtNextMidnight && endParts.minute <= startParts.minute)
    ) {
      throw new BadRequestException(
        'Rental must start and end on the same local calendar day'
      );
    }
    return {
      start,
      end,
      startParts,
      endParts: endsAtNextMidnight
        ? { dateKey: startParts.dateKey, minute: 1440 }
        : endParts,
    };
  }

  private getLocalParts(value: Date, timezone: string) {
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
      parts.find((part) => part.type === type)?.value || '';
    return {
      dateKey: `${read('year')}-${read('month')}-${read('day')}`,
      minute: Number(read('hour')) * 60 + Number(read('minute')),
    };
  }

  private getDayOfWeek(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return utcDay === 0 ? 7 : utcDay;
  }

  private getNextDateKey(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + 1));
    return date.toISOString().slice(0, 10);
  }

  private ruleApplies(
    rule: VenuePriceRule,
    dateKey: string,
    dayOfWeek: number,
    customerType: VenueCustomerType,
    timezone: string
  ) {
    // Student prices are display-only; rentals are quoted at the standard rate.
    if (rule.customerType !== customerType || rule.isStudent) return false;
    if (rule.dayType === VenueDayType.EVERYDAY) return true;
    if (rule.dayType === VenueDayType.WEEKDAY) {
      return rule.daysOfWeek.length
        ? rule.daysOfWeek.includes(dayOfWeek)
        : dayOfWeek <= 5;
    }
    if (rule.dayType === VenueDayType.WEEKEND) return dayOfWeek >= 6;
    if (
      rule.dayType === VenueDayType.SPECIFIC_DATE ||
      rule.dayType === VenueDayType.HOLIDAY
    ) {
      return (
        !!rule.specificDate &&
        this.getLocalDateKey(rule.specificDate, timezone) === dateKey
      );
    }
    return false;
  }

  private getLegacyRate(
    venue: { hourlyRateFixed: number | null; hourlyRateWalkIn: number | null },
    customerType: VenueCustomerType
  ) {
    return customerType === VenueCustomerType.FIXED
      ? venue.hourlyRateFixed || venue.hourlyRateWalkIn || 0
      : venue.hourlyRateWalkIn || venue.hourlyRateFixed || 0;
  }

  private getBillableMinutes(minutes: number, rule?: VenuePriceRule) {
    let result = Math.max(minutes, rule?.minimumMinutes || minutes);
    if (rule?.billingStepMinutes) {
      result =
        Math.ceil(result / rule.billingStepMinutes) * rule.billingStepMinutes;
    }
    return result;
  }

  private formatMinute(value: number) {
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  }
}
