import { TelegramBotApiError } from '@api/telegram/shared/bot/telegram-bot-api.client';
import { ChannelReminderDeliveryService } from './channel-reminder-delivery.service';

const input = {
  workspaceId: 'workspace',
  memberId: 'member',
  sourceKey: 'day:1',
  title: 'Reminder',
  body: 'Channel',
};
function setup(
  options: { enabled?: boolean; sent?: boolean; existing?: boolean } = {},
) {
  const member = {
    user: {
      telegramSystemBotConnection: { enabled: true, telegramChatId: 'chat' },
    },
    operationsNotificationPreference: {
      channelRemindersTelegramEnabled: options.enabled ?? true,
    },
  };
  const prisma = {
    workspaceMember: { findFirst: jest.fn().mockResolvedValue(member) },
    operationsNotification: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'notice',
        channelReminderTelegramSentAt: options.sent ? new Date() : null,
      }),
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
  const bot = { sendMessage: jest.fn() };
  const service = new ChannelReminderDeliveryService(
    prisma as never,
    store as never,
    publisher as never,
    { canReceive: () => true, has: () => true } as never,
    bot as never,
    { token: 'token' } as never,
  );
  return { service, prisma, store, publisher, bot };
}
describe('channel reminder delivery', () => {
  it('publishes once and sends to the connected bot', async () => {
    const { service, publisher, bot, prisma } = setup();
    await service.deliver(input);
    expect(publisher.publish).toHaveBeenCalledWith(['notice']);
    expect(bot.sendMessage).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ chat_id: 'chat', text: 'Reminder\n\nChannel' }),
    );
    expect(prisma.operationsNotification.update).toHaveBeenCalled();
  });
  it('does not resend a delivered occurrence', async () => {
    const { service, publisher, bot } = setup({ sent: true, existing: true });
    await service.deliver(input);
    expect(publisher.publish).toHaveBeenCalledWith(['notice']);
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });
  it('leaves an unsuccessful send retryable', async () => {
    const { service, bot, prisma } = setup();
    bot.sendMessage.mockRejectedValue(new Error('network'));
    await expect(service.deliver(input)).rejects.toThrow('network');
    expect(prisma.operationsNotification.update).not.toHaveBeenCalled();
  });
  it('does not retry a permanent bot rejection forever', async () => {
    const { service, bot, prisma } = setup();
    bot.sendMessage.mockRejectedValue(
      new TelegramBotApiError('blocked', 'BLOCKED'),
    );
    await expect(service.deliver(input)).resolves.toBeUndefined();
    expect(prisma.operationsNotification.update).toHaveBeenCalled();
  });
  it('respects Telegram opt-out', async () => {
    const { service, bot } = setup({ enabled: false });
    await service.deliver(input);
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });
});
