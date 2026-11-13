import { TelegramSystemBotNotificationsService } from './telegram-system-bot-notifications.service';

describe('TelegramSystemBotNotificationsService', () => {
  it('routes user-directed workspace notifications to the selected workspace Telegram account', async () => {
    const prisma = {
      workspace: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ telegramNotificationUserChatId: '12345' }),
      },
    } as any;
    const handler = {
      sendSystemMessage: jest.fn().mockResolvedValue({ status: 'SENT' }),
    } as any;
    const service = new TelegramSystemBotNotificationsService(prisma, handler);

    await expect(
      service.sendToWorkspaceUser({
        workspaceId: 'workspace-a',
        userId: 'personal-user',
        text: 'Ad booked',
      }),
    ).resolves.toEqual({ status: 'SENT' });
    expect(handler.sendSystemMessage).toHaveBeenCalledWith({
      chatId: '12345',
      text: 'Ad booked',
      parseMode: undefined,
    });
  });

  it('keeps group delivery independent from personal workspace account delivery', async () => {
    const prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          telegramNotificationUserChatId: '12345',
          telegramNotificationChatId: '-1001',
        }),
      },
    } as any;
    const handler = {
      sendSystemMessage: jest.fn().mockResolvedValue({ status: 'SENT' }),
    } as any;
    const service = new TelegramSystemBotNotificationsService(prisma, handler);

    await expect(
      service.sendToWorkspace('workspace-a', 'Urgent issue'),
    ).resolves.toEqual({ status: 'SENT' });
    expect(handler.sendSystemMessage).toHaveBeenCalledWith({
      chatId: '-1001',
      text: 'Urgent issue',
      parseMode: undefined,
    });
  });

  it('delivers scheduled task failures once to the workspace group and suppresses success noise', async () => {
    const prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Business',
          telegramNotificationChatId: '-1001',
        }),
      },
    } as any;
    const handler = {
      sendTaskNotification: jest.fn().mockResolvedValue({ status: 'SENT' }),
    } as any;
    const service = new TelegramSystemBotNotificationsService(prisma, handler);
    const input = {
      taskKey: 'telegram.managed_posts.sync',
      taskName: 'Managed posts sync',
      workspaceId: 'workspace-a',
      runId: 'run',
      resultSummary: null,
      durationMs: 2_000,
      errorReason: 'Telegram unavailable',
    } as const;

    await expect(
      service.notify({ ...input, status: 'SUCCESS' }),
    ).resolves.toEqual({ status: 'SKIPPED', sent: 0 });
    await expect(
      service.notify({ ...input, status: 'FAILED' }),
    ).resolves.toEqual({ status: 'SENT', sent: 1 });
    expect(handler.sendTaskNotification).toHaveBeenCalledTimes(1);
    expect(handler.sendTaskNotification).toHaveBeenCalledWith({
      chatId: '-1001',
      text: expect.stringContaining('Telegram unavailable'),
    });
  });
});
