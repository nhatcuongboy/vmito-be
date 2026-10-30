import { BadRequestException, Injectable } from '@nestjs/common';
import {
  VenueCourtStatus,
  VenueRentalAllocationStatus,
  VenueRentalTransactionDirection,
  VenueRentalTransactionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VenueAccessService } from '../venues/venue-access.service';
import type { RentalReportQueryDto } from './dto/venue-rental.dto';
import {
  buildRentalReport,
  MAX_REPORT_DAYS,
  startOfLocalDay,
} from './rental-report';

@Injectable()
export class VenueRentalReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: VenueAccessService
  ) {}

  async report(
    venueId: string,
    query: RentalReportQueryDto,
    userId: string,
    role: string
  ) {
    await this.access.assertManager(venueId, userId, role);
    const venue = await this.access.ensureVenue(venueId);
    const timeZone = venue.timezone;
    const days =
      (Date.parse(`${query.to}T00:00:00Z`) -
        Date.parse(`${query.from}T00:00:00Z`)) /
        86_400_000 +
      1;
    if (days < 1 || days > MAX_REPORT_DAYS) {
      throw new BadRequestException(
        `A report covers 1 to ${MAX_REPORT_DAYS} days`
      );
    }
    const start = startOfLocalDay(query.from, timeZone);
    const end = new Date(
      startOfLocalDay(query.to, timeZone).getTime() + 86_400_000
    );
    const scheduled = { gte: start, lt: end };
    const [courts, periods, blocks, rentals, transactions] = await Promise.all([
      this.prisma.venueCourt.findMany({
        where: { venueId, status: VenueCourtStatus.ACTIVE },
        select: { id: true, name: true, code: true },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.venueOperatingPeriod.findMany({
        where: { venueId },
        select: { dayOfWeek: true, startMinute: true, endMinute: true },
      }),
      this.prisma.venueCourtBlock.findMany({
        where: { venueId, startTime: { lt: end }, endTime: { gt: start } },
        select: { courtId: true, startTime: true, endTime: true },
      }),
      this.prisma.venueRentalRequest.findMany({
        where: {
          venueId,
          OR: [
            { confirmedStartTime: scheduled },
            { confirmedStartTime: null, quote: { startTime: scheduled } },
          ],
        },
        select: {
          status: true,
          noShowAt: true,
          confirmedStartTime: true,
          confirmedEndTime: true,
          confirmedNumberOfCourts: true,
          confirmedAmount: true,
          confirmedCustomerType: true,
          quote: {
            select: {
              startTime: true,
              endTime: true,
              numberOfCourts: true,
              totalAmount: true,
              customerType: true,
            },
          },
          courtAllocations: {
            where: {
              status: {
                in: [
                  VenueRentalAllocationStatus.RESERVED,
                  VenueRentalAllocationStatus.CONFIRMED,
                ],
              },
            },
            select: { courtId: true, startTime: true, endTime: true },
          },
        },
      }),
      this.prisma.venueRentalTransaction.findMany({
        where: {
          request: { venueId },
          status: VenueRentalTransactionStatus.APPROVED,
          approvedAt: scheduled,
        },
        select: { amount: true, direction: true, approvedAt: true },
      }),
    ]);
    return buildRentalReport({
      from: query.from,
      to: query.to,
      timeZone,
      courts,
      capacity: venue.numberOfCourts || 0,
      periods,
      blocks,
      rentals: rentals.map((rental) => ({
        status: rental.status,
        startTime: (rental.confirmedStartTime ?? rental.quote?.startTime)!,
        endTime: (rental.confirmedEndTime ?? rental.quote?.endTime)!,
        numberOfCourts:
          rental.confirmedNumberOfCourts ?? rental.quote?.numberOfCourts ?? 0,
        amount: rental.confirmedAmount ?? rental.quote?.totalAmount ?? 0,
        customerType:
          rental.confirmedCustomerType ?? rental.quote?.customerType ?? null,
        isNoShow: rental.noShowAt !== null,
        allocations: rental.courtAllocations,
      })),
      payments: transactions.map((transaction) => ({
        amount:
          transaction.direction === VenueRentalTransactionDirection.OUT
            ? -transaction.amount
            : transaction.amount,
        at: transaction.approvedAt!,
      })),
    });
  }
}
