import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FeeType,
  Gender,
  NotificationType,
  PaymentStatus,
  RegistrationStatus,
  SessionStatus,
} from '@prisma/client';
import { ClubsService } from '../clubs/clubs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsGateway } from '../sessions/sessions.gateway';
import { computeCostSplit } from './cost-split.calculator';
import { ApplyCostSplitDto } from './dto/apply-cost-split.dto';

const formatVnd = (amount: number) => `${amount.toLocaleString('vi-VN')}đ`;

type LoadedSession = Awaited<ReturnType<CostSplitService['loadSession']>>;
type LoadedPlayer = LoadedSession['players'][number];
type SplitRole = 'share' | 'paid' | 'club' | 'excluded';

@Injectable()
export class CostSplitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clubs: ClubsService,
    private readonly notifications: NotificationsService,
    private readonly gateway: SessionsGateway
  ) {}

  async getContext(sessionId: string, userId: string, role?: string) {
    const session = await this.loadSession(sessionId, userId, role);
    const clubFees = await this.loadClubFees(session);
    const fee = session.feeConfig;

    return {
      feeType: fee?.feeType ?? null,
      isApplied: fee?.splitMaleAmount != null,
      splitTotal: fee?.splitTotal ?? null,
      maleAmount: fee?.splitMaleAmount ?? null,
      femaleAmount: fee?.splitFemaleAmount ?? null,
      expenses: session.expenses,
      players: session.players.map((player) => ({
        playerId: player.id,
        displayName: player.name ?? player.user?.name ?? null,
        image: player.user?.image ?? null,
        gender: player.gender,
        paymentStatus: player.paymentRecord?.status ?? null,
        amount: player.paymentRecord?.amount ?? null,
        clubFeeAmount: clubFees.get(player.id) ?? null,
        isExcluded: this.isExcluded(player),
      })),
    };
  }

  async apply(
    sessionId: string,
    dto: ApplyCostSplitDto,
    userId: string,
    role?: string
  ) {
    const session = await this.loadSession(sessionId, userId, role);
    if (session.status === SessionStatus.CANCELLED || session.isCrawled) {
      throw new BadRequestException('Cost split is not available');
    }

    const fee = session.feeConfig;
    if (fee?.feeType === FeeType.FIXED && !dto.confirmFeeTypeChange) {
      throw new BadRequestException('Fee type change must be confirmed');
    }

    const total = session.expenses.reduce((sum, e) => sum + e.amount, 0);
    if (total <= 0) {
      throw new BadRequestException('No expenses to split');
    }

    const clubFees = await this.loadClubFees(session);
    const excluded = new Set(dto.excludedPlayerIds);
    const roles = new Map<string, SplitRole>(
      session.players.map((player) => [
        player.id,
        this.roleOf(player, clubFees, excluded),
      ])
    );
    const sharing = session.players.filter((p) => roles.get(p.id) === 'share');
    const femaleCount = sharing.filter(
      (p) => p.gender === Gender.FEMALE
    ).length;
    const lockedAmount = session.players.reduce((sum, player) => {
      const playerRole = roles.get(player.id);
      if (playerRole === 'paid')
        return sum + (player.paymentRecord?.amount ?? 0);
      if (playerRole === 'club') return sum + (clubFees.get(player.id) ?? 0);
      return sum;
    }, 0);

    const result = computeCostSplit({
      total,
      lockedAmount,
      maleCount: sharing.length - femaleCount,
      femaleCount,
      maleSurcharge: dto.maleSurcharge,
    });
    if (!result.isValid) {
      throw new BadRequestException('Nothing to split with these settings');
    }
    if (
      result.maleAmount !== dto.expectedMaleAmount ||
      result.femaleAmount !== dto.expectedFemaleAmount
    ) {
      // The roster or a payment moved after the host's last load. Applying
      // anyway would bill amounts they never saw.
      throw new ConflictException('Cost split is out of date');
    }

    const amountFor = (player: LoadedPlayer) => {
      switch (roles.get(player.id)) {
        case 'paid':
          return player.paymentRecord?.amount ?? 0;
        case 'club':
          return clubFees.get(player.id) ?? 0;
        case 'excluded':
          return 0;
        default:
          return player.gender === Gender.FEMALE
            ? result.femaleAmount
            : result.maleAmount;
      }
    };
    const collected = sharing.reduce((sum, p) => sum + amountFor(p), 0);
    const splitConfig = {
      splitTotal: total,
      splitPerPlayer: sharing.length
        ? Math.ceil(collected / sharing.length)
        : 0,
      splitMaleAmount: result.maleAmount,
      splitFemaleAmount: result.femaleAmount,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.sessionFeeConfig.upsert({
        where: { sessionId },
        create: { sessionId, feeType: FeeType.SPLIT_EVENLY, ...splitConfig },
        update: {
          feeType: FeeType.SPLIT_EVENLY,
          maleFee: null,
          femaleFee: null,
          ...splitConfig,
        },
      });

      for (const player of session.players) {
        const amount = amountFor(player);
        const playerRole = roles.get(player.id);
        const splitLocked = playerRole === 'paid' || playerRole === 'excluded';
        const existing = player.paymentRecord;

        if (!existing) {
          await tx.paymentRecord.create({
            data: {
              sessionId,
              playerId: player.id,
              hostId: session.hostId,
              registeredByUserId: player.createdByUserId,
              amount,
              splitLocked,
              status: PaymentStatus.PENDING,
            },
          });
          continue;
        }

        const isAmountChanged = existing.amount !== amount;
        // A proof under review was sent for the old amount.
        const shouldReset =
          isAmountChanged && existing.status === PaymentStatus.SUBMITTED;
        await tx.paymentRecord.update({
          where: { id: existing.id },
          data: {
            amount,
            splitLocked,
            ...(shouldReset && {
              status: PaymentStatus.PENDING,
              submittedAt: null,
            }),
          },
        });
      }

      await tx.player.updateMany({
        where: { sessionId, id: { in: [...clubFees.keys()] } },
        data: { clubFeeApplied: true },
      });
    });

    await this.notifyPayers(session, amountFor, roles);
    this.gateway.notifySessionUpdate(sessionId);

    return this.getContext(sessionId, userId, role);
  }

  private async loadSession(sessionId: string, userId: string, role?: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        name: true,
        hostId: true,
        status: true,
        isCrawled: true,
        startTime: true,
        feeConfig: true,
        expenses: {
          select: { id: true, name: true, amount: true },
          orderBy: { createdAt: 'asc' as const },
        },
        players: {
          // Pending and rejected players are never billed. PlayerStatus is
          // useless here: ending a session sets it to FINISHED for everyone.
          where: { registrationStatus: RegistrationStatus.APPROVED },
          orderBy: { playerNumber: 'asc' as const },
          select: {
            id: true,
            name: true,
            userId: true,
            createdByUserId: true,
            gender: true,
            isClubMember: true,
            clubId: true,
            user: { select: { name: true, image: true } },
            paymentRecord: {
              select: {
                id: true,
                amount: true,
                status: true,
                splitLocked: true,
              },
            },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }
    if (role !== 'ADMIN' && session.hostId !== userId) {
      throw new ForbiddenException('Only session host can split costs');
    }
    return session;
  }

  private async loadClubFees(session: LoadedSession) {
    const fees = new Map<string, number>();
    if (!session.startTime) return fees;

    for (const player of session.players) {
      if (!player.isClubMember || !player.clubId) continue;
      const fee = await this.clubs.getPerSessionFee(
        player.clubId,
        player.gender ?? Gender.MALE,
        session.startTime
      );
      if (fee !== null) fees.set(player.id, fee);
    }
    return fees;
  }

  private isExcluded(player: LoadedPlayer) {
    const payment = player.paymentRecord;
    return (
      !!payment?.splitLocked &&
      payment.amount === 0 &&
      payment.status !== PaymentStatus.APPROVED
    );
  }

  private roleOf(
    player: LoadedPlayer,
    clubFees: Map<string, number>,
    excluded: Set<string>
  ): SplitRole {
    // Order matters: money already collected cannot be excluded or re-billed.
    if (player.paymentRecord?.status === PaymentStatus.APPROVED) return 'paid';
    if (clubFees.has(player.id)) return 'club';
    if (excluded.has(player.id)) return 'excluded';
    return 'share';
  }

  private async notifyPayers(
    session: LoadedSession,
    amountFor: (player: LoadedPlayer) => number,
    roles: Map<string, SplitRole>
  ) {
    const owedByUser = new Map<string, number>();
    for (const player of session.players) {
      if (roles.get(player.id) !== 'share') continue;
      const amount = amountFor(player);
      if (amount <= 0 || amount === player.paymentRecord?.amount) continue;

      const payerId = player.userId ?? player.createdByUserId;
      if (!payerId) continue;
      owedByUser.set(payerId, (owedByUser.get(payerId) ?? 0) + amount);
    }

    await Promise.all(
      [...owedByUser].map(([payerId, amount]) =>
        this.notifications.createForUser(
          payerId,
          NotificationType.PAYMENT,
          'Đã có số tiền cần thanh toán',
          `Host đã chia tiền kèo ${session.name}: bạn cần đóng ${formatVnd(amount)}.`,
          {
            sessionId: session.id,
            sessionName: session.name,
            action: 'session_split_applied',
            amount,
          }
        )
      )
    );
  }
}
