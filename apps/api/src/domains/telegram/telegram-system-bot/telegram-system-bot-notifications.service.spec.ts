import { TelegramSystemBotNotificationsService } from './telegram-system-bot-notifications.service';

describe('TelegramSystemBotNotificationsService', () => {
  it('routes by persisted subscription membership, not current workspace', async () => {
    const prisma = {
      telegramSystemBotTaskSubscription: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ connection: { telegramChatId: '44' } }]),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Business' }),
      },
    } as any;
    const handler = {
      sendTaskNotification: jest.fn().mockResolvedValue({ status: 'SENT' }),
    } as any;
    const service = new TelegramSystemBotNotificationsService(prisma, handler);

    await expect(
      service.notify({
        taskKey: 'telegram.channels.full_sync',
        taskName: 'Channels sync',
        workspaceId: 'workspace-a',
        runId: 'run',
        status: 'SUCCESS',
        resultSummary: 'Successful: 8/8',
        durationMs: 41_000,
        errorReason: null,
      }),
    ).resolves.toEqual({ status: 'DELIVERED', sent: 1 });

    const where =
      prisma.telegramSystemBotTaskSubscription.findMany.mock.calls[0][0].where;
    expect(where.connection).not.toHaveProperty('currentWorkspaceId');
    expect(where.connection.user.memberships).toEqual({
      some: { workspaceId: 'workspace-a' },
    });
    expect(handler.sendTaskNotification).toHaveBeenCalledWith({
      chatId: '44',
      text: expect.stringContaining('Successful: 8/8'),
    });
  });
});
