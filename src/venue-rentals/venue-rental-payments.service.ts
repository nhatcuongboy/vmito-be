import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  Role,
  VenueRentalAllocationStatus,
  VenueRentalDepositMode,
  VenueRentalEventType,
  VenueRentalPaymentMethod,
  VenueRentalStatus,
  VenueRentalTransactionDirection,
  VenueRentalTransactionPurpose,
  VenueRentalTransactionStatus,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { VenueAccessService } from '../venues/venue-access.service';
import {
  CompleteRentalRefundDto,
  RecordRentalCashPaymentDto,
  RejectRentalPaymentDto,
  SubmitRentalPaymentDto,
  UpdateRentalPaymentSettingsDto,
} from './dto/venue-rental-payment.dto';

type PaymentSettings = {
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  qrUrl: string | null;
  qrPublicId: string | null;
  depositMode: VenueRentalDepositMode;
  depositValue: number;
  depositDeadlineMinutes: number;
  balanceDueHours: number;
  refundCutoffHours: number;
  refundBeforePercent: number;
  refundAfterPercent: number;
};

const DEFAULT_SETTINGS: PaymentSettings = {
  bankName: null,
  bankAccountNumber: null,
  bankAccountName: null,
  qrUrl: null,
  qrPublicId: null,
  depositMode: VenueRentalDepositMode.NONE,
  depositValue: 0,
  depositDeadlineMinutes: 30,
  balanceDueHours: 2,
  refundCutoffHours: 24,
  refundBeforePercent: 100,
  refundAfterPercent: 0,
};

export function calculateRentalDeposit(
  totalAmount: number,
  mode: VenueRentalDepositMode,
  value: number
) {
  if (mode === VenueRentalDepositMode.NONE) return 0;
  const calculated =
    mode === VenueRentalDepositMode.PERCENTAGE
      ? Math.ceil((totalAmount * value) / 100)
      : value;
  return Math.min(totalAmount, calculated);
}

export function calculateRentalRefund(
  approvedPaid: number,
  isRequesterCancellation: boolean,
  startTime: Date,
  cancelledAt: Date,
  cutoffHours: number,
  beforePercent: number,
  afterPercent: number
) {
  if (!approvedPaid) return 0;
  if (!isRequesterCancellation) return approvedPaid;
  const cutoff = new Date(startTime.getTime() - cutoffHours * 3_600_000);
  const percent = cancelledAt < cutoff ? beforePercent : afterPercent;
  return Math.floor((approvedPaid * percent) / 100);
}

@Injectable()
export class VenueRentalPaymentsService {
  private readonly logger = new Logger(VenueRentalPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: VenueAccessService,
    private readonly notifications: NotificationsService
  ) {}

  async getSettings(venueId: string, userId: string, role: string) {
    await this.access.assertManager(venueId, userId, role);
    await this.access.ensureVenue(venueId);
    const settings = await this.prisma.venueRentalPaymentSettings.findUnique({
      where: { venueId },
    });
    return settings || { venueId, ...DEFAULT_SETTINGS };
  }

