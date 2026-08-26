import { TelegramChannelLifecycleService } from './telegram-channel-lifecycle.service';

describe('TelegramChannelLifecycleService system groups', () => {
  it('provisions required system groups atomically when a channel is created', async () => {
    const tx = {
      telegramChannel: {
        create: jest.fn().mockResolvedValue({ id: 'channel-1' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'channel-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const workspaceService = {
      resolveAssignedMemberId: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-1',
        assignedMemberId: null,
        currentMembership: { id: 'current-member' },
      }),
    };
    const support = {
      normalizeUsername: jest.fn().mockReturnValue('channel_username'),
    };
    const groups = {
      ensureRequiredChannelSystemGroups: jest.fn().mockResolvedValue({
        advertise: { id: 'advertise-group-1' },
        systemBotPosts: { id: 'system-bot-posts-group-1' },
      }),
    };
    const service = new TelegramChannelLifecycleService(
      prisma as never,
      workspaceService as never,
      support as never,
      {} as never,
      {} as never,
      {} as never,
      groups as never,
    );

    await service.create('user-1', {
      title: 'Channel',
      username: '@channel_username',
      assignedMemberId: null,
    });

    expect(groups.ensureRequiredChannelSystemGroups).toHaveBeenCalledWith(
      tx,
      'workspace-1',
      'channel-1',
      'current-member',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
