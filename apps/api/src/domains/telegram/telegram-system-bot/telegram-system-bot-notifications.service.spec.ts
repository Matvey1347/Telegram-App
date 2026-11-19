import { TelegramSystemBotNotificationsService } from './telegram-system-bot-notifications.service';
import { TelegramBotApiError } from '@api/telegram/shared/bot/telegram-bot-api.client';

describe('TelegramSystemBotNotificationsService', () => {
  const customText =
    '<a href="https://t.me/news"><tg-emoji emoji-id="42">📢</tg-emoji> News</a>';
  const rejected = (
    message = 'Bad Request: CUSTOM_EMOJI_NOT_ALLOWED',
    errorCode = 400,
    explicitRejected = true,
  ) =>
    new TelegramBotApiError(message, 'PERMANENT', {
      explicitRejected,
      errorCode,
    });

  function delivery(firstError: Error) {
    const handler = {
      sendSystemMessage: jest
        .fn()
        .mockRejectedValueOnce(firstError)
        .mockResolvedValue({ status: 'SENT' }),
    };
    const prisma = {
      workspace: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ telegramNotificationUserChatId: '12345' }),
      },
    };
    const service = new TelegramSystemBotNotificationsService(
      prisma as any,
      handler as any,
    );
    return {
      handler,
      send: () =>
        service.sendToWorkspaceUser({
          workspaceId: 'workspace-a',
          userId: 'actor',
          text: customText,
          parseMode: 'HTML',
        }),
    };
  }

  it('uses the Unicode ALT once when Telegram explicitly rejects custom emoji', async () => {
    const { handler, send } = delivery(rejected());
    await expect(send()).resolves.toEqual({ status: 'SENT' });
    expect(handler.sendSystemMessage).toHaveBeenCalledTimes(2);
    expect(handler.sendSystemMessage.mock.calls[1][0].text).toBe(
      '<a href="https://t.me/news">📢 News</a>',
    );
  });

  it.each([
    new Error('network timeout'),
    rejected('CUSTOM_EMOJI_NOT_ALLOWED', 400, false),
    rejected('Too Many Requests', 429),
    rejected('Bad Request: chat not found'),
  ])('never retries an ambiguous or unrelated failure: %s', async (error) => {
    const { handler, send } = delivery(error);
    await expect(send()).rejects.toBe(error);
    expect(handler.sendSystemMessage).toHaveBeenCalledTimes(1);
  });

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
