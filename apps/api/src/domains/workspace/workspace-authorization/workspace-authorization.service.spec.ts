import { ForbiddenException } from '@nestjs/common';
import { WorkspaceAuthorizationService } from './workspace-authorization.service';

function setup(input: {
  role?: 'owner' | 'admin' | 'member';
  mode?: 'ALLOWLIST' | 'DENYLIST';
  permissionKeys?: string[];
  roleDefinition?: boolean;
  workspaceId?: string;
}) {
  const base = {
    id: 'member-1',
    workspaceId: input.workspaceId ?? 'workspace-1',
  };
  const findFirst = jest.fn().mockResolvedValue({
    ...base,
    role: input.role ?? 'member',
    roleDefinition:
      input.roleDefinition === false
        ? null
        : {
            id: 'role-1',
            version: 2,
            mode: input.mode ?? 'ALLOWLIST',
            permissions: (input.permissionKeys ?? []).map((permissionKey) => ({
              permissionKey,
            })),
          },
  });
  const requestContext = { set: jest.fn() };
  const service = new WorkspaceAuthorizationService(
    { workspaceMember: { findFirst } } as never,
    requestContext as never,
    { headers: { 'x-workspace-id': base.workspaceId } } as never,
  );
  return { service, findFirst, requestContext };
}

describe('WorkspaceAuthorizationService', () => {
  it('memoizes one membership and role load for the request', async () => {
    const { service, findFirst, requestContext } = setup({
      permissionKeys: ['finance.view'],
    });
    await Promise.all([
      service.context('user-1'),
      service.can('user-1', 'finance.view'),
      service.require('user-1', 'finance.view'),
    ]);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(requestContext.set).toHaveBeenCalledTimes(1);
  });

  it('rejects none access and permits view access', async () => {
    const { service } = setup({ permissionKeys: ['finance.view'] });
    await expect(
      service.require('user-1', 'finance.view'),
    ).resolves.toBeDefined();
    await expect(
      service.require('user-1', 'finance.create'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('scopes own access in Prisma and rejects another member entity', async () => {
    const { service } = setup({ permissionKeys: ['finance.editOwn'] });
    await expect(
      service.scope('user-1', 'finance.editOwn', 'finance.editAny'),
    ).resolves.toEqual({ assignedMemberId: 'member-1' });
    await expect(
      service.requireOwnOrAny(
        'user-1',
        { assignedMemberId: 'member-2' },
        'finance.editOwn',
        'finance.editAny',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('combines the CRM base view grant with its explicit own scope', async () => {
    const { service } = setup({
      permissionKeys: ['adSales.crm.view', 'adSales.crm.viewOwn'],
    });

    await expect(
      service.require('user-1', 'adSales.crm.view'),
    ).resolves.toBeDefined();
    await expect(
      service.scope(
        'user-1',
        'adSales.crm.viewOwn',
        'adSales.crm.viewAny',
      ),
    ).resolves.toEqual({ assignedMemberId: 'member-1' });
  });

  it('allows any and delete-any access without ownership restriction', async () => {
    const { service } = setup({
      permissionKeys: ['finance.editAny', 'finance.deleteAny'],
    });
    await expect(
      service.scope('user-1', 'finance.editOwn', 'finance.editAny'),
    ).resolves.toEqual({});
    await expect(
      service.requireOwnOrAny(
        'user-1',
        { assignedMemberId: null },
        'finance.deleteOwn',
        'finance.deleteAny',
      ),
    ).resolves.toBeDefined();
  });

  it('always grants owner full access and fails closed for an unbackfilled member', async () => {
    const owner = setup({ role: 'owner', permissionKeys: [] }).service;
    const legacy = setup({ role: 'member', roleDefinition: false }).service;
    await expect(owner.can('owner', 'workspace.delete')).resolves.toBe(true);
    await expect(legacy.can('legacy', 'finance.manage')).resolves.toBe(false);
  });

  it('does not accept a membership from another workspace/user lookup', async () => {
    const { service, findFirst } = setup({ permissionKeys: ['finance.view'] });
    findFirst.mockResolvedValueOnce(null);
    await expect(service.context('attacker')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1', userId: 'attacker' },
      }),
    );
  });
});
