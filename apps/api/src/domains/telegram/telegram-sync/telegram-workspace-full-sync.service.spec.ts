/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest mocks intentionally use partial canonical sync results. */
import { TelegramWorkspaceFullSyncService } from './telegram-workspace-full-sync.service';

function channel(
  id: string,
  title: string,
  enabled = true,
  autoSyncEnabled = true,
) {
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

    expect(canonicalSync).toHaveBeenNthCalledWith(
      1,
      'actor-1',
      'channel-1',
      undefined,
    );
    expect(canonicalSync).toHaveBeenNthCalledWith(
      2,
      'actor-1',
      'channel-2',
      undefined,
    );
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
      workspace: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Business' }),
      },
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({ userId: 'actor-1' }),
      },
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
    await service.syncWorkspace({
      workspaceId: 'workspace-1',
      actor: { type: 'SCHEDULED_TASK' },
    });

    expect(prisma.telegramChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          autoSyncEnabled: true,
          isActive: true,
        }),
      }),
    );
  });

  it('manually syncs active auto-disabled channels with an unsaved override', async () => {
    const syncNow = jest.fn().mockResolvedValue({ status: 'success' });
    const prisma = {
      workspace: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Business' }),
      },
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({ userId: 'user-1' }),
      },
      telegramChannel: {
        findMany: jest
          .fn()
          .mockResolvedValue([channel('channel-1', 'One', false, false)]),
      },
    };
    const moduleRef = {
      registerRequestByContextId: jest.fn(),
      resolve: jest.fn().mockResolvedValue({ syncNow }),
    };
    const service = new TelegramWorkspaceFullSyncService(
      prisma as never,
      moduleRef as never,
    );
    const selection = {
      syncIncludePublicInfo: false,
      syncIncludeInviteLinks: false,
      syncIncludeHistoricalPosts: false,
      syncIncludePostMetrics: true,
      syncIncludeOlderPosts: false,
      syncIncludeChannelStats: false,
      syncIncludeManagedPosts: false,
      syncIncludeAudienceSnapshot: true,
    };
    await service.syncWorkspace({
      workspaceId: 'workspace-1',
      actor: { type: 'MANUAL', userId: 'user-1' },
      selection,
    });
    expect(prisma.telegramChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1', isActive: true, archivedAt: null },
      }),
    );
    expect(syncNow).toHaveBeenCalledWith('user-1', 'channel-1', {
      ...selection,
      saveSelection: false,
    });
  });

  it('rejects a manual sync with an empty selection', async () => {
    const service = new TelegramWorkspaceFullSyncService(
      {} as never,
      {} as never,
    );
    await expect(
      service.syncWorkspace({
        workspaceId: 'workspace-1',
        actor: { type: 'MANUAL', userId: 'user-1' },
        selection: {
          syncIncludePublicInfo: false,
          syncIncludeInviteLinks: false,
          syncIncludeHistoricalPosts: false,
          syncIncludePostMetrics: false,
          syncIncludeOlderPosts: false,
          syncIncludeChannelStats: false,
          syncIncludeManagedPosts: false,
          syncIncludeAudienceSnapshot: false,
        },
      }),
    ).rejects.toThrow('Select at least one sync section');
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

  it('streams the current channel, nested sync step, and completed channel count', async () => {
    const syncNow = jest.fn().mockImplementation(
      async (
        _userId: string,
        _channelId: string,
        _selection: unknown,
        onProgress: (item: unknown, current: number, total: number) => void,
      ) => {
        onProgress(
          {
            phase: 'saving_invite_links',
            message: 'Saving invite links…',
            stageCurrent: 3,
            stageTotal: 8,
          },
          3,
          8,
        );
        return { status: 'success' };
      },
    );
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
      resolve: jest.fn().mockResolvedValue({ syncNow }),
    };
    const service = new TelegramWorkspaceFullSyncService(
      prisma as never,
      moduleRef as never,
    );
    const onProgress = jest.fn();

    await service.syncWorkspace({
      workspaceId: 'workspace-1',
      actor: { type: 'MANUAL', userId: 'actor-1' },
      selection: {
        syncIncludePublicInfo: false,
        syncIncludeInviteLinks: true,
        syncIncludeHistoricalPosts: false,
        syncIncludePostMetrics: false,
        syncIncludeOlderPosts: false,
        syncIncludeChannelStats: false,
        syncIncludeManagedPosts: false,
        syncIncludeAudienceSnapshot: false,
      },
      onProgress,
    });

    expect(onProgress).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        phase: 'channel_started',
        channelTitle: 'One',
      }),
      1,
      1,
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'channel_progress',
        message: 'Saving invite links…',
        stageCurrent: 3,
        stageTotal: 8,
      }),
      1,
      1,
    );
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phase: 'channel_completed',
        successful: 1,
      }),
      1,
      1,
    );
  });
});
