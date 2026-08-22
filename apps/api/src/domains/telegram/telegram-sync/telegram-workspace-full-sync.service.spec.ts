import { TelegramWorkspaceFullSyncService } from './telegram-workspace-full-sync.service';

function channel(id: string, title: string, enabled = true, autoSyncEnabled = true) {
  return {
    id,
    title,
    autoSyncEnabled,
    syncIncludePublicInfo: enabled,
    syncIncludeInviteLinks: false,
    syncIncludeHistoricalPosts: false,
    syncIncludePostMetrics: false,
    syncIncludeOlderPosts: false,
    syncIncludeChannelStats: false,
    syncIncludeManagedPosts: false,
    syncIncludeAudienceSnapshot: false,
  };
}

describe('TelegramWorkspaceFullSyncService', () => {
  it('reuses canonical channel sync and isolates channel failures', async () => {
    const canonicalSync = jest
      .fn()
      .mockResolvedValueOnce({ status: 'success' })
      .mockRejectedValueOnce(
        new Error('token=private-value provider request failed'),
      );
    const prisma = {
      workspace: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Business' }),
      },
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({ userId: 'actor-1' }),
      },
      telegramChannel: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            channel('channel-1', 'One'),
            channel('channel-2', 'Two'),
            channel('channel-3', 'Three', false),
          ]),
      },
    };
    const moduleRef = {
      registerRequestByContextId: jest.fn(),
      resolve: jest.fn().mockResolvedValue({ syncNow: canonicalSync }),
    };
    const service = new TelegramWorkspaceFullSyncService(
      prisma as never,
      moduleRef as never,
    );

    const result = await service.syncWorkspace({
      workspaceId: 'workspace-1',
      actor: { type: 'SCHEDULED_TASK' },
    });

    expect(canonicalSync).toHaveBeenNthCalledWith(1, 'actor-1', 'channel-1');
    expect(canonicalSync).toHaveBeenNthCalledWith(2, 'actor-1', 'channel-2');
    expect(result).toMatchObject({
      total: 3,
      successful: 1,
      failed: 1,
      skipped: 1,
    });
    expect(result.failures[0].reason).not.toContain('private-value');
  });

  it('filters disabled automatic sync channels before canonical sync is invoked', async () => {
    const prisma = {
      workspace: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Business' }) },
      workspaceMember: { findFirst: jest.fn().mockResolvedValue({ userId: 'actor-1' }) },
      telegramChannel: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const moduleRef = {
      registerRequestByContextId: jest.fn(),
      resolve: jest.fn(),
    };
    const service = new TelegramWorkspaceFullSyncService(
      prisma as never,
      moduleRef as never,
    );
    await service.syncWorkspace({ workspaceId: 'workspace-1', actor: { type: 'SCHEDULED_TASK' } });

    expect(prisma.telegramChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ autoSyncEnabled: true, isActive: true }),
      }),
    );
  });

  it('revalidates a System Bot actor against the requested workspace', async () => {
    const prisma = {
      workspace: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Business' }),
      },
      workspaceMember: { findFirst: jest.fn().mockResolvedValue(null) },
      telegramChannel: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new TelegramWorkspaceFullSyncService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.syncWorkspace({
        workspaceId: 'workspace-1',
        actor: { type: 'SYSTEM_BOT', userId: 'user-1' },
      }),
    ).rejects.toThrow('No authorized workspace actor');
    expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1', userId: 'user-1' },
      }),
    );
  });

  it('counts a partial canonical result as failed with sanitized step context', async () => {
    const canonicalSync = jest.fn().mockResolvedValue({
      status: 'partial',
      steps: [
        { step: 'channel_info', status: 'success', message: 'Done' },
        {
          step: 'post_metrics',
          status: 'partial',
          message: 'token=private-value provider returned partial data',
        },
      ],
    });
    const prisma = {
      workspace: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Business' }),
      },
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({ userId: 'actor-1' }),
      },
      telegramChannel: {
        findMany: jest.fn().mockResolvedValue([channel('channel-1', 'One')]),
      },
    };
    const moduleRef = {
      registerRequestByContextId: jest.fn(),
      resolve: jest.fn().mockResolvedValue({ syncNow: canonicalSync }),
    };
    const service = new TelegramWorkspaceFullSyncService(
      prisma as never,
      moduleRef as never,
    );

    const result = await service.syncWorkspace({
      workspaceId: 'workspace-1',
      actor: { type: 'SCHEDULED_TASK' },
    });

    expect(result).toMatchObject({ successful: 0, failed: 1, skipped: 0 });
    expect(result.failures[0]?.reason).toContain('post_metrics');
    expect(result.failures[0]?.reason).not.toContain('private-value');
  });
});
