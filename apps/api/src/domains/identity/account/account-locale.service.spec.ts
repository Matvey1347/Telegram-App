import { AccountService } from './account.service';

describe('AccountService locale preference', () => {
  it('updates locale through the narrow path without loading account relations', async () => {
    const prisma = {
      user: { update: jest.fn().mockResolvedValue({ locale: 'ru' }) },
    } as any;
    const workspaceService = {
      resolveWorkspaceMembershipForUser: jest.fn(),
    } as any;
    const service = new AccountService(
      prisma,
      workspaceService,
      { reattributeWorkspaceInviteLinks: jest.fn() } as any,
    );

    await expect(service.updateLocale('user-1', 'ru')).resolves.toEqual({
      locale: 'ru',
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { locale: 'ru' },
      select: { locale: true },
    });
    expect(
      workspaceService.resolveWorkspaceMembershipForUser,
    ).not.toHaveBeenCalled();
  });

  it('persists a supported locale and returns the normalized preference', async () => {
    const membership = {
      id: 'member-1',
      workspaceId: 'workspace-1',
      role: 'owner',
      avatarIconId: null,
      avatarIcon: null,
      telegramUsername: null,
      workspace: {
        id: 'workspace-1',
        name: 'Workspace',
        timezone: 'Europe/Warsaw',
        avatarIcon: null,
      },
    };
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      locale: 'ru',
      createdAt: new Date(),
      editorShortcuts: null,
    };
    const tx = { user: { update: jest.fn().mockResolvedValue(user) } };
    const prisma = {
      $transaction: jest.fn(async (action: (client: typeof tx) => unknown) =>
        action(tx),
      ),
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue(user) },
      telegramUserAccountIntegration: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;
    const workspaceService = {
      resolveWorkspaceMembershipForUser: jest
        .fn()
        .mockResolvedValue(membership),
    } as any;
    const service = new AccountService(
      prisma,
      workspaceService,
      { reattributeWorkspaceInviteLinks: jest.fn() } as any,
    );

    await expect(service.updateMe('user-1', { locale: 'ru' })).resolves.toEqual(
      expect.objectContaining({ locale: 'ru' }),
    );
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { locale: 'ru' },
    });
  });
});
