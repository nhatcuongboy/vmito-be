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
          include: { rules: true },
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

    const priceBook = venue.priceBooks.find(
      (book) =>
        book.effectiveFrom <= start &&
        (!book.effectiveTo || book.effectiveTo >= start)
    );
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
    if (rule.customerType !== customerType) return false;
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