  async updateSettings(
    venueId: string,
    dto: UpdateRentalPaymentSettingsDto,
    userId: string,
    role: string
  ) {
    await this.access.assertOwner(venueId, userId, role);
    await this.access.ensureVenue(venueId);
    const current = await this.prisma.venueRentalPaymentSettings.findUnique({
      where: { venueId },
    });
    const clean = (value: string | undefined) =>
      value === undefined ? undefined : value.trim() || null;
    const merged: PaymentSettings = {
      bankName:
        dto.bankName !== undefined
          ? clean(dto.bankName) || null
          : current?.bankName || null,
      bankAccountNumber:
        dto.bankAccountNumber !== undefined
          ? clean(dto.bankAccountNumber) || null
          : current?.bankAccountNumber || null,
      bankAccountName:
        dto.bankAccountName !== undefined
          ? clean(dto.bankAccountName) || null
          : current?.bankAccountName || null,
      qrUrl:
        dto.qrUrl !== undefined
          ? clean(dto.qrUrl) || null
          : current?.qrUrl || null,
      qrPublicId:
        dto.qrPublicId !== undefined
          ? clean(dto.qrPublicId) || null
          : current?.qrPublicId || null,
      depositMode:
        dto.depositMode ?? current?.depositMode ?? DEFAULT_SETTINGS.depositMode,
      depositValue:
        dto.depositValue ??
        current?.depositValue ??
        DEFAULT_SETTINGS.depositValue,
      depositDeadlineMinutes:
        dto.depositDeadlineMinutes ??
        current?.depositDeadlineMinutes ??
        DEFAULT_SETTINGS.depositDeadlineMinutes,
      balanceDueHours:
        dto.balanceDueHours ??
        current?.balanceDueHours ??
        DEFAULT_SETTINGS.balanceDueHours,
      refundCutoffHours:
        dto.refundCutoffHours ??
        current?.refundCutoffHours ??
        DEFAULT_SETTINGS.refundCutoffHours,
      refundBeforePercent:
        dto.refundBeforePercent ??
        current?.refundBeforePercent ??
        DEFAULT_SETTINGS.refundBeforePercent,
      refundAfterPercent:
        dto.refundAfterPercent ??
        current?.refundAfterPercent ??
        DEFAULT_SETTINGS.refundAfterPercent,
    };
    if (merged.depositMode === VenueRentalDepositMode.NONE) {
      merged.depositValue = 0;
    } else {
      if (
        !merged.bankName ||
        !merged.bankAccountNumber ||
        !merged.bankAccountName
      ) {
        throw new BadRequestException(
          'Bank recipient information is required when deposits are enabled'
        );
      }
      if (
        merged.depositMode === VenueRentalDepositMode.PERCENTAGE &&
        (merged.depositValue < 1 || merged.depositValue > 100)
      ) {
        throw new BadRequestException(
          'Percentage depositValue must be between 1 and 100'
        );
      }
      if (
        merged.depositMode === VenueRentalDepositMode.FIXED &&
        merged.depositValue < 1
      ) {
        throw new BadRequestException('Fixed depositValue must be positive');
      }
    }
    return this.prisma.venueRentalPaymentSettings.upsert({
      where: { venueId },
      create: { venueId, ...merged },
      update: merged,
    });
  }

  async buildSnapshot(
    tx: Prisma.TransactionClient,
    venueId: string,
    totalAmount: number,
    startTime: Date,
    acceptedAt: Date,
    forceNoDeposit = false
  ) {
    const stored = await tx.venueRentalPaymentSettings.findUnique({
      where: { venueId },
    });
    const settings: PaymentSettings = stored || DEFAULT_SETTINGS;
    const depositMode = forceNoDeposit
      ? VenueRentalDepositMode.NONE
      : settings.depositMode;
    const depositValue = forceNoDeposit ? 0 : settings.depositValue;
    const depositAmount = calculateRentalDeposit(
      totalAmount,
      depositMode,
      depositValue
    );
    const balanceDueCandidate = new Date(
      startTime.getTime() - settings.balanceDueHours * 3_600_000
    );
    return {
      paymentDepositMode: depositMode,
      paymentDepositValue: depositValue,
      paymentDepositDeadlineMinutes: settings.depositDeadlineMinutes,
      paymentBalanceDueHours: settings.balanceDueHours,
      paymentRefundCutoffHours: settings.refundCutoffHours,
      paymentRefundBeforePercent: settings.refundBeforePercent,
      paymentRefundAfterPercent: settings.refundAfterPercent,
      paymentBankName: settings.bankName,
      paymentBankAccountNumber: settings.bankAccountNumber,
      paymentBankAccountName: settings.bankAccountName,
      paymentQrUrl: settings.qrUrl,
      paymentQrPublicId: settings.qrPublicId,
      depositAmount,
      balanceAmount: totalAmount - depositAmount,
      depositDueAt: depositAmount
        ? new Date(
            acceptedAt.getTime() + settings.depositDeadlineMinutes * 60_000
          )
        : null,
      balanceDueAt:
        balanceDueCandidate > acceptedAt ? balanceDueCandidate : acceptedAt,
    };
  }

