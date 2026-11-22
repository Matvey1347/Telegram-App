import { TelegramInviteLinkMaintenanceService } from './telegram-invite-link-maintenance.service';

function setup(remoteResults: unknown[]) {
  const channel = {
    id: 'channel-1',
    title: 'Managed channel',
    username: 'managed',
    telegramChatId: '-1001',
    telegramAccessHash: 'access-hash',
    inviteLink: null,
    publicInviteLinkId: 'public-link',
    defaultInviteLinkId: 'main-link',
    botInviteLinkId: null,
    broadcastInviteLinkId: null,
    audienceTransferInviteLinkId: null,
    folderDefaultInviteLinkIds: [],
    mutualPromotionInviteLinkIds: [],
    inviteLinks: [
      { id: 'public-link', name: 'Public', url: 'https://t.me/+public' },
      { id: 'main-link', name: 'Main', url: 'https://t.me/+main' },
    ],
  };
  const prisma = {
    telegramChannel: {
      findFirst: jest.fn().mockResolvedValue(channel),
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
  const workspaceService = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
  };
  const access = {
    connectedAccount: jest.fn().mockResolvedValue({ id: 'account-1' }),
    accountCredentials: jest.fn().mockReturnValue({
      apiId: 'api-id',
      apiHash: 'api-hash',
      session: 'session',
    }),
    mtprotoChannelReference: jest.fn().mockReturnValue({
      username: 'managed',
      telegramChatId: '-1001',
      inviteLink: null,
    }),
  };
  const mtproto = {
    getChannelInviteLink: jest.fn(() => {
      const result = remoteResults.shift();
      if (result instanceof Error) return Promise.reject(result);
      return Promise.resolve(result);
    }),
  };
  const registration = {
    create: jest
      .fn()
      .mockImplementation(
        (
          _user: string,
          _channel: string,
          input: { requestNeeded: boolean },
        ) => ({
          id: input.requestNeeded ? 'new-request-link' : 'new-open-link',
        }),
      ),
  };
  return {
    channel,
    prisma,
    access,
    mtproto,
    registration,
    service: new TelegramInviteLinkMaintenanceService(
      prisma as never,
      workspaceService as never,
      access as never,
      mtproto as never,
      registration as never,
    ),
  };
}

describe('Telegram invite link maintenance', () => {
  it('recreates a confirmed inactive link with join requests for non-public roles', async () => {
    const { service, registration, prisma } = setup([
      { revoked: false, expireDate: null },
      { revoked: true, expireDate: null },
    ]);

    await expect(
      service.refreshInactive('user-1', 'channel-1', 'account-1'),
    ).resolves.toMatchObject({
      checkedLinks: 2,
      replacedLinks: 1,
      unavailableLinks: 0,
    });
    expect(registration.create).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      expect.objectContaining({
        mtprotoAccountId: 'account-1',
        requestNeeded: true,
      }),
    );
    expect(prisma.telegramChannel.update).toHaveBeenCalledWith({
      where: { id: 'channel-1' },
      data: { defaultInviteLinkId: 'new-request-link' },
    });
  });

  it('creates an open replacement for a confirmed inactive public link', async () => {
    const { service, registration, prisma } = setup([
      { revoked: true, expireDate: null },
      { revoked: false, expireDate: null },
    ]);

    await service.refreshInactive('user-1', 'channel-1', 'account-1');
    expect(registration.create).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      expect.objectContaining({
        requestNeeded: false,
      }),
    );
    expect(prisma.telegramChannel.update).toHaveBeenCalledWith({
      where: { id: 'channel-1' },
      data: { publicInviteLinkId: 'new-open-link' },
    });
  });

  it('leaves an unverified link unchanged when Telegram cannot confirm its status', async () => {
    const { service, registration, prisma } = setup([
      new Error('Telegram unavailable'),
      { revoked: false, expireDate: null },
    ]);

    await expect(
      service.refreshInactive('user-1', 'channel-1', 'account-1'),
    ).resolves.toMatchObject({
      checkedLinks: 2,
      replacedLinks: 0,
      unavailableLinks: 1,
    });
    expect(registration.create).not.toHaveBeenCalled();
    expect(prisma.telegramChannel.update).not.toHaveBeenCalled();
  });
});
