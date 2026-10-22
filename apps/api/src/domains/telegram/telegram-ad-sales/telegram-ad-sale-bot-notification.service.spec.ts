import { TelegramAdSaleBotNotificationService } from './telegram-ad-sale-bot-notification.service';

const sale = {
  title: 'Тестова угода',
  scheduledBotConfirmationSentAt: null,
  workspace: { timezone: 'Europe/Kyiv' },
  placements: [
    {
      status: 'SCHEDULED',
      scheduledAt: new Date('2026-10-01T10:00:00.000Z'),
      topDurationMinutesSnapshot: 120,
      feedDurationHoursSnapshot: 48,
      deleteAfterHoursSnapshot: 48,
      isPermanentSnapshot: false,
      plannedDeleteAt: new Date('2026-10-03T10:00:00.000Z'),
      telegramChannelId: 'test-channel',
      managedPost: {
        status: 'SCHEDULED',
        title: 'Перевірка публікації',
        telegramMessageUrls: [],
      },
      telegramChannel: {
        id: 'test-channel',
        title: '💝 Test 💝',
        presentationIcon: { emoji: '🧪' },
        publicInviteLink: { url: 'https://t.me/test_channel' },
        defaultInviteLink: null,
      },
    },
  ],
};

describe('TelegramAdSaleBotNotificationService', () => {
  it('sends the scheduled confirmation once after every deal placement is scheduled', async () => {
    const prisma = {
      telegramAdSale: {
        findFirst: jest.fn().mockResolvedValue(sale),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const notifications = {
      sendToWorkspaceUser: jest.fn().mockResolvedValue({ status: 'SENT' }),
    };
    const service = new TelegramAdSaleBotNotificationService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      notifications as never,
    );

    await service.sendScheduledOnce('user-1', 'sale-1');

    expect(notifications.sendToWorkspaceUser).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        userId: 'user-1',
        parseMode: 'HTML',
        text: expect.stringContaining('✅ <b>Пост заплановано</b>'),
      }),
    );
    const text = notifications.sendToWorkspaceUser.mock.calls[0][0].text;
    expect(text).toContain('🧪 <b>Test</b>');
    expect(text).toContain('Формат — <b>Автовидалення через 48 годин</b>');
    expect(text).toContain('📅 Дата — <b>01.10</b>; 🕒 Час — <b>13:00</b>\n🗑️ Формат — <b>Автовидалення через 48 годин</b>');
    expect(prisma.telegramAdSale.update).toHaveBeenCalledWith({
      where: { id: 'sale-1' },
      data: { scheduledBotConfirmationSentAt: expect.any(Date) },
    });
  });

  it('sends published links only when every deal placement has been published', async () => {
    const prisma = {
      telegramAdSale: {
        findUnique: jest.fn().mockResolvedValue({
          workspaceId: 'workspace-1',
          createdByUserId: 'user-1',
          publishedBotConfirmationSentAt: null,
        }),
        findFirst: jest.fn().mockResolvedValue({
          ...sale,
          placements: sale.placements.map((placement) => ({
            ...placement,
            status: 'PUBLISHED',
            managedPost: {
              ...placement.managedPost,
              status: 'PUBLISHED',
              publishedAt: new Date('2026-10-01T10:00:00.000Z'),
              telegramMessageUrls: ['https://t.me/test_channel/42'],
            },
          })),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const notifications = {
      sendToWorkspaceUser: jest.fn().mockResolvedValue({ status: 'SENT' }),
    };
    const service = new TelegramAdSaleBotNotificationService(
      prisma as never,
      {} as never,
      notifications as never,
    );

    await service.sendPublishedOnce('sale-1');

    const text = notifications.sendToWorkspaceUser.mock.calls[0][0].text;
    expect(text).toContain('✅ <b>Пости опубліковано</b>');
    expect(text).toContain('https://t.me/test_channel/42');
    expect(text).toContain('— <a href="https://t.me/test_channel/42">Пост</a>');
    expect(text).toContain('📅 Дата — <b>01.10</b>; 🕒 Час — <b>13:00</b>\n🗑️ Формат — <b>Автовидалення через 48 годин</b>');
    expect(prisma.telegramAdSale.update).toHaveBeenCalledWith({
      where: { id: 'sale-1' },
      data: { publishedBotConfirmationSentAt: expect.any(Date) },
    });
  });

  it('shows the explicit no-auto-delete deal format in its confirmation', async () => {
    const permanentSale = {
      ...sale,
      placements: sale.placements.map((placement) => ({
        ...placement,
        topDurationMinutesSnapshot: 60,
        feedDurationHoursSnapshot: null,
        deleteAfterHoursSnapshot: null,
        isPermanentSnapshot: true,
        plannedDeleteAt: null,
      })),
    };
    const notifications = { sendToWorkspaceUser: jest.fn().mockResolvedValue({ status: 'SENT' }) };
    const service = new TelegramAdSaleBotNotificationService(
      {
        telegramAdSale: {
          findFirst: jest.fn().mockResolvedValue(permanentSale),
          update: jest.fn().mockResolvedValue({}),
        },
      } as never,
      { resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1') } as never,
      notifications as never,
    );

    await service.sendScheduledOnce('user-1', 'sale-1');

    expect(notifications.sendToWorkspaceUser.mock.calls[0][0].text).toContain(
      'Формат — <b>Без автовидалення</b>',
    );
  });

  it('does not announce publication while even one placement remains scheduled', async () => {
    const prisma = {
      telegramAdSale: {
        findUnique: jest.fn().mockResolvedValue({
          workspaceId: 'workspace-1',
          createdByUserId: 'user-1',
          publishedBotConfirmationSentAt: null,
        }),
        findFirst: jest.fn().mockResolvedValue(sale),
        update: jest.fn(),
      },
    };
    const notifications = { sendToWorkspaceUser: jest.fn() };
    const service = new TelegramAdSaleBotNotificationService(
      prisma as never,
      {} as never,
      notifications as never,
    );

    await service.sendPublishedOnce('sale-1');

    expect(notifications.sendToWorkspaceUser).not.toHaveBeenCalled();
    expect(prisma.telegramAdSale.update).not.toHaveBeenCalled();
  });

  it('does not consume a scheduled confirmation while the user has no System Bot connection', async () => {
    const prisma = {
      telegramAdSale: {
        findFirst: jest.fn().mockResolvedValue(sale),
        update: jest.fn(),
      },
    };
    const service = new TelegramAdSaleBotNotificationService(
      prisma as never,
      { resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1') } as never,
      { sendToWorkspaceUser: jest.fn().mockResolvedValue({ status: 'NOT_CONNECTED' }) } as never,
    );

    await service.sendScheduledOnce('user-1', 'sale-1');

    expect(prisma.telegramAdSale.update).not.toHaveBeenCalled();
  });
});
