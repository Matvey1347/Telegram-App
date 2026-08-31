import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { WorkspaceMembersService } from './workspace-members.service';

describe('WorkspaceMembersService create identity', () => {
  const member = {
    id: 'member-1',
    userId: 'new-user',
    user: { id: 'new-user', name: 'New user', email: 'new@example.com' },
    avatarIcon: null,
    assignedTelegramUserAccounts: [],
  };

  const setup = (
    accounts: Array<{ id: string; assignedMemberId: string | null }>,
    roleDefinition: { id: string; systemKey: 'OWNER' | null } | null = {
      id: 'role-content',
      systemKey: null,
    },
  ) => {
    const tx = {
      workspaceMember: {
        create: jest.fn().mockResolvedValue(member),
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...member,
          assignedTelegramUserAccounts: [{ id: 'account-1' }],
        }),
      },
      telegramUserAccountIntegration: {
        findMany: jest.fn().mockResolvedValue(accounts),
        updateMany: jest.fn().mockResolvedValue({ count: accounts.length }),
      },
      telegramInviteLink: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(member.user) },
      workspaceRoleDefinition: {
        findFirst: jest.fn().mockResolvedValue(roleDefinition),
      },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const workspaceService = {
      requireWorkspaceRole: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-1',
        role: WorkspaceRole.owner,
      }),
    };
    return {
      service: new WorkspaceMembersService(
        prisma as never,
        workspaceService as never,
      ),
      prisma,
      tx,
    };
  };

  it('assigns one workspace MTProto account in the create transaction', async () => {
    const { service, tx } = setup([
      { id: 'account-1', assignedMemberId: null },
    ]);

    await service.create('owner-user', {
      email: 'new@example.com',
      telegramUserAccountIds: ['account-1'],
    });

    expect(tx.telegramUserAccountIntegration.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        id: { in: ['account-1'] },
      },
      select: { id: true, assignedMemberId: true },
    });
    expect(tx.telegramUserAccountIntegration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { assignedMemberId: 'member-1' } }),
    );
    expect(tx.workspaceMember.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'member-1' } }),
    );
  });

  it('rejects an account outside the active workspace', async () => {
    const { service } = setup([]);

    await expect(
      service.create('owner-user', {
        email: 'new@example.com',
        telegramUserAccountIds: ['outside-account'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects username and connected-account identities together', async () => {
    const { service, prisma } = setup([]);

    await expect(
      service.create('owner-user', {
        email: 'new@example.com',
        telegramUsername: '@new_user',
        telegramUserAccountIds: ['account-1'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates a member with a real workspace role definition', async () => {
    const { service, tx } = setup([]);

    await service.create('owner-user', {
      email: 'new@example.com',
      roleDefinitionId: 'role-content',
    });

    expect(tx.workspaceMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: WorkspaceRole.member,
          roleDefinitionId: 'role-content',
        }),
      }),
    );
  });

  it('rejects a role definition outside the active workspace', async () => {
    const { service, prisma, tx } = setup([], null);

    await expect(
      service.create('owner-user', {
        email: 'new@example.com',
        roleDefinitionId: 'outside-role',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.workspaceRoleDefinition.findFirst).toHaveBeenCalledWith({
      where: { id: 'outside-role', workspaceId: 'workspace-1' },
      select: { id: true, systemKey: true },
    });
    expect(tx.workspaceMember.create).not.toHaveBeenCalled();
  });

  it('updates a member to a real workspace role definition', async () => {
    const saved = {
      ...member,
      role: WorkspaceRole.member,
      avatarIcon: null,
      roleDefinition: {
        id: 'role-reviewer',
        name: 'Reviewer',
        systemKey: null,
        icon: null,
      },
    };
    const tx = {
      workspaceMember: {
        update: jest.fn().mockResolvedValue(saved),
        findMany: jest.fn().mockResolvedValue([]),
      },
      telegramUserAccountIntegration: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      telegramInviteLink: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'member-1',
          workspaceId: 'workspace-1',
          userId: 'new-user',
          role: WorkspaceRole.member,
        }),
      },
      workspaceRoleDefinition: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'role-reviewer', systemKey: null }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const workspaceService = {
      requireWorkspaceRole: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-1',
        role: WorkspaceRole.owner,
      }),
    };
    const service = new WorkspaceMembersService(
      prisma as never,
      workspaceService as never,
    );

    const result = await service.update('owner-user', 'member-1', {
      roleDefinitionId: 'role-reviewer',
    });

    expect(tx.workspaceMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: WorkspaceRole.member,
          roleDefinitionId: 'role-reviewer',
        }),
      }),
    );
    expect(result.roleDefinition).toEqual(
      expect.objectContaining({ id: 'role-reviewer', name: 'Reviewer' }),
    );
  });
});
