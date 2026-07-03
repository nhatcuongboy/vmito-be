import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeeConfigDto, UpdateFeeConfigDto } from './dto';
import {
  FeeType,
  Gender,
  PaymentStatus,
  RegistrationStatus,
} from '@prisma/client';
import { ClubsService } from '../clubs/clubs.service';

@Injectable()
export class FeeService {
  private readonly feeConfigSelect = {
    id: true,
    sessionId: true,
    feeType: true,
    maleFee: true,
    femaleFee: true,
    splitTotal: true,
    splitPerPlayer: true,
    notes: true,
    createdAt: true,
    updatedAt: true,
  };

  constructor(
    private prisma: PrismaService,
    private clubsService: ClubsService
  ) {}

  async findBySessionId(sessionId: string) {
    return this.prisma.sessionFeeConfig.findUnique({
      where: { sessionId },
      select: this.feeConfigSelect,
    });
  }

  async create(
    sessionId: string,
    dto: CreateFeeConfigDto,
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
      throw new ForbiddenException('Only session host can create fee config');
    }

    // Check if fee config already exists
    const existing = await this.prisma.sessionFeeConfig.findUnique({
      where: { sessionId },
    });

    if (existing) {
      throw new ConflictException('Fee config already exists for this session');
    }

    // Validate DTO based on fee type
    if (dto.feeType === FeeType.FIXED) {
      if (!dto.maleFee && !dto.femaleFee) {
        throw new BadRequestException(
          'At least one of maleFee or femaleFee is required for FIXED fee type'
        );
      }
    }

    // Create fee config
    const feeConfig = await this.prisma.sessionFeeConfig.create({
      data: {
        sessionId,
        feeType: dto.feeType,
        maleFee: dto.maleFee,
        femaleFee: dto.femaleFee,
        notes: dto.notes,
      },
      select: this.feeConfigSelect,
    });

    // Create payment records for existing players if FIXED fee type
    if (dto.feeType === FeeType.FIXED) {
      await this.createPaymentRecordsForSession(sessionId, session.hostId);
    }

