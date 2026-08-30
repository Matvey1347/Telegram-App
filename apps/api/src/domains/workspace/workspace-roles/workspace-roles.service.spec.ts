import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceRole, WorkspaceRoleMode } from '@prisma/client';
import { WorkspaceRolesService } from './workspace-roles.service';

const now = new Date('2026-08-29T12:00:00.000Z');

function roleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'role-1',
    workspaceId: 'workspace-1',
    name: 'Editor',
    description: 'Edits posts',
    emoji: '✍️',
    iconId: null,
    icon: null,
    mode: WorkspaceRoleMode.ALLOWLIST,
    version: 1,
    systemKey: null,
    permissions: [
      {
        id: 'permission-1',
        roleId: 'role-1',
        permissionKey: 'posts.view',
        effect: 'ALLOW',
      },
    ],
    _count: { members: 0 },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function setup() {
  const prisma = {
    workspaceRoleDefinition: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    workspaceMember: { findMany: jest.fn(), updateMany: jest.fn() },
    icon: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const workspaceService = {
    resolveWorkspaceMembershipForUser: jest.fn().mockResolvedValue({
      id: 'current-member',
      workspaceId: 'workspace-1',
      role: WorkspaceRole.owner,
    }),
    requireWorkspaceRole: jest.fn().mockResolvedValue({
      id: 'current-member',
      workspaceId: 'workspace-1',
      role: WorkspaceRole.owner,
    }),
  };
  return {
    prisma,
    workspaceService,
    service: new WorkspaceRolesService(
      prisma as never,
      workspaceService as never,
    ),
  };
}

describe('WorkspaceRolesService', () => {
  it('creates a normalized role in the active workspace', async () => {
    const { service, prisma } = setup();
    prisma.workspaceRoleDefinition.create.mockResolvedValue(roleRow());

    const result = await service.create('owner-user', {
      name: '  Editor  ',
      description: ' Edits posts ',
      emoji: '✍️',
      mode: WorkspaceRoleMode.ALLOWLIST,
      permissionKeys: ['posts.view'],
    });

    expect(prisma.workspaceRoleDefinition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'workspace-1',
          name: 'Editor',
        }),
      }),
    );
    expect(result.permissionKeys).toEqual(['posts.view']);
    expect(
      result.summaries.find((item) => item.featureId === 'posts')?.level,
    ).toBe('view');
  });

  it('rejects permission identifiers outside the shared registry', async () => {
    const { service } = setup();
    await expect(
      service.create('owner-user', {
        name: 'Unsafe',
        mode: WorkspaceRoleMode.ALLOWLIST,
        permissionKeys: ['finance.secretBackdoor'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('hydrates a workspace-owned role icon in the API contract', async () => {
    const { service, prisma } = setup();
    prisma.icon.findFirst.mockResolvedValue({ id: 'icon-1' });
    prisma.workspaceRoleDefinition.create.mockResolvedValue(
      roleRow({
        iconId: 'icon-1',
        icon: {
          id: 'icon-1',
          type: 'emoji',
          name: 'Writer',
          emoji: '✍️',
          imageUrl: null,
        },
      }),
    );

    const result = await service.create('owner-user', {
      name: 'Writer',
      iconId: 'icon-1',
      mode: WorkspaceRoleMode.ALLOWLIST,
      permissionKeys: ['posts.view', 'posts.schedule'],
    });

    expect(prisma.icon.findFirst).toHaveBeenCalledWith({
      where: { id: 'icon-1', workspaceId: 'workspace-1' },
      select: { id: true },
    });
    expect(result.iconId).toBe('icon-1');
    expect(result.iconPresentation).toMatchObject({ type: 'unicode' });
    expect(prisma.workspaceRoleDefinition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          permissions: {
            create: expect.arrayContaining([
              expect.objectContaining({ permissionKey: 'posts.schedule' }),
            ]),
          },
        }),
      }),
    );
  });

  it('rejects an icon from another workspace', async () => {
    const { service, prisma } = setup();
    prisma.icon.findFirst.mockResolvedValue(null);

    await expect(
      service.create('owner-user', {
        name: 'Foreign icon',
        iconId: 'foreign-icon',
        mode: WorkspaceRoleMode.ALLOWLIST,
        permissionKeys: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.workspaceRoleDefinition.create).not.toHaveBeenCalled();
  });

  it('never allows the Owner system role to be edited or deleted', async () => {
    const { service, prisma } = setup();
    prisma.workspaceRoleDefinition.findFirst.mockResolvedValue(
      roleRow({
        name: 'Owner',
        systemKey: 'OWNER',
        mode: WorkspaceRoleMode.DENYLIST,
      }),
    );

    await expect(
      service.update('owner-user', 'role-1', { version: 1, name: 'Limited' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove('owner-user', 'role-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('detects an optimistic version conflict before replacing permissions', async () => {
    const { service, prisma } = setup();
    prisma.workspaceRoleDefinition.findFirst.mockResolvedValue(roleRow());
    const tx = {
      workspaceRoleDefinition: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      workspaceRolePermission: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    prisma.$transaction.mockImplementation(
      (callback: (client: unknown) => unknown) => callback(tx),
    );

    await expect(
      service.update('owner-user', 'role-1', {
        version: 4,
        permissionKeys: ['posts.view', 'posts.editOwn'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.workspaceRolePermission.deleteMany).not.toHaveBeenCalled();
  });

  it('does not assign a role when any member is outside the active workspace', async () => {
    const { service, prisma } = setup();
    prisma.workspaceRoleDefinition.findFirst.mockResolvedValue(roleRow());
    prisma.workspaceMember.findMany.mockResolvedValue([
      { id: 'member-1', role: WorkspaceRole.member },
    ]);

    await expect(
      service.assignMembers('owner-user', 'role-1', [
        'member-1',
        'foreign-member',
      ]),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.workspaceMember.updateMany).not.toHaveBeenCalled();
  });

  it('prevents assigning a non-owner role to an owner membership', async () => {
    const { service, prisma } = setup();
    prisma.workspaceRoleDefinition.findFirst.mockResolvedValue(roleRow());
    prisma.workspaceMember.findMany.mockResolvedValue([
      { id: 'owner-member', role: WorkspaceRole.owner },
    ]);

    await expect(
      service.assignMembers('owner-user', 'role-1', ['owner-member']),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
