import { Injectable } from '@nestjs/common';
import { PaymentStatus, RegistrationStatus, SessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HostReportQueryDto } from './dto';
import {
  bucketKey,
  resolveHostReportRange,
  resolvePreviousRange,
  ResolvedHostReportRange,
} from './host-report.util';

interface ReportSessionRow {
  id: string;
  name: string;
  slug: string | null;
  startTime: Date | null;
  createdAt: Date;
  expenses: { amount: number }[];
  paymentRecords: {
    amount: number;
    status: PaymentStatus;
    registeredByUserId: string | null;
    player: {
      userId: string | null;
      user: { id: string; name: string; image: string | null } | null;
    };
  }[];
}

interface MoneyTotals {
  income: number;
  collected: number;
  outstanding: number;
  expenses: number;
  netActual: number;
  netExpected: number;
}

const GUEST_BUCKET = 'guest';

const emptyTotals = (): MoneyTotals => ({
  income: 0,
  collected: 0,
  outstanding: 0,
  expenses: 0,
  netActual: 0,
  netExpected: 0,
});

/** A session belongs to the period it was played in; unscheduled sessions fall back to creation date. */
const sessionDate = (session: { startTime: Date | null; createdAt: Date }) =>
  session.startTime ?? session.createdAt;

@Injectable()
export class HostReportService {
  constructor(private prisma: PrismaService) {}

  async getReport(hostId: string, query: HostReportQueryDto) {
    const range = resolveHostReportRange(query);
    const previousRange = resolvePreviousRange(range);

    const [sessions, previousSessions] = await Promise.all([
      this.loadSessions(hostId, range.from, range.to),
      this.loadSessions(hostId, previousRange.from, previousRange.to),
    ]);

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        granularity: range.granularity,
      },
      totals: this.buildTotals(sessions),
      previous: {
        from: previousRange.from.toISOString(),
        to: previousRange.to.toISOString(),
        ...this.sumSessions(previousSessions),
      },
      series: this.buildSeries(sessions, range),
      bySession: this.buildBySession(sessions),
      byPlayer: this.buildByPlayer(sessions),
    };
  }

  private async loadSessions(
    hostId: string,
    from: Date,
    to: Date
  ): Promise<ReportSessionRow[]> {
    return this.prisma.session.findMany({
      where: {
        hostId,
        status: { not: SessionStatus.CANCELLED },
        cancelledAt: null,
        OR: [
          { startTime: { gte: from, lte: to } },
          { startTime: null, createdAt: { gte: from, lte: to } },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        startTime: true,
        createdAt: true,
        expenses: { select: { amount: true } },
        paymentRecords: {
          where: {
            player: { registrationStatus: RegistrationStatus.APPROVED },
          },
          select: {
            amount: true,
            status: true,
            registeredByUserId: true,
            player: {
              select: {
                userId: true,
                user: { select: { id: true, name: true, image: true } },
              },
            },
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });
  }

  private sumSessions(sessions: ReportSessionRow[]): MoneyTotals {
    const totals = emptyTotals();

    for (const session of sessions) {
      for (const payment of session.paymentRecords) {
        totals.income += payment.amount;
        if (payment.status === PaymentStatus.APPROVED) {
          totals.collected += payment.amount;
        }
      }
      for (const expense of session.expenses) {
        totals.expenses += expense.amount;
      }
    }

    totals.outstanding = totals.income - totals.collected;
    totals.netActual = totals.collected - totals.expenses;
    totals.netExpected = totals.income - totals.expenses;
    return totals;
  }

  private buildTotals(sessions: ReportSessionRow[]) {
    const players = new Set<string>();
    let paymentCount = 0;

    for (const session of sessions) {
      paymentCount += session.paymentRecords.length;
      for (const payment of session.paymentRecords) {
        players.add(this.resolvePayerId(payment));
      }
    }

    return {
      ...this.sumSessions(sessions),
      sessionCount: sessions.length,
      playerCount: players.size,
      paymentCount,
    };
  }

  private buildSeries(
    sessions: ReportSessionRow[],
    range: ResolvedHostReportRange
  ) {
    const buckets = new Map<
      string,
      { bucket: string; income: number; collected: number; expenses: number }
    >();

    for (const session of sessions) {
      const key = bucketKey(sessionDate(session), range.granularity);
      const bucket = buckets.get(key) ?? {
        bucket: key,
        income: 0,
        collected: 0,
        expenses: 0,
      };

      for (const payment of session.paymentRecords) {
        bucket.income += payment.amount;
        if (payment.status === PaymentStatus.APPROVED) {
          bucket.collected += payment.amount;
        }
      }
      for (const expense of session.expenses) {
        bucket.expenses += expense.amount;
      }

      buckets.set(key, bucket);
    }

    return Array.from(buckets.values())
      .sort((a, b) => a.bucket.localeCompare(b.bucket))
      .map((bucket) => ({
        ...bucket,
        outstanding: bucket.income - bucket.collected,
        netActual: bucket.collected - bucket.expenses,
      }));
  }

  private buildBySession(sessions: ReportSessionRow[]) {
    return sessions.map((session) => {
      const players = new Set<string>();
      let income = 0;
      let collected = 0;

      for (const payment of session.paymentRecords) {
        players.add(this.resolvePayerId(payment));
        income += payment.amount;
        if (payment.status === PaymentStatus.APPROVED) {
          collected += payment.amount;
        }
      }

      const expenses = session.expenses.reduce(
        (sum, expense) => sum + expense.amount,
        0
      );

      return {
        sessionId: session.id,
        name: session.name,
        slug: session.slug,
        startTime: sessionDate(session).toISOString(),
        playerCount: players.size,
        income,
        collected,
        outstanding: income - collected,
        expenses,
        netActual: collected - expenses,
      };
    });
  }

  /** Same shape as `getHostTransactionSummary`, but scoped to the range and keeping the guest bucket. */
  private buildByPlayer(sessions: ReportSessionRow[]) {
    const byUser = new Map<
      string,
      {
        userId: string;
        userName: string;
        userImage?: string;
        sessionIds: Set<string>;
        totalAmount: number;
        paidAmount: number;
        pendingAmount: number;
      }
    >();

    for (const session of sessions) {
      for (const payment of session.paymentRecords) {
        const userId = this.resolvePayerId(payment);
        const existing = byUser.get(userId) ?? {
          userId,
          userName: payment.player.user?.name || 'Guest Player',
          userImage: payment.player.user?.image || undefined,
          sessionIds: new Set<string>(),
          totalAmount: 0,
          paidAmount: 0,
          pendingAmount: 0,
        };

        existing.sessionIds.add(session.id);
        existing.totalAmount += payment.amount;
        if (payment.status === PaymentStatus.APPROVED) {
          existing.paidAmount += payment.amount;
        } else {
          existing.pendingAmount += payment.amount;
        }

        byUser.set(userId, existing);
      }
    }

    return Array.from(byUser.values())
      .map(({ sessionIds, ...rest }) => ({
        ...rest,
        totalSessions: sessionIds.size,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }

  private resolvePayerId(payment: ReportSessionRow['paymentRecords'][number]) {
    return payment.player.userId || payment.registeredByUserId || GUEST_BUCKET;
  }
}