    return feeConfig;
  }

  async update(
    sessionId: string,
    dto: UpdateFeeConfigDto,
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
      throw new ForbiddenException('Only session host can update fee config');
    }

    // Check if fee config exists
    const existing = await this.prisma.sessionFeeConfig.findUnique({
      where: { sessionId },
    });

    if (!existing) {
      throw new NotFoundException('Fee config not found');
    }

    const newFeeType = dto.feeType || existing.feeType;

    // Update fee config
    const feeConfig = await this.prisma.sessionFeeConfig.update({
      where: { sessionId },
      data: {
        feeType: dto.feeType,
        maleFee: dto.maleFee,
        femaleFee: dto.femaleFee,
        splitTotal: dto.splitTotal,
        notes: dto.notes,
        // Calculate split per player if setting split total
        splitPerPlayer: dto.splitTotal
          ? await this.calculateSplitPerPlayer(sessionId, dto.splitTotal)
          : undefined,
      },
      select: this.feeConfigSelect,
    });

    // Update payment records if fee amounts changed
    if (newFeeType === FeeType.FIXED) {
      await this.updatePaymentAmounts(sessionId, feeConfig);
    } else if (dto.splitTotal && feeConfig.splitPerPlayer) {
      await this.updateSplitPaymentAmounts(sessionId, feeConfig.splitPerPlayer);
    }

    return feeConfig;
  }

  async delete(sessionId: string, userId: string, role?: string) {
    // Verify session exists and user is the host
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, hostId: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (role !== 'ADMIN' && session.hostId !== userId) {
      throw new ForbiddenException('Only session host can delete fee config');
    }

    // Check if fee config exists
    const existing = await this.prisma.sessionFeeConfig.findUnique({
      where: { sessionId },
    });

    if (!existing) {
      throw new NotFoundException('Fee config not found');
    }

    // Delete fee config (cascades to payment records)
    await this.prisma.sessionFeeConfig.delete({
      where: { sessionId },
    });

    // Also delete payment records
    await this.prisma.paymentRecord.deleteMany({
      where: { sessionId },
    });

    return { message: 'Fee config deleted successfully' };
  }

  // Public helper: Create payment record for a single player
  async createPaymentRecordForPlayer(
    sessionId: string,
    playerId: string,
    hostId: string
  ): Promise<void> {
    // Check if session has fee config
    const feeConfig = await this.prisma.sessionFeeConfig.findUnique({
      where: { sessionId },
      select: {
        feeType: true,
        maleFee: true,
        femaleFee: true,
        splitPerPlayer: true,
      },
    });

    // No fee config, no payment record needed
    if (!feeConfig) return;

    // Get session for date lookup
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { startTime: true },
    });

    if (!session) return;

    // Get player info including fixed member status
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        gender: true,
        userId: true,
        createdByUserId: true,
        isClubMember: true,
        clubId: true,
      },
    });

    if (!player) return;

    const { amount, clubFeeApplied } =
      await this.calculatePaymentAmountForPlayer(feeConfig, player, session);
    await this.syncPlayerClubFeeApplied(player.id, clubFeeApplied);

    // Check if payment record already exists
    const existing = await this.prisma.paymentRecord.findUnique({
      where: { playerId: player.id },
    });

    // Create or update payment record
    if (!existing) {
      await this.prisma.paymentRecord.create({
        data: {
          sessionId,
          playerId: player.id,
          hostId,
          registeredByUserId: player.createdByUserId,
          amount,
          status: PaymentStatus.PENDING,
        },
      });
    } else if (existing.amount !== amount) {
      // Update amount if it has changed (e.g., player became a fixed member).
      // Reset approval status since the previously approved amount is no longer valid.
      const shouldResetStatus =
        existing.status === PaymentStatus.APPROVED ||
        existing.status === PaymentStatus.SUBMITTED;

      await this.prisma.paymentRecord.update({
        where: { id: existing.id },
        data: {
          amount,
          ...(shouldResetStatus && {
            status: PaymentStatus.PENDING,
            submittedAt: null,
            approvedAt: null,
            rejectedAt: null,
          }),
        },
      });
    }
  }

  /**
   * Recalculate and update the payment record for a single player
   */
  async recalculatePlayerPayment(
    sessionId: string,
    playerId: string
  ): Promise<void> {
    const feeConfig = await this.prisma.sessionFeeConfig.findUnique({
      where: { sessionId },
    });

    if (!feeConfig) return;

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { startTime: true },
    });

    if (!session) return;

    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        gender: true,
        userId: true,
        isClubMember: true,
        clubId: true,
      },
    });

    if (!player) return;

    const { amount: newAmount, clubFeeApplied } =
      await this.calculatePaymentAmountForPlayer(feeConfig, player, session);
    await this.syncPlayerClubFeeApplied(player.id, clubFeeApplied);

    const payment = await this.prisma.paymentRecord.findUnique({
      where: { playerId: player.id },
    });

    if (payment && payment.amount !== newAmount) {
      // When the fee amount changes, the previous approval/submission is no longer
      // valid for the new amount. Reset back to PENDING so the host must re-approve.
      const shouldResetStatus =
        payment.status === PaymentStatus.APPROVED ||
        payment.status === PaymentStatus.SUBMITTED;

      await this.prisma.paymentRecord.update({
        where: { id: payment.id },
        data: {
          amount: newAmount,
          ...(shouldResetStatus && {
            status: PaymentStatus.PENDING,
            submittedAt: null,
            approvedAt: null,
            rejectedAt: null,
          }),
        },
      });
    }
  }

  /**
   * Recalculate all payment records for a session based on latest fee config
   * This will apply the latest club fee config for monthly members
   */
  async recalculateAllPayments(
    sessionId: string,
    userId: string,
    role?: string
  ): Promise<{ updated: number; message: string }> {
    // Verify session exists and user is the host
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, hostId: true, startTime: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (role !== 'ADMIN' && session.hostId !== userId) {
      throw new ForbiddenException(
        'Only session host can recalculate payments'
      );
    }

    // Check if fee config exists
    const feeConfig = await this.prisma.sessionFeeConfig.findUnique({
      where: { sessionId },
    });

    if (!feeConfig) {
      throw new NotFoundException('Fee config not found for this session');
    }

    // Get all payment records with player info
    const payments = await this.prisma.paymentRecord.findMany({
      where: { sessionId },
      include: {
        player: {
          select: {
            id: true,
            gender: true,
            userId: true,
            isClubMember: true,
            clubId: true,
          },
        },
      },
    });

    let updatedCount = 0;

    // Recalculate each payment
    for (const payment of payments) {
      const { amount: newAmount, clubFeeApplied } =
        await this.calculatePaymentAmountForPlayer(
          feeConfig,
          payment.player,
          session
        );
      await this.syncPlayerClubFeeApplied(payment.player.id, clubFeeApplied);

      if (payment.amount !== newAmount) {
        const shouldResetStatus =
          payment.status === PaymentStatus.APPROVED ||
          payment.status === PaymentStatus.SUBMITTED;

        await this.prisma.paymentRecord.update({
          where: { id: payment.id },
          data: {
            amount: newAmount,
            ...(shouldResetStatus && {
              status: PaymentStatus.PENDING,
              submittedAt: null,
              approvedAt: null,
              rejectedAt: null,
            }),
          },
        });

        updatedCount++;
      }
    }

    return {
      updated: updatedCount,
      message: `Successfully recalculated ${updatedCount} payment(s)`,
    };
  }

  // Helper: Calculate fee for a player based on gender
  calculatePlayerFee(
    feeConfig: {
      feeType: FeeType;
      maleFee?: number | null;
      femaleFee?: number | null;
      splitPerPlayer?: number | null;
    },
    gender: Gender
  ): number {
    if (feeConfig.feeType === FeeType.SPLIT_EVENLY) {
      return feeConfig.splitPerPlayer || 0;
    }

    if (gender === Gender.FEMALE) {
      return feeConfig.femaleFee || feeConfig.maleFee || 0;
    }

    return feeConfig.maleFee || feeConfig.femaleFee || 0;
  }

  private async calculatePaymentAmountForPlayer(
    feeConfig: {
      feeType: FeeType;
      maleFee?: number | null;
      femaleFee?: number | null;
      splitPerPlayer?: number | null;
    },
    player: {
      id: string;
      gender?: Gender | null;
      isClubMember?: boolean;
      clubId?: string | null;
    },
    session: { startTime?: Date | null }
  ): Promise<{ amount: number; clubFeeApplied: boolean }> {
    const gender = player.gender || Gender.MALE;
    const fallbackAmount = this.calculatePlayerFee(feeConfig, gender);

    // Priority 1: Club fixed fee — applies to any player assigned to a club
    // that has a per-session fee configured for the session's month.
    if (player.isClubMember && player.clubId && session.startTime) {
      const fixedMemberFee = await this.clubsService.getPerSessionFee(
        player.clubId,
        gender,
        session.startTime
      );

      if (fixedMemberFee !== null) {
        return {
          amount: fixedMemberFee,
          clubFeeApplied: true,
        };
      }
    }

    // Priority 2: Session default fee
    return { amount: fallbackAmount, clubFeeApplied: false };
  }

  private async syncPlayerClubFeeApplied(
    playerId: string,
    clubFeeApplied: boolean
  ) {
    await this.prisma.player.update({
      where: { id: playerId },
      data: { clubFeeApplied },
    });
  }

  // Helper: Create payment records for all players in session
  private async createPaymentRecordsForSession(
    sessionId: string,
    hostId: string
  ) {
    const feeConfig = await this.prisma.sessionFeeConfig.findUnique({
      where: { sessionId },
    });

    if (!feeConfig) return;

    // Get session to access session date for fixed member fee lookup
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { startTime: true },
    });

    if (!session) return;

    const players = await this.prisma.player.findMany({
      where: {
        sessionId,
        // Exclude players the host rejected — they must not be billed.
        registrationStatus: { not: RegistrationStatus.REJECTED },
      },
      select: {
        id: true,
        gender: true,
        userId: true,
        createdByUserId: true,
        isClubMember: true,
        clubId: true,
      },
    });

    for (const player of players) {
      const { amount, clubFeeApplied } =
        await this.calculatePaymentAmountForPlayer(feeConfig, player, session);
      await this.syncPlayerClubFeeApplied(player.id, clubFeeApplied);

      // Check if payment record already exists
      const existing = await this.prisma.paymentRecord.findUnique({
        where: { playerId: player.id },
      });

      if (!existing) {
        await this.prisma.paymentRecord.create({
          data: {
            sessionId,
            playerId: player.id,
            hostId,
            registeredByUserId: player.createdByUserId,
            amount,
            status: PaymentStatus.PENDING,
          },
        });
      }
    }
  }

  // Helper: Update payment amounts when fee config changes
  private async updatePaymentAmounts(
    sessionId: string,
    feeConfig: { maleFee?: number | null; femaleFee?: number | null }
  ) {
    // Get session for date lookup
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { startTime: true },
    });

    if (!session) return;

    const payments = await this.prisma.paymentRecord.findMany({
      where: { sessionId },
      include: {
        player: {
          select: {
            id: true,
            gender: true,
            userId: true,
            isClubMember: true,
            clubId: true,
          },
        },
      },
    });

    for (const payment of payments) {
      const { amount: newAmount, clubFeeApplied } =
        await this.calculatePaymentAmountForPlayer(
          { feeType: FeeType.FIXED, ...feeConfig },
          payment.player,
          session
        );
      await this.syncPlayerClubFeeApplied(payment.player.id, clubFeeApplied);

      if (payment.amount !== newAmount) {
        const shouldResetStatus =
          payment.status === PaymentStatus.APPROVED ||
          payment.status === PaymentStatus.SUBMITTED;

        await this.prisma.paymentRecord.update({
          where: { id: payment.id },
          data: {
            amount: newAmount,
            ...(shouldResetStatus && {
              status: PaymentStatus.PENDING,
              submittedAt: null,
              approvedAt: null,
              rejectedAt: null,
            }),
          },
        });
      }
    }
  }

  // Helper: Calculate split per player
  private async calculateSplitPerPlayer(
    sessionId: string,
    splitTotal: number
  ): Promise<number> {
    const playerCount = await this.prisma.player.count({
      where: {
        sessionId,
        isJoined: true,
      },
    });

    if (playerCount === 0) return 0;

    return Math.ceil(splitTotal / playerCount);
  }

  // Helper: Update split payment amounts
  private async updateSplitPaymentAmounts(
    sessionId: string,
    splitPerPlayer: number
  ) {
    await this.prisma.paymentRecord.updateMany({
      where: { sessionId },
      data: { amount: splitPerPlayer },
    });
  }
}
