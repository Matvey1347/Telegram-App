import { TelegramBotDeliveryWriterService } from './telegram-bot-delivery-writer';

describe('TelegramBotDeliveryWriterService', () => {
  it('writes Finance links in the caller transaction and reschedules only after it is asked', async () => {
    const tx = {
      telegramBotDelivery: {
        upsert: jest
          .fn()
          .mockResolvedValue({ scheduledAt: new Date('2026-09-01T00:00:00Z') }),
      },
    };
    const delivery = {
      notify: jest.fn(),
      reschedule: jest.fn().mockResolvedValue(undefined),
    };
    const writer = new TelegramBotDeliveryWriterService(delivery as never);
    const scheduledAt = new Date('2026-09-01T00:00:00Z');

    await writer.enqueueInTransaction(tx as never, {
      workspaceId: 'workspace-1',
      botIntegrationId: 'bot-1',
      telegramBotUserId: 'user-1',
      financeRecurringPaymentId: 'regular-1',
      chatId: '42',
      message: { text: 'Due' },
      scheduledAt,
      idempotencyKey: 'regular-1:v1',
    });

    const upsertCalls = tx.telegramBotDelivery.upsert.mock
      .calls as unknown as Array<
      [
        {
          create: {
            financeDebtId: string | null;
            financeRecurringPaymentId: string | null;
            scheduledAt: Date;
          };
          update: object;
        },
      ]
    >;
    const upsert = upsertCalls[0]?.[0];
    expect(upsert.create).toMatchObject({
      financeDebtId: null,
      financeRecurringPaymentId: 'regular-1',
      scheduledAt,
    });
    expect(upsert.update).toEqual({});
    expect(delivery.reschedule).not.toHaveBeenCalled();
    writer.notify(scheduledAt);
    expect(delivery.notify).toHaveBeenCalledWith(scheduledAt);
    expect(delivery.reschedule).not.toHaveBeenCalled();
  });

  it('cancels only queued deliveries for the exact Finance entity', async () => {
    const tx = {
      telegramBotDelivery: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const writer = new TelegramBotDeliveryWriterService({} as never);
    await expect(
      writer.cancelPendingInTransaction(tx as never, {
        financeDebtId: 'debt-1',
      }),
    ).resolves.toBe(2);
    const updateCalls = tx.telegramBotDelivery.updateMany.mock
      .calls as unknown as Array<[{ where: { financeDebtId: string } }]>;
    const update = updateCalls[0]?.[0];
    expect(update.where.financeDebtId).toBe('debt-1');
  });

  it('batches durable deliveries in the caller transaction', async () => {
    const tx = {
      telegramBotDelivery: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const writer = new TelegramBotDeliveryWriterService({} as never);
    const first = new Date('2026-09-01T00:00:00Z');
    const second = new Date('2026-09-02T00:00:00Z');

    await expect(
      writer.enqueueManyInTransaction(tx as never, [
        {
          workspaceId: 'workspace-1',
          botIntegrationId: 'bot-1',
          financeReminderId: 'reminder-1',
          chatId: '42',
          message: { text: 'First' },
          scheduledAt: first,
          idempotencyKey: 'reminder-1:v1',
        },
        {
          workspaceId: 'workspace-1',
          botIntegrationId: 'bot-1',
          financeDebtId: 'debt-1',
          chatId: '42',
          message: { text: 'Second' },
          scheduledAt: second,
          idempotencyKey: 'debt-1:v1',
        },
      ]),
    ).resolves.toEqual([{ scheduledAt: first }, { scheduledAt: second }]);
    expect(tx.telegramBotDelivery.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ financeReminderId: 'reminder-1' }),
        expect.objectContaining({ financeDebtId: 'debt-1' }),
      ],
      skipDuplicates: true,
    });
  });
});
