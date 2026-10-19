import { Injectable } from '@nestjs/common';
import {
  PaymentStatus,
  RegistrationStatus,
  SessionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Session fees the user still has to pay (PENDING, or REJECTED by the host
 * and needing a resubmit). SUBMITTED is excluded: the user already paid and
 * is only waiting for the host to confirm.
 */
@Injectable()
export class MyUnpaidPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(userId: string) {
    const payments = await this.prisma.paymentRecord.findMany({
      where: {
        OR: [{ player: { userId } }, { registeredByUserId: userId }],
        status: { in: [PaymentStatus.PENDING, PaymentStatus.REJECTED] },
        amount: { gt: 0 },
        player: { registrationStatus: RegistrationStatus.APPROVED },
        session: {
          status: { not: SessionStatus.CANCELLED },
          cancelledAt: null,
        },
      },
      select: {
        id: true,
        sessionId: true,
        playerId: true,
        amount: true,
        status: true,
        createdAt: true,
        hostNotes: true,
        session: {
          select: {
            id: true,
            name: true,
            startTime: true,
            scheduledStartTime: true,
            status: true,
            host: { select: { id: true, name: true, image: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
      count: payments.length,
      items: payments,
    };
  }
}
