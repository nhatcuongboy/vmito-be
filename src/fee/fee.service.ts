import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeeConfigDto, UpdateFeeConfigDto } from './dto';
import { FeeType, Gender, PaymentStatus } from '@prisma/client';

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

  constructor(private prisma: PrismaService) {}

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

    // Get player info
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        gender: true,
        createdByUserId: true,
      },
    });

    if (!player) return;

    // Calculate amount
    const amount = this.calculatePlayerFee(
      feeConfig,
      player.gender || Gender.MALE
    );

    // Check if payment record already exists
    const existing = await this.prisma.paymentRecord.findUnique({
      where: { playerId: player.id },
    });

    // Create payment record if not exists
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

  // Helper: Create payment records for all players in session
  private async createPaymentRecordsForSession(
    sessionId: string,
    hostId: string
  ) {
    const feeConfig = await this.prisma.sessionFeeConfig.findUnique({
      where: { sessionId },
    });

    if (!feeConfig) return;

    const players = await this.prisma.player.findMany({
      where: {
        sessionId,
        // Payment records created for all players, regardless of join status
      },
      select: {
        id: true,
        gender: true,
        createdByUserId: true,
      },
    });

    for (const player of players) {
      const amount = this.calculatePlayerFee(
        feeConfig,
        player.gender || Gender.MALE
      );

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
    const payments = await this.prisma.paymentRecord.findMany({
      where: { sessionId },
      include: { player: { select: { gender: true } } },
    });

    for (const payment of payments) {
      const newAmount = this.calculatePlayerFee(
        { feeType: FeeType.FIXED, ...feeConfig },
        payment.player.gender || Gender.MALE
      );

      if (payment.amount !== newAmount) {
        await this.prisma.paymentRecord.update({
          where: { id: payment.id },
          data: { amount: newAmount },
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
