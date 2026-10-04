import { FinanceReminderDeliveryService } from './finance-reminder-delivery.service';

describe('FinanceReminderDeliveryService', () => {
  it('advances a month-end reminder durably and returns the next due delivery', async () => {
    const current = new Date('2026-01-31T09:30:00.000Z');
    const prisma = {
      financeReminder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'reminder-1',
          enabled: true,
          nextOccurrenceAt: current,
          dayOfMonth: 31,
          reminderOffsetMinutes: 60,
          name: 'Rent',
          amount: { toString: () => '1000' },
          currency: 'USD',
          profile: {
            locale: 'en',
            botIntegrationId: 'bot-1',
            telegramBotUserId: 'user-1',
            telegramUser: {
              telegramChatId: '42',
              languageCode: 'en',
            },
            botIntegration: { workspaceId: 'workspace-1' },
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const delivery = await new FinanceReminderDeliveryService(
      prisma as never,
    ).scheduleNext('reminder-1');

    const next = new Date('2026-02-28T09:30:00.000Z');
    expect(prisma.financeReminder.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'reminder-1',
        nextOccurrenceAt: current,
        enabled: true,
      },
      data: { nextOccurrenceAt: next },
    });
    expect(delivery).toMatchObject({
      workspaceId: 'workspace-1',
      botIntegrationId: 'bot-1',
      financeReminderId: 'reminder-1',
      scheduledAt: new Date('2026-02-28T08:30:00.000Z'),
      idempotencyKey: `finance-reminder:reminder-1:${next.toISOString()}`,
    });
  });

  it('does no write or delivery work for a disabled or missing reminder', async () => {
    const prisma = {
      financeReminder: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
      },
    };

    await expect(
      new FinanceReminderDeliveryService(prisma as never).scheduleNext(
        'missing',
      ),
    ).resolves.toBeNull();
    expect(prisma.financeReminder.updateMany).not.toHaveBeenCalled();
  });
});
