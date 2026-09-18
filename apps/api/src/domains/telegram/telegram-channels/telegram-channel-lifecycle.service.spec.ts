import { BadRequestException } from '@nestjs/common';
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

  it('enforces zero seed adjustments when the channel is marked as no-seed', async () => {
    const update = jest.fn((input: { data: Record<string, unknown> }) => {
      void input;
      return Promise.resolve({});
    });
    const tx = {
      telegramChannel: { update },
    };
    const prisma = {
      icon: { findFirst: jest.fn() },
      telegramInviteLink: { findFirst: jest.fn() },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const support = {
      workspace: jest.fn().mockResolvedValue('workspace-1'),
      normalizeUsername: jest.fn(),
    };
    const importPolicy = {
      resolveImportPolicy: jest.fn().mockResolvedValue({
        acquisitionType: 'CREATED',
        postsSyncFrom: null,
        inviteLinksSyncFrom: null,
        purchaseTransactionId: null,
      }),
    };
    const catalog = {
      findOne: jest.fn().mockResolvedValue({
        id: 'channel-1',
        targetCpa: null,
        stopCpaFrom: null,
      }),
    };
    const service = new TelegramChannelLifecycleService(
      prisma as never,
      {} as never,
      support as never,
      importPolicy as never,
      {} as never,
      catalog as never,
      {} as never,
    );

    await service.update('user-1', 'channel-1', {
      seedDisabled: true,
      seedSubscribersCount: 100,
      knownFakeSubscribersCount: 25,
      ownViewsPerPost: 40,
      ownReactionsPerPost: 5,
    });

    expect(update.mock.calls[0]?.[0]?.data).toMatchObject({
      seedDisabled: true,
      seedSubscribersCount: 0,
      knownFakeSubscribersCount: 0,
      ownViewsPerPost: 0,
      ownReactionsPerPost: 0,
    });
  });

  it('rejects a bot invite link that is not active for this channel', async () => {
    const prisma = {
      icon: { findFirst: jest.fn() },
      telegramInviteLink: {
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const support = {
      workspace: jest.fn().mockResolvedValue('workspace-1'),
    };
    const importPolicy = {
      resolveImportPolicy: jest.fn().mockResolvedValue({
        acquisitionType: 'CREATED',
        postsSyncFrom: null,
        inviteLinksSyncFrom: null,
        purchaseTransactionId: null,
      }),
    };
    const catalog = {
      findOne: jest.fn().mockResolvedValue({
        id: 'channel-1',
        targetCpa: null,
        stopCpaFrom: null,
      }),
    };
    const service = new TelegramChannelLifecycleService(
      prisma as never,
      {} as never,
      support as never,
      importPolicy as never,
      {} as never,
      catalog as never,
      {} as never,
    );

    await expect(
      service.update('user-1', 'channel-1', {
        botInviteLinkId: 'another-channel-link',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Purpose-specific invite links must belong to this channel',
      ),
    );
  });

  it.each([
    ['broadcastInviteLinkId', 'another-channel-broadcast-link'],
    ['audienceTransferInviteLinkId', 'another-channel-transfer-link'],
  ] as const)('rejects an invalid purpose link in %s', async (field, value) => {
    const prisma = {
      icon: { findFirst: jest.fn() },
      telegramInviteLink: {
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new TelegramChannelLifecycleService(
      prisma as never,
      {} as never,
      { workspace: jest.fn().mockResolvedValue('workspace-1') } as never,
      {
        resolveImportPolicy: jest.fn().mockResolvedValue({
          acquisitionType: 'CREATED',
          postsSyncFrom: null,
          inviteLinksSyncFrom: null,
          purchaseTransactionId: null,
        }),
      } as never,
      {} as never,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'channel-1',
          targetCpa: null,
          stopCpaFrom: null,
        }),
      } as never,
      {} as never,
    );

    await expect(
      service.update('user-1', 'channel-1', { [field]: value }),
    ).rejects.toThrow(
      new BadRequestException(
        'Purpose-specific invite links must belong to this channel',
      ),
    );
  });

  it('rejects assigning one invite link to multiple traffic sources', async () => {
    const service = new TelegramChannelLifecycleService(
      {} as never,
      {} as never,
      { workspace: jest.fn().mockResolvedValue('workspace-1') } as never,
      {
        resolveImportPolicy: jest.fn().mockResolvedValue({
          acquisitionType: 'CREATED',
          postsSyncFrom: null,
          inviteLinksSyncFrom: null,
          purchaseTransactionId: null,
        }),
      } as never,
      {} as never,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'channel-1',
          targetCpa: null,
          stopCpaFrom: null,
          botInviteLinkId: 'shared-link',
          broadcastInviteLinkId: null,
          audienceTransferInviteLinkId: null,
          folderDefaultInviteLinkIds: [],
          mutualPromotionInviteLinkIds: [],
        }),
      } as never,
      {} as never,
    );

    await expect(
      service.update('user-1', 'channel-1', {
        broadcastInviteLinkId: 'shared-link',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Each traffic source must use a different invite link',
      ),
    );
  });
});
