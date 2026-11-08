import { AiPostingAutopilotNotificationsService } from './ai-posting-autopilot-notifications.service';
import { OperationsNotificationPermissionService } from './operations-notification-permission.service';

describe('AiPostingAutopilotNotificationsService', () => {
  it('retries failed Telegram delivery without creating duplicate notifications', async () => {
    const delivery: any = {
      id: 'delivery-1',
      memberId: 'member-1',
      transport: 'TELEGRAM_BOT',
      status: 'PENDING',
      attempts: 0,
    };
    const prisma: any = {
      workspaceMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'member-1',
            workspaceId: 'ws-1',
            userId: 'user-1',
            role: 'owner',
            createdAt: new Date(),
            roleDefinition: null,
            user: {
              email: 'member@example.test',
              telegramSystemBotConnection: {
                enabled: true,
                telegramChatId: 'chat-1',
              },
            },
          },
        ]),
      },
      telegramAiPostingNotificationPreference: {
        findMany: jest.fn().mockResolvedValue([
          {
            memberId: 'member-1',
            eventKey: '*',
            channelScopeKey: '*',
            telegramBot: true,
            pwaPush: true,
            email: false,
          },
        ]),
      },
      $transaction: jest.fn((work) => work({})),
      operationsNotification: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'notification-1', recipientMemberId: 'member-1' },
          ]),
      },
      telegramAiPostingNotificationDelivery: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest
          .fn()
          .mockImplementation(async () =>
            (delivery.status === 'PENDING' || delivery.status === 'FAILED') &&
            (!delivery.nextAttemptAt || delivery.nextAttemptAt <= new Date())
              ? [{ ...delivery }]
              : [],
          ),
        updateMany: jest.fn().mockImplementation(async ({ data }: any) => {
          if (data.status === 'SENDING') {
            if (delivery.status === 'SENDING') return { count: 0 };
            delivery.status = 'SENDING';
            delivery.attempts++;
          } else {
            delivery.status = data.status;
            if ('nextAttemptAt' in data)
              delivery.nextAttemptAt = data.nextAttemptAt;
          }
          return { count: 1 };
        }),
      },
    };
    const store: any = {
      insertMany: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'notification-1' }])
        .mockResolvedValueOnce([]),
    };
    const publisher: any = {
      publish: jest.fn().mockResolvedValue({
        attempted: 1,
        delivered: 1,
        failed: 0,
        skipped: 0,
      }),
    };
    const bot: any = {
      sendMessage: jest
        .fn()
        .mockRejectedValueOnce(new Error('temporary'))
        .mockResolvedValueOnce(undefined),
    };
    const systemBot: any = { token: 'bot-token' };
    const email: any = { send: jest.fn() };
    const service = new AiPostingAutopilotNotificationsService(
      prisma,
      store,
      publisher,
      new OperationsNotificationPermissionService(),
      bot,
      systemBot,
      email,
    );
    const input = {
      workspaceId: 'ws-1',
      channelId: 'channel-1',
      runId: 'run-1',
      event: 'CRITICAL_DRAFT_STOCK' as const,
      title: 'Critical stock',
      body: 'Draft count is low',
    };

    const first = await service.notify(input);
    delivery.nextAttemptAt = new Date(Date.now() - 1);
    const second = await service.notify(input);

    expect(first.failed).toBe(1);
    expect(second.failed).toBe(0);
    expect(bot.sendMessage).toHaveBeenCalledTimes(2);
    expect(store.insertMany).toHaveBeenCalledTimes(2);
    // Notification creation is deduped; retries only resume the failed transport.
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(delivery.status).toBe('SENT');
    expect(delivery.attempts).toBe(2);
  });

  it('does not deliver to members without notification permission', async () => {
    const prisma: any = {
      workspaceMember: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AiPostingAutopilotNotificationsService(
      prisma,
      {} as any,
      {} as any,
      new OperationsNotificationPermissionService(),
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.notify({
        workspaceId: 'ws',
        channelId: 'channel',
        runId: 'run',
        event: 'WEEKLY_REPORT',
        title: 'Weekly report',
        body: 'Summary',
      }),
    ).resolves.toMatchObject({ recipients: 0 });
  });
});
