import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TelegramInviteLinkRegistrationService } from './telegram-invite-link-registration.service';

describe('TelegramInviteLinkRegistrationService', () => {
  const channel = {
    id: 'channel-1',
    username: 'channel',
    telegramChatId: '1001',
    inviteLink: null,
    telegramAccessHash: '55',
  };
  const remote = {
    url: 'https://t.me/+valid',
    title: 'Legacy link',
    telegramCreatorUserId: '42',
    creatorUsername: 'owner',
    creatorFirstName: 'Owner',
    creatorLastName: null,
    creatorPhotoUrl: 'data:image/jpeg;base64,avatar',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    startDate: null,
    expireDate: null,
    usageLimit: null,
    usage: 3,
    requested: 0,
    requestNeeded: false,
    permanent: true,
    revoked: false,
  };

  function createService(overrides?: {
    foundChannel?: typeof channel | null;
    remote?: typeof remote;
  }) {
    const foundChannel =
      overrides &&
      Object.prototype.hasOwnProperty.call(overrides, 'foundChannel')
        ? overrides.foundChannel
        : channel;
    const prisma = {
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue(foundChannel),
      },
    };
    const workspaceService = {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
    };
    const access = {
      bestMtprotoAccountId: jest.fn().mockResolvedValue('account-1'),
      connectedAccount: jest.fn().mockResolvedValue({ id: 'account-1' }),
      accountCredentials: jest.fn().mockReturnValue({
        apiId: '1',
        apiHash: 'hash',
        session: 'session',
      }),
    };
    const mtproto = {
      getChannelInviteLink: jest
        .fn()
        .mockResolvedValue(overrides?.remote ?? remote),
      createChannelInviteLink: jest
        .fn()
        .mockResolvedValue(overrides?.remote ?? remote),
    };
    const attribution = {
      buildInviteAttributionMaps: jest.fn().mockResolvedValue({ members: [] }),
    };
    const inviteSync = {
      persistInviteLinkFromRemote: jest
        .fn()
        .mockResolvedValue({ upserted: { id: 'stored-link' } }),
    };
    const inviteCreator = {
      create: jest.fn().mockResolvedValue(overrides?.remote ?? remote),
    };
    const sourceAccess = {
      sourcesForChannel: jest.fn().mockResolvedValue([
        {
          sourceId: 'account-1',
          sourceType: 'MTPROTO',
          permissions: { canManageInviteLinks: true },
        },
      ]),
    };
    return {
      service: new TelegramInviteLinkRegistrationService(
        prisma as never,
        workspaceService as never,
        access as never,
        mtproto as never,
        inviteCreator as never,
        attribution as never,
        inviteSync as never,
        sourceAccess as never,
      ),
      prisma,
      mtproto,
      inviteCreator,
      inviteSync,
      sourceAccess,
    };
  }

  it('verifies and persists a legacy link for the workspace channel', async () => {
    const { service, prisma, mtproto, inviteSync } = createService();

    await expect(
      service.register('user-1', 'channel-1', 'https://t.me/+valid'),
    ).resolves.toEqual({
      id: 'stored-link',
      workspaceId: 'workspace-1',
      currentJoinedCount: 3,
      currentRequestedCount: 0,
      joinedWithinPeriod: null,
    });

    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'channel-1', workspaceId: 'workspace-1', isActive: true },
      }),
    );
    expect(mtproto.getChannelInviteLink).toHaveBeenCalledWith(
      expect.objectContaining({ channel, inviteLink: 'https://t.me/+valid' }),
    );
    expect(inviteSync.persistInviteLinkFromRemote).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        channelId: 'channel-1',
        link: remote,
      }),
    );
  });

  it('does not expose channels from another workspace', async () => {
    const { service, mtproto } = createService({ foundChannel: null });

    await expect(
      service.register('user-1', 'other-channel', 'https://t.me/+valid'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mtproto.getChannelInviteLink).not.toHaveBeenCalled();
  });

  it('rejects a revoked link without persisting it', async () => {
    const { service, inviteSync } = createService({
      remote: { ...remote, revoked: true },
    });

    await expect(
      service.register('user-1', 'channel-1', 'https://t.me/+revoked'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(inviteSync.persistInviteLinkFromRemote).not.toHaveBeenCalled();
  });

  it('creates and persists a named Telegram invite link with an authorized MTProto account', async () => {
    const { service, inviteCreator, inviteSync, sourceAccess } = createService();
    await expect(
      service.create('user-1', 'channel-1', {
        title: 'Mutual promotion',
        mtprotoAccountId: 'account-1',
      }),
    ).resolves.toEqual({ id: 'stored-link' });

    expect(sourceAccess.sourcesForChannel).toHaveBeenCalledWith(
      'workspace-1',
      'channel-1',
    );
    expect(inviteCreator.create).toHaveBeenCalledWith(
      expect.objectContaining({ channel, title: 'Mutual promotion' }),
    );
    expect(inviteSync.persistInviteLinkFromRemote).toHaveBeenCalledWith(
      expect.objectContaining({ link: remote }),
    );
  });

  it('passes the requested Telegram-only link settings to the MTProto creator', async () => {
    const { service, inviteCreator } = createService();
    const expiresAt = '2027-01-01T12:00:00.000Z';

    await service.create('user-1', 'channel-1', {
      title: 'Paid VP',
      requestNeeded: false,
      expiresAt,
      usageLimit: 50,
      monthlyFeeStars: 100,
    });

    expect(inviteCreator.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestNeeded: false,
        expiresAt: new Date(expiresAt),
        usageLimit: 50,
        monthlyFeeStars: 100,
      }),
    );
  });
});
