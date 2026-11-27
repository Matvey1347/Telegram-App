import { BadRequestException } from '@nestjs/common';
import { TelegramChannelLifecycleService } from './telegram-channel-lifecycle.service';

describe('TelegramChannelLifecycleService system groups', () => {
  it('keeps CPM product currencies aligned with a changed channel base currency', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'channel-1' });
    const updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const prisma = {
      icon: { findFirst: jest.fn() },
      telegramInviteLink: {
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(async (work) =>
        work({
          telegramChannel: { update },
          telegramAdProduct: { updateMany },
        }),
      ),
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
      {
        workspace: jest.fn().mockResolvedValue('workspace-1'),
        normalizeUsername: jest.fn(),
      } as never,
      {
        resolveImportPolicy: jest.fn().mockResolvedValue({
          acquisitionType: 'CREATED',
          postsSyncFrom: null,
          inviteLinksSyncFrom: null,
          purchaseTransactionId: null,
        }),
      } as never,
      {} as never,
      catalog as never,
      {} as never,
    );

    await service.update('user-1', 'channel-1', { adBaseCurrency: 'uah' });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        telegramChannelId: 'channel-1',
        defaultPricingMode: 'CPM',
      },
      data: { currency: 'UAH' },
    });
  });

  it('allows a CPM-only update when the channel keeps an unavailable legacy emoji', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'channel-1' });
    const prisma = {
      icon: { findFirst: jest.fn() },
      telegramInviteLink: {
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      telegramChannel: { update },
      $transaction: jest.fn(async (work) =>
        work({ telegramChannel: { update } }),
      ),
    };
    const service = new TelegramChannelLifecycleService(
      prisma as never,
      {} as never,
      {
        workspace: jest.fn().mockResolvedValue('workspace-1'),
        normalizeUsername: jest.fn(),
      } as never,
      { resolveImportPolicy: jest.fn().mockResolvedValue({}) } as never,
      {} as never,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'channel-1',
          targetCpa: null,
          stopCpaFrom: null,
          presentationIconId: 'legacy-icon',
        }),
      } as never,
      {} as never,
    );

    await expect(
      service.update('user-1', 'channel-1', {
        internalCpm: 100,
        presentationIconId: 'legacy-icon',
      }),
    ).resolves.toBeDefined();
    expect(prisma.icon.findFirst).not.toHaveBeenCalled();
  });
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
    const avatarEmojis = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const service = new TelegramChannelLifecycleService(
      prisma as never,
      workspaceService as never,
      support as never,
      {} as never,
      {} as never,
      {} as never,
      groups as never,
      avatarEmojis as never,
    );

    await service.create('user-1', {
      title: 'Channel',
      username: '@channel_username',
      assignedMemberId: null,
    });

    expect(avatarEmojis.enqueue).toHaveBeenCalledWith('workspace-1', 'channel-1');
    expect(groups.ensureRequiredChannelSystemGroups).toHaveBeenCalledWith(
      tx,
      'workspace-1',
      'channel-1',
      'current-member',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
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


describe('channel manual emoji selection', () => {
  it('records a changed selection as manual and validates it within the workspace', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'channel' });
    const icon = { findFirst: jest.fn().mockResolvedValue({ id: 'chosen' }) };
    const tx = { telegramChannel: { update } };
    const prisma = {
      icon,
      $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    };
    const catalog = {
      findOne: jest
        .fn()
        .mockResolvedValue({
          id: 'channel',
          presentationIconId: 'avatar',
          targetCpa: null,
          stopCpaFrom: null,
        }),
    };
    const service = new TelegramChannelLifecycleService(
      prisma as never,
      {} as never,
      { workspace: jest.fn().mockResolvedValue('workspace') } as never,
      { resolveImportPolicy: jest.fn().mockResolvedValue({}) } as never,
      {} as never,
      catalog as never,
      {} as never,
    );
    await service.update('user', 'channel', { presentationIconId: 'chosen' });
    expect(icon.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'chosen',
          type: 'emoji',
          OR: [{ workspaceId: 'workspace' }, { workspaceId: null }],
        },
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          presentationIconId: 'chosen',
          avatarEmojiManual: true,
        }),
      }),
    );
  });
});
