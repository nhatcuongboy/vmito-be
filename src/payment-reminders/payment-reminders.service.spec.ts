import {
  NotificationType,
  PaymentReminderStatus,
  PaymentReminderType,
} from '@prisma/client';
import { PaymentRemindersService } from './payment-reminders.service';

describe('PaymentRemindersService', () => {
  const prisma = {
    paymentReminder: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    paymentRecord: { findMany: jest.fn() },
  };
  const paymentsService = {};
  const notifications = {
    createForUser: jest.fn<Promise<unknown>, unknown[]>(),
  };
  const service = new PaymentRemindersService(
    prisma as never,
    paymentsService as never,
    notifications as never
  );

  beforeEach(() => jest.clearAllMocks());

  it('coalesces remind-again into the original single-payment notification', async () => {
    const reminder = {
      id: 'reminder-1',
      type: PaymentReminderType.SINGLE_PAYMENT,
      creatorId: 'host-1',
      recipientId: 'user-1',
      status: PaymentReminderStatus.PENDING,
      amount: 150_000,
      payments: [{ payment: { id: 'payment-1' } }],
    };
    prisma.paymentReminder.findUnique
      .mockResolvedValueOnce(reminder)
      .mockResolvedValueOnce(reminder);
    prisma.paymentReminder.update.mockResolvedValueOnce(reminder);
    notifications.createForUser.mockResolvedValueOnce({});

    await service.remindAgain('reminder-1', 'host-1');

    expect(notifications.createForUser).toHaveBeenCalledWith(
      'user-1',
      NotificationType.PAYMENT,
      'Nhắc nhở thanh toán',
      expect.stringContaining('150.000đ'),
      { reminderId: 'reminder-1', route: 'reminders' },
      {
        dedupeKey: 'payment-reminder:single:payment-1:pending',
        conflictMode: 'COALESCE',
      }
    );
  });
});
