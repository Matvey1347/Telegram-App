import { AccountService } from './account.service';

describe('AccountService global profile', () => {
  const membership = {
    id: 'member-bohdan',
    workspaceId: 'workspace-bohdan',
    role: 'owner',
    avatarIconId: null,
    avatarIcon: null,
    telegramUsername: null,
    workspace: {
      id: 'workspace-bohdan',
      name: 'bohdan',
      timezone: 'Europe/Warsaw',
      avatarIcon: null,
    },
  };

  it('returns the same personal avatar and Telegram account in another workspace', async () => {
    const profileAvatar = {
      id: 'avatar-business',
      type: 'image',
      name: 'Profile photo',
      emoji: null,
      imageUrl: 'https://example.test/avatar.jpg',
    };
    const profileAccount = {
      id: 'telegram-business',
      label: '@owner',
      telegramUserId: '100',
      username: 'owner',
      firstName: 'Owner',
      lastName: null,
      photoUrl: null,
      status: 'connected',
      isPremium: false,
      captionLengthMax: 1_024,
      messageLengthMax: 4_096,
      premiumCheckedAt: null,
      premiumCapabilities: null,
    };
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'owner@example.test',
          name: 'Owner',
          createdAt: new Date('2026-01-01'),
          editorShortcuts: null,
          locale: 'en',
          profileAvatarIconId: profileAvatar.id,
          profileAvatarIcon: profileAvatar,
          telegramUsername: null,
          profileTelegramUserAccount: profileAccount,
        }),
      },
      telegramUserAccountIntegration: { findMany: jest.fn() },
    };
    const service = new AccountService(
      prisma as never,
      {
        resolveWorkspaceMembershipForUser: jest
          .fn()
          .mockResolvedValue(membership),
      } as never,
      {} as never,
    );

    const result = await service.me('user-1');

    expect(result).toMatchObject({
      avatarIconId: 'avatar-business',
      avatarPresentation: { url: 'https://example.test/avatar.jpg' },
      assignedTelegramUserAccounts: [
        { id: 'telegram-business', username: 'owner' },
      ],
    });
    expect(
      prisma.telegramUserAccountIntegration.findMany,
    ).not.toHaveBeenCalled();
  });

  it('stores personal avatar and username for every workspace membership', async () => {
    const tx = {
      icon: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'global-avatar-1' }),
        update: jest.fn(),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };
    const prisma = {
      icon: {
        findFirst: jest.fn().mockResolvedValue({
          type: 'image',
          emoji: null,
          imageUrl: 'https://example.test/avatar.jpg',
        }),
      },
      workspaceMember: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { workspaceId: 'workspace-business' },
            { workspaceId: 'workspace-bohdan' },
          ]),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const attribution = {
      reattributeWorkspaceInviteLinks: jest.fn(),
    };
    const service = new AccountService(
      prisma as never,
      {
        resolveWorkspaceMembershipForUser: jest
          .fn()
          .mockResolvedValue(membership),
      } as never,
      attribution as never,
    );
    jest.spyOn(service, 'me').mockResolvedValue({ ok: true } as never);

    await service.updateMe('user-1', {
      avatarIconId: 'avatar-1',
      telegramUsername: '@owner',
    });

    expect(tx.workspaceMember.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: {
        avatarIconId: 'global-avatar-1',
        telegramUsername: 'owner',
      },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        profileAvatarIcon: { connect: { id: 'global-avatar-1' } },
        telegramUsername: 'owner',
      },
    });
    expect(attribution.reattributeWorkspaceInviteLinks).toHaveBeenCalledTimes(
      2,
    );
  });

  it('keeps a cleared connected account empty instead of restoring a workspace assignment', async () => {
    const tx = {
      user: { update: jest.fn().mockResolvedValue({}) },
      workspaceMember: { updateMany: jest.fn() },
      telegramUserAccountIntegration: { findMany: jest.fn() },
    };
    const prisma = {
      workspaceMember: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ workspaceId: 'workspace-bohdan' }]),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new AccountService(
      prisma as never,
      {
        resolveWorkspaceMembershipForUser: jest
          .fn()
          .mockResolvedValue(membership),
      } as never,
      { reattributeWorkspaceInviteLinks: jest.fn() } as never,
    );
    jest.spyOn(service, 'me').mockResolvedValue({ ok: true } as never);

    await service.updateMe('user-1', { telegramUserAccountIds: [] });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { profileTelegramUserAccount: { disconnect: true } },
    });
    expect(tx.telegramUserAccountIntegration.findMany).not.toHaveBeenCalled();
  });

  it('rejects an account created by the user after it was assigned to somebody else', async () => {
    const tx = {
      user: { update: jest.fn() },
      workspaceMember: { updateMany: jest.fn() },
      telegramUserAccountIntegration: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new AccountService(
      {
        $transaction: jest.fn(
          async (callback: (client: typeof tx) => unknown) => callback(tx),
        ),
      } as never,
      {
        resolveWorkspaceMembershipForUser: jest
          .fn()
          .mockResolvedValue(membership),
      } as never,
      {} as never,
    );

    await expect(
      service.updateMe('user-1', {
        telegramUserAccountIds: ['account-assigned-to-someone-else'],
      }),
    ).rejects.toMatchObject({
      response: { code: 'ACCOUNT_TELEGRAM_ACCOUNTS_NOT_FOUND' },
    });
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
