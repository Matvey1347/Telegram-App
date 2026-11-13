import { TelegramSystemBotNotificationsService } from '../../telegram/telegram-system-bot/telegram-system-bot-notifications.service';
import { ChannelReminderDeliveryService } from './channel-reminder-delivery.service';

const input = { workspaceId: 'workspace', memberId: 'member', sourceKey: 'day:1', title: 'Reminder', body: 'Channel' };

function setup(options: { sent?: boolean; existing?: boolean; result?: string } = {}) {
  const prisma = {
    workspaceMember: { findFirst: jest.fn().mockResolvedValue({}) },
    operationsNotification: {
      findUnique: jest.fn().mockResolvedValue({ id: 'notice', channelReminderTelegramSentAt: null }),
      findFirst: jest.fn().mockResolvedValue(options.sent ? { id: 'sent-notice' } : null),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (callback) => callback({})),
  };
  const store = { insertMany: jest.fn().mockResolvedValue(options.existing ? [] : [{ id: 'notice' }]) };
  const publisher = { publish: jest.fn() };
  const botNotifications = { sendToWorkspace: jest.fn().mockResolvedValue({ status: options.result ?? 'SENT' }) };
  const moduleRef = { resolve: jest.fn().mockResolvedValue(botNotifications) };
  const service = new ChannelReminderDeliveryService(
    prisma as never, store as never, publisher as never,
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
    expect(botNotifications.sendToWorkspace).toHaveBeenCalledWith('workspace', 'Reminder\n\nChannel');
    expect(prisma.operationsNotification.update).toHaveBeenCalled();
  });

  it('does not send a second group message for another recipient of the same occurrence', async () => {
    const { service, publisher, botNotifications } = setup({ sent: true, existing: true });
    await service.deliver(input);
    expect(publisher.publish).toHaveBeenCalledWith(['notice']);
    expect(botNotifications.sendToWorkspace).not.toHaveBeenCalled();
  });

  it('leaves an unavailable group delivery retryable', async () => {
    const { service, prisma, botNotifications } = setup({ result: 'NOT_CONNECTED' });
    await service.deliver(input);
    expect(botNotifications.sendToWorkspace).toHaveBeenCalled();
    expect(prisma.operationsNotification.update).not.toHaveBeenCalled();
  });
});
