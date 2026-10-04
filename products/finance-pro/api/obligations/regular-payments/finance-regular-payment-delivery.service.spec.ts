import { Prisma } from '@prisma/client';
import { FinanceRegularPaymentDeliveryService } from './finance-regular-payment-delivery.service';

describe('FinanceRegularPaymentDeliveryService', () => {
  it('arms a committed replacement before recomputing the shared earliest wake', async () => {
    const calls: string[] = [];
    const writer = {
      notify: jest.fn(() => calls.push('notify')),
      reschedule: jest.fn(async () => calls.push('reschedule')),
    };
    const service = new FinanceRegularPaymentDeliveryService(
      writer as never,
      {} as never,
    );
    const scheduledAt = new Date('2026-09-30T00:00:00.000Z');

    await service.reschedule(scheduledAt);

    expect(calls).toEqual(['notify', 'reschedule']);
    expect(writer.notify).toHaveBeenCalledWith(scheduledAt);
  });

  it('uses a stable entity/version/occurrence key and never advances the domain row', async () => {
    const tx = { financeRecurringPayment: { update: jest.fn() } };
    const writer = {
      enqueueInTransaction: jest.fn().mockResolvedValue({
        scheduledAt: new Date('2026-09-30T00:00:00.000Z'),
      }),
      cancelPendingInTransaction: jest.fn().mockResolvedValue(0),
    };
    const presentation = {
      regularPaymentDue: jest.fn().mockReturnValue({ text: 'Due' }),
    };
    const service = new FinanceRegularPaymentDeliveryService(
      writer as never,
      presentation as never,
    );
    const nextOccurrenceAt = new Date('2026-09-30T00:00:00.000Z');
    const row = {
      id: 'regular-1',
      profileId: 'profile-1',
      name: 'Rent',
      amount: new Prisma.Decimal(1000),
      currency: 'USD',
      accountId: 'account-1',
      account: {
        id: 'account-1',
        name: 'Card',
        currency: 'USD',
        type: 'CARD',
        emoji: null,
      },
      categoryId: null,
      category: null,
      recurrence: 'MONTHLY',
      anchorDay: 30,
      anchorMonth: null,
      nextOccurrenceAt,
      scheduleTimezone: 'UTC',
      note: null,
      status: 'ACTIVE',
      version: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const profile = {
      id: 'profile-1',
      defaultCurrency: 'USD',
      timezone: 'UTC',
      locale: 'en',
      botIntegrationId: 'bot-1',
      telegramBotUserId: 'user-1',
      botIntegration: { workspaceId: 'workspace-1' },
      telegramUser: {
        telegramChatId: '42',
        runtimeInstanceId: 'runtime-1',
        languageCode: 'en',
      },
    };

    await service.replace(tx as never, profile, row as never);
    await service.replace(tx as never, profile, row as never);

    expect(writer.enqueueInTransaction).toHaveBeenNthCalledWith(
      1,
      tx,
      expect.objectContaining({
        financeRecurringPaymentId: 'regular-1',
        scheduledAt: nextOccurrenceAt,
        idempotencyKey: 'finance-regular:regular-1:4:2026-09-30T00:00:00.000Z',
      }),
    );
    expect(writer.enqueueInTransaction.mock.calls[1][1].idempotencyKey).toBe(
      writer.enqueueInTransaction.mock.calls[0][1].idempotencyKey,
    );
    expect(tx.financeRecurringPayment.update).not.toHaveBeenCalled();
  });
});
