import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  SubmitPaymentDto,
  ApprovePaymentDto,
  RejectPaymentDto,
  BulkApproveDto,
} from './dto';
import { PaymentStatus, FeeType } from '@prisma/client';

@Injectable()
export class PaymentsService {
  private readonly paymentSelect = {
    id: true,
    sessionId: true,
    playerId: true,
    registeredByUserId: true,
    hostId: true,
    amount: true,
    paymentMethod: true,
    status: true,
    proofImageUrl: true,
    proofNotes: true,
    hostNotes: true,
    submittedAt: true,
    approvedAt: true,
    rejectedAt: true,
    createdAt: true,
    updatedAt: true,
  };

  private readonly paymentWithPlayerSelect = {
    ...this.paymentSelect,
    player: {
      select: {
        id: true,
        name: true,
        gender: true,
        isClubMember: true,
        clubId: true,
        club: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    },
  };

  constructor(private prisma: PrismaService) {}

  // Get all payments for a session (host view)
  async findBySession(
    sessionId: string,
    userId: string,
    status?: PaymentStatus,
    role?: string
  ) {
    // Verify user is the host
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { hostId: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (role !== 'ADMIN' && session.hostId !== userId) {
      throw new ForbiddenException('Only session host can view payments');
    }

    const payments = await this.prisma.paymentRecord.findMany({
      where: {
        sessionId,
        ...(status ? { status } : {}),
      },
      select: this.paymentWithPlayerSelect,
      orderBy: { createdAt: 'asc' },
    });

    // Calculate stats
    const stats = {
      total: payments.length,
      pending: payments.filter((p) => p.status === PaymentStatus.PENDING)
        .length,
      submitted: payments.filter((p) => p.status === PaymentStatus.SUBMITTED)
        .length,
      approved: payments.filter((p) => p.status === PaymentStatus.APPROVED)
        .length,
      rejected: payments.filter((p) => p.status === PaymentStatus.REJECTED)
        .length,
      totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
      paidAmount: payments
        .filter((p) => p.status === PaymentStatus.APPROVED)
        .reduce((sum, p) => sum + p.amount, 0),
    };

    return { payments, stats };
  }

  // Get player's payments for a session
  async findMyPayments(sessionId: string, userId: string) {
    const payments = await this.prisma.paymentRecord.findMany({
      where: {
        sessionId,
        OR: [{ player: { userId } }, { registeredByUserId: userId }],
      },
      select: this.paymentWithPlayerSelect,
      orderBy: { createdAt: 'asc' },
    });

    return payments;
  }

  // Submit payment (mark as paid)
  async submit(paymentId: string, dto: SubmitPaymentDto, userId: string) {
    const payment = await this.prisma.paymentRecord.findUnique({
      where: { id: paymentId },
      include: {
        player: { select: { userId: true } },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    // Check if user is the player or the one who registered them
    const canSubmit =
      payment.player.userId === userId || payment.registeredByUserId === userId;

    if (!canSubmit) {
      throw new ForbiddenException(
        'Only the player or registrant can submit payment'
      );
    }

    // Check if payment can be submitted
    if (
      payment.status !== PaymentStatus.PENDING &&
      payment.status !== PaymentStatus.REJECTED
    ) {
      throw new BadRequestException(
        'Payment can only be submitted when status is PENDING or REJECTED'
      );
    }

    return this.prisma.paymentRecord.update({
      where: { id: paymentId },
      data: {
        paymentMethod: dto.paymentMethod,
        proofImageUrl: dto.proofImageUrl,
        proofNotes: dto.proofNotes,
        status: PaymentStatus.SUBMITTED,
        submittedAt: new Date(),
      },
      select: this.paymentSelect,
    });
  }

  // Approve payment (host)
  async approve(
    paymentId: string,
    dto: ApprovePaymentDto,
    userId: string,
    role?: string
  ) {
    const payment = await this.prisma.paymentRecord.findUnique({
      where: { id: paymentId },
      include: {
        session: { select: { hostId: true } },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    if (role !== 'ADMIN' && payment.session.hostId !== userId) {
      throw new ForbiddenException('Only session host can approve payments');
    }

    if (
      payment.status !== PaymentStatus.SUBMITTED &&
      payment.status !== PaymentStatus.PENDING &&
      payment.status !== PaymentStatus.APPROVED &&
      payment.status !== PaymentStatus.REJECTED
    ) {
      throw new BadRequestException(
        'Payment can only be approved when status is SUBMITTED, PENDING, APPROVED or REJECTED'
      );
    }

    return this.prisma.paymentRecord.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.APPROVED,
        hostNotes: dto.hostNotes,
        approvedAt:
          payment.status === PaymentStatus.APPROVED
            ? payment.approvedAt
            : new Date(),
        rejectedAt: null, // Clear rejection date if approving
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.paymentMethod !== undefined && {
          paymentMethod: dto.paymentMethod,
        }),
      },
      select: this.paymentSelect,
    });
  }

  // Reject payment (host)
  async reject(
    paymentId: string,
    dto: RejectPaymentDto,
    userId: string,
    role?: string
  ) {
    const payment = await this.prisma.paymentRecord.findUnique({
      where: { id: paymentId },
      include: {
        session: { select: { hostId: true } },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    if (role !== 'ADMIN' && payment.session.hostId !== userId) {
      throw new ForbiddenException('Only session host can reject payments');
    }

    if (
      payment.status !== PaymentStatus.SUBMITTED &&
      payment.status !== PaymentStatus.PENDING &&
      payment.status !== PaymentStatus.APPROVED &&
      payment.status !== PaymentStatus.REJECTED
    ) {
      throw new BadRequestException(
        'Payment can only be rejected when status is SUBMITTED, PENDING, APPROVED or REJECTED'
      );
    }

    return this.prisma.paymentRecord.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.REJECTED,
        hostNotes: dto.hostNotes,
        rejectedAt:
          payment.status === PaymentStatus.REJECTED
            ? payment.rejectedAt
            : new Date(),
        approvedAt: null, // Clear approval date if rejecting
      },
      select: this.paymentSelect,
    });
  }

  // Bulk approve payments
  async bulkApprove(dto: BulkApproveDto, userId: string, role?: string) {
    let approved = 0;
    let failed = 0;

    for (const paymentId of dto.paymentIds) {
      try {
        await this.approve(
          paymentId,
          { hostNotes: dto.hostNotes },
          userId,
          role
        );
        approved++;
      } catch {
        failed++;
      }
    }

    return { approved, failed };
  }

  // Get transaction summary for player (grouped by host)
  async getPlayerTransactionSummary(userId: string) {
    const payments = await this.prisma.paymentRecord.findMany({
      where: {
        OR: [{ player: { userId } }, { registeredByUserId: userId }],
      },
      select: {
        hostId: true,
        amount: true,
        status: true,
        session: {
          select: {
            host: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
      },
    });

    // Group by host
    const hostMap = new Map<
      string,
      {
        hostId: string;
        hostName: string;
        totalSessions: Set<string>;
        totalAmount: number;
        paidAmount: number;
        pendingAmount: number;
      }
    >();

    for (const payment of payments) {
      const hostId = payment.hostId;
      const hostName = payment.session.host.name;

      if (!hostMap.has(hostId)) {
        hostMap.set(hostId, {
          hostId,
          hostName,
          totalSessions: new Set(),
          totalAmount: 0,
          paidAmount: 0,
          pendingAmount: 0,
        });
      }

      const summary = hostMap.get(hostId)!;
      summary.totalSessions.add(payment.hostId);
      summary.totalAmount += payment.amount;

      if (payment.status === PaymentStatus.APPROVED) {
        summary.paidAmount += payment.amount;
      } else {
        summary.pendingAmount += payment.amount;
      }
    }

    return Array.from(hostMap.values()).map((s) => ({
      ...s,
      totalSessions: s.totalSessions.size,
    }));
  }

  // Get transaction summary for host (grouped by user)
  async getHostTransactionSummary(hostId: string) {
    const payments = await this.prisma.paymentRecord.findMany({
      where: { hostId },
      select: {
        amount: true,
        status: true,
        sessionId: true,
        registeredByUserId: true,
        player: {
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
      },
    });

    // Group by user
    const userMap = new Map<
      string,
      {
        userId: string;
        userName: string;
        userImage?: string;
        totalSessions: Set<string>;
        totalAmount: number;
        paidAmount: number;
        pendingAmount: number;
      }
    >();

    for (const payment of payments) {
      const userId =
        payment.player.userId || payment.registeredByUserId || 'guest';
      const user = payment.player.user;

      if (!userMap.has(userId)) {
        userMap.set(userId, {
          userId,
          userName: user?.name || 'Guest Player',
          userImage: user?.image || undefined,
          totalSessions: new Set(),
          totalAmount: 0,
          paidAmount: 0,
          pendingAmount: 0,
        });
      }

      const summary = userMap.get(userId)!;
      summary.totalSessions.add(payment.sessionId);
      summary.totalAmount += payment.amount;

      if (payment.status === PaymentStatus.APPROVED) {
        summary.paidAmount += payment.amount;
      } else {
        summary.pendingAmount += payment.amount;
      }
    }

    return Array.from(userMap.values()).map((s) => ({
      ...s,
      totalSessions: s.totalSessions.size,
    }));
  }

  // Get detailed transactions between player and specific host
  async getPlayerTransactionsWithHost(userId: string, hostId: string) {
    const host = await this.prisma.user.findUnique({
      where: { id: hostId },
      select: { id: true, name: true, image: true },
    });

    if (!host) {
      throw new NotFoundException('Host not found');
    }

    const payments = await this.prisma.paymentRecord.findMany({
      where: {
        hostId,
        OR: [{ player: { userId } }, { registeredByUserId: userId }],
      },
      select: {
        id: true,
        sessionId: true,
        amount: true,
        status: true,
        paymentMethod: true,
        submittedAt: true,
        approvedAt: true,
        rejectedAt: true,
        session: {
          select: {
            id: true,
            name: true,
            startTime: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate summary
    const summary = {
      totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
      paidAmount: payments
        .filter((p) => p.status === PaymentStatus.APPROVED)
        .reduce((sum, p) => sum + p.amount, 0),
      pendingAmount: payments
        .filter((p) => p.status !== PaymentStatus.APPROVED)
        .reduce((sum, p) => sum + p.amount, 0),
    };

    return {
      host,
      payments,
      summary,
    };
  }

  // Get detailed transactions between host and specific user
  async getHostTransactionsWithUser(hostId: string, targetUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, image: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const payments = await this.prisma.paymentRecord.findMany({
      where: {
        hostId,
        OR: [
          { player: { userId: targetUserId } },
          { registeredByUserId: targetUserId },
        ],
      },
      select: {
        id: true,
        sessionId: true,
        amount: true,
        status: true,
        paymentMethod: true,
        submittedAt: true,
        approvedAt: true,
        rejectedAt: true,
        session: {
          select: {
            id: true,
            name: true,
            startTime: true,
          },
        },
        player: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate summary
    const summary = {
      totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
      paidAmount: payments
        .filter((p) => p.status === PaymentStatus.APPROVED)
        .reduce((sum, p) => sum + p.amount, 0),
      pendingAmount: payments
        .filter((p) => p.status !== PaymentStatus.APPROVED)
        .reduce((sum, p) => sum + p.amount, 0),
    };

    return {
      user,
      payments,
      summary,
    };
  }

  // Set split amount for a session (SPLIT_EVENLY fee type)
  async setSplitAmount(
    sessionId: string,
    totalAmount: number,
    userId: string,
    role?: string
  ) {
    // Verify session exists and user is the host
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, hostId: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (role !== 'ADMIN' && session.hostId !== userId) {
      throw new ForbiddenException('Only session host can set split amount');
    }

    // Verify session has SPLIT_EVENLY fee config
    const feeConfig = await this.prisma.sessionFeeConfig.findUnique({
      where: { sessionId },
      select: { feeType: true },
    });

    if (!feeConfig) {
      throw new NotFoundException('Fee config not found');
    }

    if (feeConfig.feeType !== FeeType.SPLIT_EVENLY) {
      throw new BadRequestException(
        'Can only set split amount for SPLIT_EVENLY fee type'
      );
    }

    // Count joined players
    const playerCount = await this.prisma.player.count({
      where: {
        sessionId,
        isJoined: true,
      },
    });

    if (playerCount === 0) {
      throw new BadRequestException('No players in session');
    }

    // Calculate amount per player
    const amountPerPlayer = Math.ceil(totalAmount / playerCount);

    // Update fee config
    await this.prisma.sessionFeeConfig.update({
      where: { sessionId },
      data: {
        splitTotal: totalAmount,
        splitPerPlayer: amountPerPlayer,
      },
    });

    // Update all payment records
    await this.prisma.paymentRecord.updateMany({
      where: { sessionId },
      data: { amount: amountPerPlayer },
    });

    // Return updated payments
    return this.prisma.paymentRecord.findMany({
      where: { sessionId },
      select: this.paymentWithPlayerSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  // Get payment statistics for a session
  async getSessionStats(sessionId: string, userId: string, role?: string) {
    // Verify session exists
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, hostId: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Only host can view stats
    if (role !== 'ADMIN' && session.hostId !== userId) {
      throw new ForbiddenException('Only session host can view payment stats');
    }

    // Get all payments for session
    const payments = await this.prisma.paymentRecord.findMany({
      where: { sessionId },
      select: {
        id: true,
        amount: true,
        status: true,
      },
    });

    // Calculate stats
    const stats = {
      totalPlayers: payments.length,
      totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
      paidAmount: payments
        .filter((p) => p.status === PaymentStatus.APPROVED)
        .reduce((sum, p) => sum + p.amount, 0),
      pendingAmount: payments
        .filter((p) => p.status !== PaymentStatus.APPROVED)
        .reduce((sum, p) => sum + p.amount, 0),
      pendingCount: payments.filter((p) => p.status === PaymentStatus.PENDING)
        .length,
      submittedCount: payments.filter(
        (p) => p.status === PaymentStatus.SUBMITTED
      ).length,
      approvedCount: payments.filter((p) => p.status === PaymentStatus.APPROVED)
        .length,
      rejectedCount: payments.filter((p) => p.status === PaymentStatus.REJECTED)
        .length,
    };

    return stats;
  }
}
