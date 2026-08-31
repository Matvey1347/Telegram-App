import { TelegramSyncController } from './telegram-sync.controller';

describe('TelegramSyncController workspace sync', () => {
  it('runs a manual workspace sync for the authenticated member', async () => {
    const workspaceService = {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
    };
    const fullSync = {
      syncWorkspace: jest.fn().mockResolvedValue({ total: 2 }),
    };
    const controller = new TelegramSyncController(
      workspaceService as never,
      {} as never,
      {} as never,
      fullSync as never,
    );
    const selection = {
      syncIncludePublicInfo: true,
      syncIncludeInviteLinks: false,
      syncIncludeHistoricalPosts: false,
      syncIncludePostMetrics: false,
      syncIncludeOlderPosts: false,
      syncIncludeChannelStats: false,
      syncIncludeManagedPosts: false,
      syncIncludeAudienceSnapshot: false,
    };

    await controller.runWorkspaceSync({ sub: 'user-1' } as never, {
      selection,
    });

    expect(fullSync.syncWorkspace).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      actor: { type: 'MANUAL', userId: 'user-1' },
      selection,
    });
  });
});