  async getSummary(id: string, userId: string, role: string) {
    const request = await this.prisma.venueRentalRequest.findUnique({
      where: { id },
      include: {
        transactions: {
          orderBy: { createdAt: 'asc' },
          include: {
            submittedBy: { select: { id: true, name: true, image: true } },
            processedBy: { select: { id: true, name: true, image: true } },
          },
        },
      },
    });
    if (!request) throw new NotFoundException('Venue rental request not found');
    await this.assertRequestAccess(request, userId, role);
    const approvedIn = this.sumTransactions(
      request.transactions,
      undefined,
      VenueRentalTransactionStatus.APPROVED,
      VenueRentalTransactionDirection.IN
    );
    const depositPaid = this.sumTransactions(
      request.transactions,
      VenueRentalTransactionPurpose.DEPOSIT,
      VenueRentalTransactionStatus.APPROVED
    );
    const balancePaid = this.sumTransactions(
      request.transactions,
      VenueRentalTransactionPurpose.BALANCE,
      VenueRentalTransactionStatus.APPROVED
    );
    const refunded = this.sumTransactions(
      request.transactions,
      VenueRentalTransactionPurpose.REFUND,
      VenueRentalTransactionStatus.APPROVED
    );
    const now = new Date();
    const balanceRequired = request.balanceAmount || 0;
    const balanceStatus =
      balancePaid >= balanceRequired
        ? 'PAID'
        : request.balanceDueAt && request.balanceDueAt <= now
          ? 'OVERDUE'
          : request.transactions.some(
                (item) =>
                  item.purpose === VenueRentalTransactionPurpose.BALANCE &&
                  item.status === VenueRentalTransactionStatus.SUBMITTED
              )
            ? 'SUBMITTED'
            : 'UNPAID';
    const createdRefund = request.transactions.find(
      (item) =>
        item.purpose === VenueRentalTransactionPurpose.REFUND &&
        item.status !== VenueRentalTransactionStatus.CANCELLED
    );
    const refundEstimate =
      request.status === VenueRentalStatus.CANCELLED && createdRefund
        ? createdRefund.amount
        : request.confirmedStartTime && request.paymentRefundCutoffHours != null
          ? calculateRentalRefund(
              approvedIn,
              true,
              request.confirmedStartTime,
              now,
              request.paymentRefundCutoffHours,
              request.paymentRefundBeforePercent || 0,
              request.paymentRefundAfterPercent || 0
            )
          : 0;
    return {
      rentalRequestId: id,
      status: request.status,
      currency: request.confirmedCurrency || 'VND',
      totalAmount: request.confirmedAmount || 0,
      depositAmount: request.depositAmount || 0,
      depositPaid,
      depositDueAt: request.depositDueAt,
      balanceAmount: balanceRequired,
      balancePaid,
      balanceDueAt: request.balanceDueAt,
      balanceStatus,
      totalPaid: approvedIn,
      refunded,
      outstanding: Math.max(0, (request.confirmedAmount || 0) - approvedIn),
      refundEstimate,
      recipient: {
        bankName: request.paymentBankName,
        bankAccountNumber: request.paymentBankAccountNumber,
        bankAccountName: request.paymentBankAccountName,
        qrUrl: request.paymentQrUrl,
        qrPublicId: request.paymentQrPublicId,
      },
      transactions: request.transactions,
    };
  }

  async submitPayment(id: string, dto: SubmitRentalPaymentDto, userId: string) {
    if (dto.purpose === VenueRentalTransactionPurpose.REFUND) {
      throw new BadRequestException('Renters cannot submit refunds');
    }
    const request = await this.getRequest(id);
    if (request.requesterId !== userId) {
      throw new ForbiddenException('Rental requester access required');
    }
    const payment = await this.prisma.$transaction(async (tx) => {
      await this.lockRequest(tx, id);
      const locked = await tx.venueRentalRequest.findUnique({ where: { id } });
      if (!locked)
        throw new NotFoundException('Venue rental request not found');
      this.assertPayable(locked, dto.purpose);
      await this.assertAmountAvailable(
        tx,
        locked,
        dto.purpose,
        dto.amount,
        true
      );
      const created = await tx.venueRentalTransaction.create({
        data: {
          requestId: id,
          purpose: dto.purpose,
          direction: VenueRentalTransactionDirection.IN,
          method: VenueRentalPaymentMethod.BANK_TRANSFER,
          status: VenueRentalTransactionStatus.SUBMITTED,
          amount: dto.amount,
          currency: locked.confirmedCurrency || 'VND',
          proofUrl: dto.proofUrl.trim(),
          proofPublicId: dto.proofPublicId?.trim() || null,
          notes: dto.notes?.trim() || null,
          submittedByUserId: userId,
          submittedAt: new Date(),
        },
      });
      await this.createEvent(
        tx,
        id,
        userId,
        VenueRentalEventType.PAYMENT_SUBMITTED,
        {
          paymentId: created.id,
          purpose: created.purpose,
          amount: created.amount,
        }
      );
      return created;
    });
    this.logPayment('submitted', payment);
    await this.notifyManagers(
      request.venueId,
      'Có giao dịch thuê sân mới',
      'Người thuê đã gửi chứng từ thanh toán.',
      id
    );
    return payment;
  }

