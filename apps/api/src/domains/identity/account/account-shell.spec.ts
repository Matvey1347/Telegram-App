import { AccountService } from './account.service';

describe('AccountService shell read model', () => {
  it('returns only shell identity fields and resolves avatar against active workspace member', async () => {
    const memberAvatar = { id: 'icon-1', type: 'emoji', name: 'Leaf', emoji: '🌿' };
    const prisma = {
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'user-1', email: 'user@example.com', name: 'User', locale: 'ru', profileAvatarIcon: null,
      }) },
    } as any;
    const workspaceService = {
      resolveWorkspaceMembershipForUser: jest.fn().mockResolvedValue({ id: 'member-1', avatarIcon: memberAvatar }),
    } as any;
    const service = new AccountService(prisma, workspaceService, {} as any);

    await expect(service.shell('user-1')).resolves.toMatchObject({
      id: 'user-1', workspaceMemberId: 'member-1', email: 'user@example.com', name: 'User', locale: 'ru',
      avatarPresentation: { type: 'unicode', value: '🌿' },
    });
    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, email: true, name: true, locale: true, profileAvatarIcon: true },
    });
  });
});
