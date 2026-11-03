import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';

describe('WorkspaceService.resolveWorkspaceIdForUser', () => {
  function setup({
    headers = {},
    membership = { workspaceId: 'workspace-1' },
  }: {
    headers?: Record<string, string | string[] | undefined>;
    membership?: { workspaceId: string } | null;
  } = {}) {
    const findFirst = jest.fn().mockResolvedValue(membership);
    const set = jest.fn();
    const service = new WorkspaceService(
      { workspaceMember: { findFirst } } as never,
      { set } as never,
      { headers } as never,
    );
    return { service, findFirst, set };
  }

  it('selects only the workspace id for an explicitly selected workspace', async () => {
    const { service, findFirst, set } = setup({
      headers: { 'x-workspace-id': 'workspace-1' },
    });

    await expect(service.resolveWorkspaceIdForUser('user-1')).resolves.toBe(
      'workspace-1',
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', workspaceId: 'workspace-1' },
      select: { workspaceId: true },
    });
    expect(set).toHaveBeenCalledWith({
      userId: 'user-1',
      workspaceId: 'workspace-1',
    });
  });

  it('keeps the oldest-membership default when no workspace is selected', async () => {
    const { service, findFirst } = setup();

    await expect(service.resolveWorkspaceIdForUser('user-1')).resolves.toBe(
      'workspace-1',
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'asc' },
      select: { workspaceId: true },
    });
  });

  it('uses the first value when the selected workspace header is repeated', async () => {
    const { service, findFirst } = setup({
      headers: { 'x-workspace-id': ['workspace-1', 'workspace-ignored'] },
    });

    await expect(service.resolveWorkspaceIdForUser('user-1')).resolves.toBe(
      'workspace-1',
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', workspaceId: 'workspace-1' },
      select: { workspaceId: true },
    });
  });

  it('rejects a selected workspace the user does not belong to', async () => {
    const { service } = setup({
      headers: { 'x-workspace-id': 'workspace-other' },
      membership: null,
    });

    await expect(service.resolveWorkspaceIdForUser('user-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects users without any workspace membership', async () => {
    const { service } = setup({ membership: null });

    await expect(service.resolveWorkspaceIdForUser('user-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