  async recordCash(
    id: string,
    dto: RecordRentalCashPaymentDto,
    userId: string,
    role: string
  ) {
    if (dto.purpose === VenueRentalTransactionPurpose.REFUND) {
      throw new BadRequestException('Use the refund completion endpoint');
    }
    const request = await this.getRequest(id);
    await this.access.assertManager(request.venueId, userId, role);
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockRequest(tx, id);
      const locked = await tx.venueRentalRequest.findUnique({ where: { id } });
      if (!locked)
        throw new NotFoundException('Venue rental request not found');
      this.assertPayable(locked, dto.purpose);
      await this.assertAmountAvailable(
        tx,
        locked,
        dto.purpose,
        dto.amount,
        false
      );
      const now = new Date();
      const payment = await tx.venueRentalTransaction.create({
        data: {
          requestId: id,
          purpose: dto.purpose,
          direction: VenueRentalTransactionDirection.IN,
          method: VenueRentalPaymentMethod.CASH,
          status: VenueRentalTransactionStatus.APPROVED,
          amount: dto.amount,
          currency: locked.confirmedCurrency || 'VND',
          notes: dto.notes?.trim() || null,
          submittedByUserId: userId,
          processedByUserId: userId,
          submittedAt: now,
          approvedAt: now,
        },
      });
      const confirmed = await this.confirmIfDepositSatisfied(
        tx,
        locked,
        userId
      );
      await this.createEvent(
        tx,
        id,
        userId,
        VenueRentalEventType.PAYMENT_APPROVED,
        {
          paymentId: payment.id,
          purpose: payment.purpose,
          amount: payment.amount,
        }
      );
      return { payment, confirmed };
    });
    this.logPayment('approved', result.payment);
    await this.notifyRequester(
      request.requesterId,
      result.confirmed
        ? 'Đặt cọc đã được duyệt'
        : 'Thanh toán đã được ghi nhận',
      result.confirmed
        ? 'Lịch thuê sân của bạn đã được xác nhận.'
        : 'Quản lý sân đã ghi nhận thanh toán tiền mặt.',
      id
    );
    return result.payment;
  }

  async approvePayment(
    id: string,
    paymentId: string,
    userId: string,
    role: string
  ) {
    const request = await this.getRequest(id);
    await this.access.assertManager(request.venueId, userId, role);
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockRequest(tx, id);
      const payment = await tx.venueRentalTransaction.findFirst({
        where: { id: paymentId, requestId: id },
      });
      const locked = await tx.venueRentalRequest.findUnique({ where: { id } });
      if (!payment || !locked) throw new NotFoundException('Payment not found');
      if (
        payment.status !== VenueRentalTransactionStatus.SUBMITTED &&
        payment.status !== VenueRentalTransactionStatus.PENDING
      ) {
        throw this.conflict(
          'PAYMENT_ALREADY_PROCESSED',
          'Payment has already been processed'
        );
      }
      this.assertPayable(locked, payment.purpose);
      await this.assertAmountAvailable(
        tx,
        locked,
        payment.purpose,
        payment.amount,
        false,
        payment.id
      );
      const changed = await tx.venueRentalTransaction.updateMany({
        where: {
          id: payment.id,
          status: {
            in: [
              VenueRentalTransactionStatus.SUBMITTED,
              VenueRentalTransactionStatus.PENDING,
            ],
          },
        },
        data: {
          status: VenueRentalTransactionStatus.APPROVED,
          processedByUserId: userId,
          approvedAt: new Date(),
        },
      });
      if (!changed.count) {
        throw this.conflict(
          'PAYMENT_ALREADY_PROCESSED',
          'Payment has already been processed'
        );
      }
      const confirmed = await this.confirmIfDepositSatisfied(
        tx,
        locked,
        userId
      );
      await this.createEvent(
        tx,
        id,
        userId,
        VenueRentalEventType.PAYMENT_APPROVED,
        {
          paymentId: payment.id,
          purpose: payment.purpose,
          amount: payment.amount,
        }
      );
      return {
        payment: await tx.venueRentalTransaction.findUniqueOrThrow({
          where: { id: payment.id },
        }),
        confirmed,
      };
    });
    this.logPayment('approved', result.payment);
    await this.notifyRequester(
      request.requesterId,
      result.confirmed ? 'Đặt cọc đã được duyệt' : 'Thanh toán đã được duyệt',
      result.confirmed
        ? 'Lịch thuê sân của bạn đã được xác nhận.'
        : 'Giao dịch thuê sân của bạn đã được duyệt.',
      id
    );
    return result.payment;
  }

  async rejectPayment(
    id: string,
    paymentId: string,
    dto: RejectRentalPaymentDto,
    userId: string,
    role: string
  ) {
    const request = await this.getRequest(id);
    await this.access.assertManager(request.venueId, userId, role);
    const payment = await this.prisma.$transaction(async (tx) => {
      await this.lockRequest(tx, id);
      const existing = await tx.venueRentalTransaction.findFirst({
        where: { id: paymentId, requestId: id },
      });
      if (!existing) throw new NotFoundException('Payment not found');
      const changed = await tx.venueRentalTransaction.updateMany({
        where: {
          id: paymentId,
          status: {
            in: [
              VenueRentalTransactionStatus.SUBMITTED,
              VenueRentalTransactionStatus.PENDING,
            ],
          },
        },
        data: {
          status: VenueRentalTransactionStatus.REJECTED,
          processedByUserId: userId,
          rejectedAt: new Date(),
          notes: dto.reason.trim(),
        },
      });
      if (!changed.count) {
        throw this.conflict(
          'PAYMENT_ALREADY_PROCESSED',
          'Payment has already been processed'
        );
      }
      await this.createEvent(
        tx,
        id,
        userId,
        VenueRentalEventType.PAYMENT_REJECTED,
        { paymentId, purpose: existing.purpose, amount: existing.amount }
      );
      return tx.venueRentalTransaction.findUniqueOrThrow({
        where: { id: paymentId },
      });
    });
    this.logPayment('rejected', payment);
    await this.notifyRequester(
      request.requesterId,
      'Chứng từ thanh toán bị từ chối',
      dto.reason.trim(),
      id
    );
    return payment;
  }

  async completeRefund(
    id: string,
    refundId: string,
    dto: CompleteRentalRefundDto,
    userId: string,
    role: string
  ) {
    if (!dto.notes?.trim() && !dto.proofUrl?.trim()) {
      throw new BadRequestException(
        'A refund note or proof URL is required to complete a refund'
      );
    }
    const request = await this.getRequest(id);
    await this.access.assertManager(request.venueId, userId, role);
    const refund = await this.prisma.$transaction(async (tx) => {
      await this.lockRequest(tx, id);
      const existing = await tx.venueRentalTransaction.findFirst({
        where: {
          id: refundId,
          requestId: id,
          purpose: VenueRentalTransactionPurpose.REFUND,
          direction: VenueRentalTransactionDirection.OUT,
        },
      });
      if (!existing) throw new NotFoundException('Refund not found');
      const changed = await tx.venueRentalTransaction.updateMany({
        where: { id: refundId, status: VenueRentalTransactionStatus.PENDING },
        data: {
          method: dto.method,
          status: VenueRentalTransactionStatus.APPROVED,
          notes: dto.notes?.trim() || null,
          proofUrl: dto.proofUrl?.trim() || null,
          proofPublicId: dto.proofPublicId?.trim() || null,
          processedByUserId: userId,
          approvedAt: new Date(),
        },
      });
      if (!changed.count) {
        throw this.conflict(
          'REFUND_ALREADY_COMPLETED',
          'Refund has already been completed'
        );
      }
      await this.createEvent(
        tx,
        id,
        userId,
        VenueRentalEventType.REFUND_COMPLETED,
        { refundId, amount: existing.amount }
      );
      return tx.venueRentalTransaction.findUniqueOrThrow({
        where: { id: refundId },
      });
    });
    this.logPayment('refund_completed', refund);
    await this.notifyRequester(
      request.requesterId,
      'Hoàn tiền thuê sân đã hoàn tất',
      'Quản lý sân đã xác nhận hoàn tiền cho bạn.',
      id
    );
    return refund;
  }

  async createRefundForCancellation(
    tx: Prisma.TransactionClient,
    request: {
      id: string;
      confirmedStartTime: Date | null;
      confirmedCurrency: string | null;
      paymentRefundCutoffHours: number | null;
      paymentRefundBeforePercent: number | null;
      paymentRefundAfterPercent: number | null;
    },
    isRequesterCancellation: boolean,
    cancelledAt: Date,
    actorId: string | null
  ) {
    if (!request.confirmedStartTime) return null;
    const paid = await tx.venueRentalTransaction.aggregate({
      where: {
        requestId: request.id,
        direction: VenueRentalTransactionDirection.IN,
        status: VenueRentalTransactionStatus.APPROVED,
      },
      _sum: { amount: true },
    });
    const amount = calculateRentalRefund(
      paid._sum.amount || 0,
      isRequesterCancellation,
      request.confirmedStartTime,
      cancelledAt,
      request.paymentRefundCutoffHours ?? DEFAULT_SETTINGS.refundCutoffHours,
      request.paymentRefundBeforePercent ??
        DEFAULT_SETTINGS.refundBeforePercent,
      request.paymentRefundAfterPercent ?? DEFAULT_SETTINGS.refundAfterPercent
    );
    if (!amount) return null;
    const existing = await tx.venueRentalTransaction.findFirst({
      where: {
        requestId: request.id,
        purpose: VenueRentalTransactionPurpose.REFUND,
        status: { not: VenueRentalTransactionStatus.CANCELLED },
      },
    });
    if (existing) return existing;
    const refund = await tx.venueRentalTransaction.create({
      data: {
        requestId: request.id,
        purpose: VenueRentalTransactionPurpose.REFUND,
        direction: VenueRentalTransactionDirection.OUT,
        status: VenueRentalTransactionStatus.PENDING,
        amount,
        currency: request.confirmedCurrency || 'VND',
        submittedByUserId: actorId,
      },
    });
    await this.createEvent(
      tx,
      request.id,
      actorId,
      VenueRentalEventType.REFUND_REQUIRED,
      { refundId: refund.id, amount }
    );
    return refund;
  }

  async processLifecycle() {
    const now = new Date();
    const awaiting = await this.prisma.venueRentalRequest.findMany({
      where: {
        status: VenueRentalStatus.AWAITING_DEPOSIT,
        depositDueAt: { lte: now },
      },
      select: { id: true, requesterId: true, venueId: true },
      take: 100,
    });
    let expiredCount = 0;
    for (const request of awaiting) {
      const outcome = await this.prisma.$transaction(async (tx) => {
        await this.lockRequest(tx, request.id);
        const locked = await tx.venueRentalRequest.findUnique({
          where: { id: request.id },
        });
        if (!locked) return null;
        const updated = await tx.venueRentalRequest.updateMany({
          where: {
            id: request.id,
            status: VenueRentalStatus.AWAITING_DEPOSIT,
            depositDueAt: { lte: now },
          },
          data: {
            status: VenueRentalStatus.CANCELLED,
            cancelledAt: now,
            cancellationReason: 'DEPOSIT_EXPIRED',
          },
        });
        if (!updated.count) return null;
        await tx.venueRentalCourtAllocation.updateMany({
          where: {
            requestId: request.id,
            status: VenueRentalAllocationStatus.RESERVED,
          },
          data: {
            status: VenueRentalAllocationStatus.RELEASED,
            releasedAt: now,
          },
        });
        await tx.venueRentalTransaction.updateMany({
          where: {
            requestId: request.id,
            status: {
              in: [
                VenueRentalTransactionStatus.PENDING,
                VenueRentalTransactionStatus.SUBMITTED,
              ],
            },
          },
          data: { status: VenueRentalTransactionStatus.EXPIRED },
        });
        const refund = await this.createRefundForCancellation(
          tx,
          locked,
          false,
          now,
          null
        );
        await this.createEvent(
          tx,
          request.id,
          null,
          VenueRentalEventType.DEPOSIT_EXPIRED
        );
        return { refund };
      });
      if (outcome) {
        expiredCount += 1;
        await this.notifyRequester(
          request.requesterId,
          'Yêu cầu thuê sân đã hết hạn đặt cọc',
          'Lịch giữ sân đã được giải phóng vì chưa đủ tiền cọc.',
          request.id
        );
        if (outcome.refund) {
          await this.notifyManagers(
            request.venueId,
            'Có khoản hoàn tiền thuê sân cần xử lý',
            'Booking hết hạn đặt cọc có khoản tiền cần hoàn.',
            request.id
          );
        }
      }
    }

    const reminderLimit = new Date(now.getTime() + 5 * 60_000);
    const reminders = await this.prisma.venueRentalRequest.findMany({
      where: {
        status: VenueRentalStatus.AWAITING_DEPOSIT,
        depositDueAt: { gt: now, lte: reminderLimit },
        depositReminderNotifiedAt: null,
      },
      select: { id: true, requesterId: true },
      take: 100,
    });
    for (const request of reminders) {
      const changed = await this.prisma.venueRentalRequest.updateMany({
        where: { id: request.id, depositReminderNotifiedAt: null },
        data: { depositReminderNotifiedAt: now },
      });
      if (changed.count) {
        await this.notifyRequester(
          request.requesterId,
          'Sắp hết hạn đặt cọc thuê sân',
          'Vui lòng hoàn tất đặt cọc trong 5 phút tới.',
          request.id
        );
      }
    }

    const overdueCandidates = await this.prisma.venueRentalRequest.findMany({
      where: {
        status: VenueRentalStatus.CONFIRMED,
        balanceDueAt: { lte: now },
        balanceOverdueNotifiedAt: null,
        balanceAmount: { gt: 0 },
      },
      include: {
        transactions: {
          where: {
            purpose: VenueRentalTransactionPurpose.BALANCE,
            status: VenueRentalTransactionStatus.APPROVED,
          },
          select: { amount: true },
        },
      },
      take: 100,
    });
    let overdueCount = 0;
    for (const request of overdueCandidates) {
      const paid = request.transactions.reduce(
        (sum, item) => sum + item.amount,
        0
      );
      if (paid >= (request.balanceAmount || 0)) continue;
      const changed = await this.prisma.venueRentalRequest.updateMany({
        where: { id: request.id, balanceOverdueNotifiedAt: null },
        data: { balanceOverdueNotifiedAt: now },
      });
      if (!changed.count) continue;
      overdueCount += 1;
      await Promise.allSettled([
        this.notifyRequester(
          request.requesterId,
          'Thanh toán thuê sân đã quá hạn',
          'Vui lòng thanh toán phần còn lại cho lịch thuê sân.',
          request.id
        ),
        this.notifyManagers(
          request.venueId,
          'Booking thuê sân quá hạn thanh toán',
          'Một booking đã quá hạn thanh toán phần còn lại.',
          request.id
        ),
      ]);
    }
    return {
      depositsExpired: expiredCount,
      depositReminders: reminders.length,
      balancesOverdue: overdueCount,
    };
  }

  private async getRequest(id: string) {
    const request = await this.prisma.venueRentalRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Venue rental request not found');
    return request;
  }

  private async assertRequestAccess(
    request: { venueId: string; requesterId: string | null },
    userId: string,
    role: string
  ) {
    if (request.requesterId === userId || role === Role.ADMIN) return;
    await this.access.assertManager(request.venueId, userId, role);
  }

  private assertPayable(
    request: {
      status: VenueRentalStatus;
      depositAmount: number | null;
      balanceAmount: number | null;
      depositDueAt: Date | null;
    },
    purpose: VenueRentalTransactionPurpose
  ) {
    if (purpose === VenueRentalTransactionPurpose.DEPOSIT) {
      if (!request.depositAmount) {
        throw this.conflict('PAYMENT_NOT_REQUIRED', 'Deposit is not required');
      }
      if (
        request.status !== VenueRentalStatus.AWAITING_DEPOSIT ||
        !request.depositDueAt ||
        request.depositDueAt <= new Date()
      ) {
        throw this.conflict('DEPOSIT_EXPIRED', 'Deposit deadline has expired');
      }
      return;
    }
    if (!request.balanceAmount) {
      throw this.conflict('PAYMENT_NOT_REQUIRED', 'Balance is not required');
    }
    if (
      request.status !== VenueRentalStatus.CONFIRMED &&
      request.status !== VenueRentalStatus.COMPLETED
    ) {
      throw this.conflict(
        'PAYMENT_NOT_REQUIRED',
        'Balance can only be paid for a confirmed rental'
      );
    }
  }

  private async assertAmountAvailable(
    tx: Prisma.TransactionClient,
    request: {
      id: string;
      depositAmount: number | null;
      balanceAmount: number | null;
    },
    purpose: VenueRentalTransactionPurpose,
    amount: number,
    includeSubmitted: boolean,
    excludeId?: string
  ) {
    const required =
      purpose === VenueRentalTransactionPurpose.DEPOSIT
        ? request.depositAmount || 0
        : request.balanceAmount || 0;
    const statuses = includeSubmitted
      ? [
          VenueRentalTransactionStatus.PENDING,
          VenueRentalTransactionStatus.SUBMITTED,
          VenueRentalTransactionStatus.APPROVED,
        ]
      : [VenueRentalTransactionStatus.APPROVED];
    const paid = await tx.venueRentalTransaction.aggregate({
      where: {
        requestId: request.id,
        purpose,
        status: { in: statuses },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      _sum: { amount: true },
    });
    if ((paid._sum.amount || 0) + amount > required) {
      throw this.conflict(
        'PAYMENT_AMOUNT_EXCEEDED',
        'Payment amount exceeds the outstanding amount'
      );
    }
  }

  private async confirmIfDepositSatisfied(
    tx: Prisma.TransactionClient,
    request: {
      id: string;
      status: VenueRentalStatus;
      depositAmount: number | null;
    },
    actorId: string
  ) {
    if (request.status !== VenueRentalStatus.AWAITING_DEPOSIT) return false;
    const approved = await tx.venueRentalTransaction.aggregate({
      where: {
        requestId: request.id,
        purpose: VenueRentalTransactionPurpose.DEPOSIT,
        status: VenueRentalTransactionStatus.APPROVED,
      },
      _sum: { amount: true },
    });
    if ((approved._sum.amount || 0) < (request.depositAmount || 0))
      return false;
    const changed = await tx.venueRentalRequest.updateMany({
      where: { id: request.id, status: VenueRentalStatus.AWAITING_DEPOSIT },
      data: { status: VenueRentalStatus.CONFIRMED, confirmedAt: new Date() },
    });
    if (!changed.count) return false;
    await tx.venueRentalCourtAllocation.updateMany({
      where: {
        requestId: request.id,
        status: VenueRentalAllocationStatus.RESERVED,
      },
      data: { status: VenueRentalAllocationStatus.CONFIRMED, expiresAt: null },
    });
    await tx.venueRentalEvent.create({
      data: {
        requestId: request.id,
        actorId,
        type: VenueRentalEventType.APPROVED,
        fromStatus: VenueRentalStatus.AWAITING_DEPOSIT,
        toStatus: VenueRentalStatus.CONFIRMED,
        payload: { reason: 'DEPOSIT_PAID' },
      },
    });
    return true;
  }

  private createEvent(
    tx: Prisma.TransactionClient,
    requestId: string,
    actorId: string | null,
    type: VenueRentalEventType,
    payload?: Prisma.InputJsonObject
  ) {
    return tx.venueRentalEvent.create({
      data: { requestId, actorId, type, payload: payload || Prisma.JsonNull },
    });
  }

  private lockRequest(tx: Prisma.TransactionClient, requestId: string) {
    return tx.$queryRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))::text AS lock_result',
      `rental-payment:${requestId}`
    );
  }

  private sumTransactions(
    transactions: Array<{
      purpose: VenueRentalTransactionPurpose;
      status: VenueRentalTransactionStatus;
      direction: VenueRentalTransactionDirection;
      amount: number;
    }>,
    purpose?: VenueRentalTransactionPurpose,
    status?: VenueRentalTransactionStatus,
    direction?: VenueRentalTransactionDirection
  ) {
    return transactions.reduce(
      (sum, item) =>
        (!purpose || item.purpose === purpose) &&
        (!status || item.status === status) &&
        (!direction || item.direction === direction)
          ? sum + item.amount
          : sum,
      0
    );
  }

  private async notifyManagers(
    venueId: string,
    title: string,
    message: string,
    rentalRequestId: string
  ) {
    const managers = await this.prisma.venueManager.findMany({
      where: { venueId },
      select: { userId: true },
    });
    await Promise.allSettled(
      managers.map((manager) =>
        this.notifications.createForUser(
          manager.userId,
          NotificationType.VENUE_RENTAL,
          title,
          message,
          { rentalRequestId, venueId, manage: true, route: 'rental-payment' }
        )
      )
    );
  }

  private notifyRequester(
    userId: string | null,
    title: string,
    message: string,
    rentalRequestId: string
  ) {
    if (!userId) return Promise.resolve(null);
    return this.notifications.createForUser(
      userId,
      NotificationType.VENUE_RENTAL,
      title,
      message,
      { rentalRequestId, route: 'rental-payment' }
    );
  }

  private logPayment(
    event: string,
    payment: { id: string; requestId: string; amount: number; status: string }
  ) {
    this.logger.log(
      JSON.stringify({
        event,
        rentalRequestId: payment.requestId,
        paymentId: payment.id,
        amount: payment.amount,
        status: payment.status,
      })
    );
  }

  private conflict(code: string, message: string) {
    return new ConflictException({ code, message });
  }
}
