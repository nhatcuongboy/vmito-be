import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  PaymentReminderType,
  PaymentReminderStatus,
  PaymentStatus,
  NotificationType,
} from '@prisma/client';
import {
  CreateSingleReminderDto,
  CreateAggregateReminderDto,
  CreateCustomReminderDto,
  MarkReminderPaidDto,
  RejectReminderDto,
  QueryRemindersDto,
} from './dto';

const formatVnd = (amount: number) => `${amount.toLocaleString('vi-VN')}đ`;

@Injectable()
export class PaymentRemindersService {
  private readonly reminderSelect = {
    id: true,
    type: true,
    creatorId: true,
    recipientId: true,
    sessionId: true,
    amount: true,
    note: true,
    status: true,
    reminderCount: true,
    lastRemindedAt: true,
    resolvedAt: true,
    proofImageUrl: true,
    proofNotes: true,
    createdAt: true,
    updatedAt: true,
    creator: { select: { id: true, name: true, image: true } },
    recipient: { select: { id: true, name: true, image: true } },
    session: { select: { id: true, name: true } },
    payments: {
      select: {
        payment: {
          select: {
            id: true,
            status: true,
            amount: true,
            proofImageUrl: true,
            proofNotes: true,
            hostNotes: true,
            sessionId: true,
          },
        },
      },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly notifications: NotificationsService
  ) {}

  private assertHostAccess(role?: string) {
    if (role !== 'HOST' && role !== 'ADMIN') {
      throw new ForbiddenException('Only hosts can create this reminder');
    }
  }

  async createSingle(hostUserId: string, dto: CreateSingleReminderDto) {
    const payment = await this.prisma.paymentRecord.findUnique({
      where: { id: dto.paymentId },
      include: {
        session: { select: { id: true, hostId: true } },
        player: { select: { userId: true } },
      },
    });

    if (!payment) throw new NotFoundException('Payment record not found');
    if (payment.session.hostId !== hostUserId) {
      throw new ForbiddenException('Only the session host can send this reminder');
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Can only remind about a PENDING payment');
    }
    if (!payment.player.userId) {
      throw new BadRequestException('Cannot remind a guest player without an account');
    }

    const existing = await this.prisma.paymentReminder.findFirst({
      where: {
        type: PaymentReminderType.SINGLE_PAYMENT,
        status: { not: PaymentReminderStatus.RESOLVED },
        payments: { some: { paymentId: dto.paymentId } },
      },
    });

    const reminder = existing
      ? await this.prisma.paymentReminder.update({
          where: { id: existing.id },
          data: {
            amount: payment.amount,
            note: dto.note ?? existing.note,
            reminderCount: { increment: 1 },
            lastRemindedAt: new Date(),
          },
          select: this.reminderSelect,
        })
      : await this.prisma.paymentReminder.create({
          data: {
            type: PaymentReminderType.SINGLE_PAYMENT,
            creatorId: hostUserId,
            recipientId: payment.player.userId,
            sessionId: payment.sessionId,
            amount: payment.amount,
            note: dto.note,
            payments: { create: { paymentId: dto.paymentId } },
          },
          select: this.reminderSelect,
        });

    await this.notifications.createForUser(
      reminder.recipientId,
      NotificationType.PAYMENT,
      'Nhắc nhở thanh toán',
      `Bạn có một khoản thanh toán ${formatVnd(reminder.amount)} đang chờ xử lý.`,
      { reminderId: reminder.id, route: 'reminders' }
    );

    return reminder;
  }

  async createOrRefreshAggregate(
    hostUserId: string,
    role: string | undefined,
    dto: CreateAggregateReminderDto
  ) {
    this.assertHostAccess(role);

    const pendingPayments = await this.prisma.paymentRecord.findMany({
      where: {
        hostId: hostUserId,
        status: PaymentStatus.PENDING,
        player: { userId: dto.recipientUserId },
      },
      select: { id: true, amount: true },
    });

    if (pendingPayments.length === 0) {
      throw new BadRequestException(
        'This user has no pending payments to remind about'
      );
    }

    const totalAmount = pendingPayments.reduce((sum, p) => sum + p.amount, 0);

    const existing = await this.prisma.paymentReminder.findFirst({
      where: {
        type: PaymentReminderType.AGGREGATE,
        creatorId: hostUserId,
        recipientId: dto.recipientUserId,
        status: { not: PaymentReminderStatus.RESOLVED },
      },
    });

    const reminder = existing
      ? await this.prisma.paymentReminder.update({
          where: { id: existing.id },
          data: {
            amount: totalAmount,
            reminderCount: { increment: 1 },
            lastRemindedAt: new Date(),
            payments: {
              deleteMany: {},
              create: pendingPayments.map((p) => ({ paymentId: p.id })),
            },
          },
          select: this.reminderSelect,
        })
      : await this.prisma.paymentReminder.create({
          data: {
            type: PaymentReminderType.AGGREGATE,
            creatorId: hostUserId,
            recipientId: dto.recipientUserId,
            amount: totalAmount,
            payments: {
              create: pendingPayments.map((p) => ({ paymentId: p.id })),
            },
          },
          select: this.reminderSelect,
        });

    await this.notifications.createForUser(
      reminder.recipientId,
      NotificationType.PAYMENT,
      'Nhắc nhở thanh toán',
      `Bạn có ${pendingPayments.length} khoản thanh toán chưa hoàn tất, tổng cộng ${formatVnd(totalAmount)}.`,
      { reminderId: reminder.id, route: 'reminders' }
    );

    return reminder;
  }

  async createCustom(
    hostUserId: string,
    role: string | undefined,
    dto: CreateCustomReminderDto
  ) {
    this.assertHostAccess(role);

    const reminder = await this.prisma.paymentReminder.create({
      data: {
        type: PaymentReminderType.CUSTOM,
        creatorId: hostUserId,
        recipientId: dto.recipientUserId,
        amount: dto.amount,
        note: dto.note,
      },
      select: this.reminderSelect,
    });

    await this.notifications.createForUser(
      reminder.recipientId,
      NotificationType.PAYMENT,
      'Nhắc nhở thanh toán',
      `Bạn có một lời nhắc thanh toán ${formatVnd(dto.amount)}: ${dto.note}`,
      { reminderId: reminder.id, route: 'reminders' }
    );

    return reminder;
  }

  async remindAgain(reminderId: string, userId: string) {
    const reminder = await this.getOwnedReminder(reminderId, userId, 'creator');

    if (reminder.status !== PaymentReminderStatus.PENDING) {
      throw new BadRequestException('Can only re-send a reminder that is still PENDING');
    }

    let amount = reminder.amount;
    if (reminder.type === PaymentReminderType.AGGREGATE) {
      const pendingPayments = await this.prisma.paymentRecord.findMany({
        where: {
          hostId: reminder.creatorId,
          status: PaymentStatus.PENDING,
          player: { userId: reminder.recipientId },
        },
        select: { id: true, amount: true },
      });
      amount = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
      await this.prisma.paymentReminder.update({
        where: { id: reminderId },
        data: {
          payments: {
            deleteMany: {},
            create: pendingPayments.map((p) => ({ paymentId: p.id })),
          },
        },
      });
    }

    await this.prisma.paymentReminder.update({
      where: { id: reminderId },
      data: { amount, reminderCount: { increment: 1 }, lastRemindedAt: new Date() },
    });

    await this.notifications.createForUser(
      reminder.recipientId,
      NotificationType.PAYMENT,
      'Nhắc nhở thanh toán',
      `Nhắc lại: bạn có một khoản thanh toán ${formatVnd(amount)} đang chờ xử lý.`,
      { reminderId, route: 'reminders' }
    );

    return this.prisma.paymentReminder.findUnique({
      where: { id: reminderId },
      select: this.reminderSelect,
    });
  }

  async markCollected(reminderId: string, userId: string, role?: string) {
    const reminder = await this.getOwnedReminder(reminderId, userId, 'creator', role);

    if (reminder.status === PaymentReminderStatus.RESOLVED) {
      throw new BadRequestException('Reminder is already resolved');
    }

    if (reminder.type === PaymentReminderType.CUSTOM) {
      await this.prisma.paymentReminder.update({
        where: { id: reminderId },
        data: { status: PaymentReminderStatus.RESOLVED, resolvedAt: new Date() },
      });
    } else {
      const paymentIds = reminder.payments.map((p) => p.payment.id);
      await Promise.allSettled(
        paymentIds.map((id) => this.paymentsService.approve(id, {}, userId, role))
      );
    }

    await this.notifications.createForUser(
      reminder.recipientId,
      NotificationType.PAYMENT,
      'Đã xác nhận thu tiền',
      `Khoản thanh toán ${formatVnd(reminder.amount)} đã được xác nhận là đã thu.`,
      { reminderId, route: 'reminders' }
    );

    return this.prisma.paymentReminder.findUnique({
      where: { id: reminderId },
      select: this.reminderSelect,
    });
  }

  async markPaid(reminderId: string, userId: string, dto: MarkReminderPaidDto) {
    const reminder = await this.getOwnedReminder(reminderId, userId, 'recipient');

    if (reminder.status !== PaymentReminderStatus.PENDING) {
      throw new BadRequestException('Can only mark as paid while PENDING');
    }

    if (reminder.type === PaymentReminderType.CUSTOM) {
      await this.prisma.paymentReminder.update({
        where: { id: reminderId },
        data: {
          status: PaymentReminderStatus.AWAITING_CONFIRMATION,
          proofImageUrl: dto.proofImageUrl,
          proofImagePublicId: dto.proofImagePublicId,
          proofNotes: dto.proofNotes,
        },
      });
    } else {
      const paymentIds = reminder.payments.map((p) => p.payment.id);
      await Promise.allSettled(
        paymentIds.map((id) => this.paymentsService.submit(id, dto, userId))
      );
    }

    await this.notifications.createForUser(
      reminder.creatorId,
      NotificationType.PAYMENT,
      'Đã gửi minh chứng thanh toán',
      `Người dùng đã gửi minh chứng đã trả cho khoản ${formatVnd(reminder.amount)}, vui lòng xác nhận.`,
      { reminderId, route: 'reminders' }
    );

    return this.prisma.paymentReminder.findUnique({
      where: { id: reminderId },
      select: this.reminderSelect,
    });
  }

  async reject(
    reminderId: string,
    userId: string,
    role: string | undefined,
    dto: RejectReminderDto
  ) {
    const reminder = await this.getOwnedReminder(reminderId, userId, 'creator', role);

    if (reminder.status !== PaymentReminderStatus.AWAITING_CONFIRMATION) {
      throw new BadRequestException(
        'Can only reject a reminder awaiting confirmation'
      );
    }

    if (reminder.type === PaymentReminderType.CUSTOM) {
      await this.prisma.paymentReminder.update({
        where: { id: reminderId },
        data: {
          status: PaymentReminderStatus.PENDING,
          proofImageUrl: null,
          proofImagePublicId: null,
          proofNotes: null,
          note: dto.hostNotes ?? reminder.note,
          lastRemindedAt: new Date(),
        },
      });
    } else {
      const paymentIds = reminder.payments.map((p) => p.payment.id);
      await Promise.allSettled(
        paymentIds.map((id) =>
          this.paymentsService.reject(id, { hostNotes: dto.hostNotes }, userId, role)
        )
      );
      await this.prisma.paymentReminder.update({
        where: { id: reminderId },
        data: { lastRemindedAt: new Date() },
      });
    }

    await this.notifications.createForUser(
      reminder.recipientId,
      NotificationType.PAYMENT,
      'Minh chứng thanh toán bị từ chối',
      dto.hostNotes
        ? `Minh chứng đã trả bị từ chối: ${dto.hostNotes}. Vui lòng gửi lại.`
        : 'Minh chứng đã trả bị từ chối, vui lòng gửi lại.',
      { reminderId, route: 'reminders' }
    );

    return this.prisma.paymentReminder.findUnique({
      where: { id: reminderId },
      select: this.reminderSelect,
    });
  }

  async list(userId: string, query: QueryRemindersDto) {
    return this.prisma.paymentReminder.findMany({
      where: {
        ...(query.role === 'creator'
          ? { creatorId: userId }
          : { recipientId: userId }),
        ...(query.status ? { status: query.status } : {}),
      },
      select: this.reminderSelect,
      orderBy: { lastRemindedAt: 'desc' },
    });
  }

  private async getOwnedReminder(
    reminderId: string,
    userId: string,
    ownerField: 'creator' | 'recipient',
    role?: string
  ) {
    const reminder = await this.prisma.paymentReminder.findUnique({
      where: { id: reminderId },
      include: { payments: { include: { payment: true } } },
    });

    if (!reminder) throw new NotFoundException('Reminder not found');

    const ownerId =
      ownerField === 'creator' ? reminder.creatorId : reminder.recipientId;

    if (ownerId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('Not authorized for this reminder');
    }

    return reminder;
  }
}
