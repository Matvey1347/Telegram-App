import { TelegramSystemBotNotificationsService } from '../../telegram/telegram-system-bot/telegram-system-bot-notifications.service';
import { ChannelReminderDeliveryService } from './channel-reminder-delivery.service';

const input = {
  workspaceId: 'workspace',
  memberId: 'member',
  sourceKey: 'day:1',
  title: 'Reminder',
  body: 'Channel',
};

function setup(
  options: { sent?: boolean; existing?: boolean; result?: string } = {},
) {
  const prisma = {
    workspaceMember: { findFirst: jest.fn().mockResolvedValue({}) },
    operationsNotification: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          id: 'notice',
          channelReminderTelegramSentAt: null,
        }),
      findFirst: jest
        .fn()
        .mockResolvedValue(options.sent ? { id: 'sent-notice' } : null),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (callback) => callback({})),
  };
  const store = {
    insertMany: jest
      .fn()
      .mockResolvedValue(options.existing ? [] : [{ id: 'notice' }]),
  };
  const publisher = { publish: jest.fn() };
  const botNotifications = {
    sendToWorkspaceAccount: jest
      .fn()
      .mockResolvedValue({ status: options.result ?? 'SENT' }),
    sendToWorkspace: jest
      .fn()
      .mockResolvedValue({ status: options.result ?? 'SENT' }),
  };
  const moduleRef = { resolve: jest.fn().mockResolvedValue(botNotifications) };
  const service = new ChannelReminderDeliveryService(
    prisma as never,
    store as never,
    publisher as never,
    { canReceive: () => true, has: () => true } as never,
    moduleRef as never,
  );
  return { service, prisma, store, publisher, moduleRef, botNotifications };
}

describe('channel reminder delivery', () => {
  it('publishes the workspace notification and delivers it to the linked group once', async () => {
    const { service, publisher, botNotifications, prisma } = setup();
    await service.deliver(input);
    expect(publisher.publish).toHaveBeenCalledWith(['notice']);
    expect(botNotifications.sendToWorkspace).toHaveBeenCalledWith(
      'workspace',
      'Reminder\n\nChannel',
    );
    expect(prisma.operationsNotification.update).toHaveBeenCalled();
  });

  it('delivers only to the configured personal Telegram chat when selected', async () => {
    const { service, publisher, botNotifications } = setup();
    await expect(
      service.deliver({
        ...input,
        destination: 'TELEGRAM_PRIVATE',
        telegramHtml: '<b>Reminder</b>',
      }),
    ).resolves.toBe(true);
    expect(botNotifications.sendToWorkspaceAccount).toHaveBeenCalledWith(
      'workspace',
      '<b>Reminder</b>',
      'HTML',
    );
    expect(botNotifications.sendToWorkspace).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('publishes in-app without a Telegram send when selected', async () => {
    const { service, publisher, botNotifications } = setup();
    await service.deliver({ ...input, destination: 'IN_APP' });
    expect(publisher.publish).toHaveBeenCalledWith(['notice']);
    expect(botNotifications.sendToWorkspace).not.toHaveBeenCalled();
  });

  it('uses Telegram HTML for the same compact preview with a saved custom emoji', async () => {
    const { service, botNotifications } = setup();
    const telegramHtml = '<tg-emoji emoji-id="42">📢</tg-emoji> Editorial';
    await service.deliver({ ...input, telegramHtml });
    expect(botNotifications.sendToWorkspace).toHaveBeenCalledWith(
      'workspace',
      telegramHtml,
      'HTML',
    );
  });

  it('does not send a second group message for another recipient of the same occurrence', async () => {
    const { service, publisher, botNotifications } = setup({
      sent: true,
      existing: true,
    });
    await service.deliver(input);
    expect(publisher.publish).toHaveBeenCalledWith(['notice']);
    expect(botNotifications.sendToWorkspace).not.toHaveBeenCalled();
  });

  it('leaves an unavailable group delivery retryable', async () => {
    const { service, prisma, botNotifications } = setup({
      result: 'NOT_CONNECTED',
    });
    await service.deliver(input);
    expect(botNotifications.sendToWorkspace).toHaveBeenCalled();
    expect(prisma.operationsNotification.update).not.toHaveBeenCalled();
  });
});
