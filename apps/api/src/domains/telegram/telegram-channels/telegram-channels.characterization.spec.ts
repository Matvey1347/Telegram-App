import {
  TelegramInviteLinkCreatorMatchSource,
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
  TelegramSourceType,
} from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import {
  createTelegramChannelsTestHarness,
  type TelegramChannelsTestHarness,
} from './__fixtures__/telegram-channels.test-harness';

describe('TelegramChannelsService characterization seams', () => {
  const makeService = (prisma: Record<string, unknown> = {}) =>
    createTelegramChannelsTestHarness(
      prisma as never,
      {} as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

  describe('syncNow sequencing', () => {
    const setupSync = () => {
      const clearByPrefix = jest.fn();
      const service = createTelegramChannelsTestHarness(
        {
          telegramChannel: { update: jest.fn() },
        } as never,
        {} as never,
        { clearByPrefix } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      service['workspace'] = jest.fn().mockResolvedValue('workspace');
      service['findOne'] = jest.fn().mockResolvedValue({ id: 'channel' });
      service['resolveSyncSelection'] = jest.fn().mockReturnValue({
        syncIncludePublicInfo: false,
        syncIncludeInviteLinks: true,
        syncIncludeHistoricalPosts: true,
        syncIncludePostMetrics: false,
        syncIncludeOlderPosts: false,
        syncIncludeChannelStats: true,
        syncIncludeManagedPosts: true,
        syncIncludeAudienceSnapshot: false,
      });
      service['syncSelectionHasAnyEnabled'] = jest.fn().mockReturnValue(true);
      service['syncSelectionTotalSteps'] = jest.fn().mockReturnValue(4);
      service['bestMtprotoAccountId'] = jest.fn().mockResolvedValue('account');
      service['connectedAccount'] = jest
        .fn()
        .mockResolvedValue({ id: 'account' });
      service['postSyncLimitForChannel'] = jest.fn().mockResolvedValue(50);
      return { service, clearByPrefix };
    };

    it('continues optional failures in order and reports a partial sync', async () => {
      const { service, clearByPrefix } = setupSync();
      const calls: string[] = [];
      service['syncHistorical'] = jest.fn().mockImplementation(async () => {
        calls.push('historical');
        return {
          imported: 1,
          updated: 2,
          postsUpdated: 3,
          inviteLinksScope: 'PARTIAL_ADMINS',
        };
      });
      service['syncBroadcastStats'] = jest.fn().mockImplementation(async () => {
        calls.push('stats');
        throw new Error('stats unavailable');
      });
      service['syncManagedPosts'] = jest.fn().mockImplementation(async () => {
        calls.push('managed');
        throw new Error('managed unavailable');
      });

      const result = await service.syncNow('user', 'channel');

      expect(calls).toEqual(['historical', 'stats', 'managed']);
      expect(result.status).toBe('partial');
      expect(result.steps.map((step) => [step.step, step.status])).toEqual([
        ['historical_posts', 'partial'],
        ['broadcast_stats', 'failed'],
        ['managed_posts', 'skipped'],
        ['admission_analytics', 'skipped'],
      ]);
      expect(clearByPrefix).toHaveBeenCalled();
    });

    it('stops immediately when a required historical sync fails', async () => {
      const { service, clearByPrefix } = setupSync();
      const failure = new Error('history failed');
      service['syncHistorical'] = jest.fn().mockRejectedValue(failure);
      service['syncBroadcastStats'] = jest.fn();
      service['syncManagedPosts'] = jest.fn();

      await expect(service.syncNow('user', 'channel')).rejects.toBe(failure);

      expect(service['syncBroadcastStats']).not.toHaveBeenCalled();
      expect(service['syncManagedPosts']).not.toHaveBeenCalled();
      expect(clearByPrefix).not.toHaveBeenCalled();
    });

    it('does not duplicate an audience snapshot created by post metrics', async () => {
      const { service } = setupSync();
      service['resolveSyncSelection'].mockReturnValue({
        syncIncludePublicInfo: false,
        syncIncludeInviteLinks: false,
        syncIncludeHistoricalPosts: false,
        syncIncludePostMetrics: true,
        syncIncludeOlderPosts: false,
        syncIncludeChannelStats: false,
        syncIncludeManagedPosts: false,
        syncIncludeAudienceSnapshot: true,
      });
      service['syncSelectionTotalSteps'].mockReturnValue(2);
      service['syncPostsMetrics'] = jest.fn().mockResolvedValue({
        syncedPosts: 1,
        audienceSnapshot: { id: 'snapshot-from-metrics' },
      });
      service['createAudienceSnapshotSafely'] = jest.fn();

      await service.syncNow('user', 'channel');

      expect(service['syncPostsMetrics']).toHaveBeenCalledTimes(1);
      expect(service['createAudienceSnapshotSafely']).not.toHaveBeenCalled();
    });

    it('runs the selected audience snapshot when post metrics are unchanged', async () => {
      const { service } = setupSync();
      service['resolveSyncSelection'].mockReturnValue({
        syncIncludePublicInfo: false,
        syncIncludeInviteLinks: false,
        syncIncludeHistoricalPosts: false,
        syncIncludePostMetrics: true,
        syncIncludeOlderPosts: false,
        syncIncludeChannelStats: false,
        syncIncludeManagedPosts: false,
        syncIncludeAudienceSnapshot: true,
      });
      service['syncSelectionTotalSteps'].mockReturnValue(2);
      service['syncPostsMetrics'] = jest
        .fn()
        .mockResolvedValue({ syncedPosts: 0, audienceSnapshot: null });
      service['createAudienceSnapshotSafely'] = jest
        .fn()
        .mockResolvedValue({ id: 'snapshot' });

      await service.syncNow('user', 'channel');

      expect(service['createAudienceSnapshotSafely']).toHaveBeenCalledTimes(1);
    });

    it('still runs the selected audience snapshot after post metrics fail', async () => {
      const { service } = setupSync();
      service['resolveSyncSelection'].mockReturnValue({
        syncIncludePublicInfo: false,
        syncIncludeInviteLinks: false,
        syncIncludeHistoricalPosts: false,
        syncIncludePostMetrics: true,
        syncIncludeOlderPosts: false,
        syncIncludeChannelStats: false,
        syncIncludeManagedPosts: false,
        syncIncludeAudienceSnapshot: true,
      });
      service['syncSelectionTotalSteps'].mockReturnValue(2);
      service['syncPostsMetrics'] = jest
        .fn()
        .mockRejectedValue(new Error('metrics unavailable'));
      service['createAudienceSnapshotSafely'] = jest
        .fn()
        .mockResolvedValue({ id: 'snapshot' });

      const result = await service.syncNow('user', 'channel');

      expect(service['createAudienceSnapshotSafely']).toHaveBeenCalledTimes(1);
      expect(result.status).not.toBe('success');
    });
  });

  describe('managed publication failure semantics', () => {
    it('marks the local post failed when Telegram publishes but the DB commit fails', async () => {
      const post = {
        id: 'post',
        workspaceId: 'workspace',
        telegramChannelId: 'channel',
        title: 'Post',
        text: 'Publish me',
        imageUrls: [],
        buttonRows: [],
        status: TelegramManagedPostStatus.DRAFT,
        telegramMessageIds: [],
        telegramScheduledMessageIds: [],
        groupId: null,
      };
      const failureUpdate = jest
        .fn()
        .mockRejectedValueOnce(new Error('database commit failed'))
        .mockResolvedValueOnce({
          ...post,
          status: TelegramManagedPostStatus.FAILED,
        });
      const prisma = {
        telegramManagedPost: {
          findFirst: jest.fn().mockResolvedValue(post),
          update: failureUpdate,
          findUnique: jest.fn(),
        },
        telegramChannel: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'channel',
            workspaceId: 'workspace',
            isActive: true,
            username: 'example',
            telegramChatId: '-100123',
          }),
        },
        $transaction: jest
          .fn()
          .mockImplementation(async (callback) => callback(prisma)),
      };
      const publishPost = jest.fn().mockResolvedValue(['42']);
      const service = createTelegramChannelsTestHarness(
        prisma as never,
        {} as never,
        { clearByPrefix: jest.fn() } as never,
        {} as never,
        { publishPost } as never,
        {
          sourcesForChannel: jest.fn().mockResolvedValue([
            {
              sourceId: 'account',
              sourceType: TelegramSourceType.MTPROTO,
              permissions: { canPostMessages: true },
            },
          ]),
        } as never,
        {} as never,
      );
      service['workspace'] = jest.fn().mockResolvedValue('workspace');
      service['createManagedPostRevision'] = jest.fn();
      service['resolveInternalPostLinksForPublish'] = jest
        .fn()
        .mockResolvedValue('Publish me');
      service['renderManagedPostText'] = jest.fn().mockReturnValue({
        html: 'Publish me',
        richHtml: null,
        captionHtml: 'Publish me',
        followupHtmlParts: [],
        textHtmlParts: ['Publish me'],
        publishMode: 'TEXT_ONLY',
      });
      service['connectedAccount'] = jest.fn().mockResolvedValue({});
      service['accountCredentials'] = jest.fn().mockReturnValue({
        apiId: '1',
        apiHash: 'hash',
        session: 'session',
      });

      await expect(
        service.publishManagedPostNow('user', 'channel', 'post', {}),
      ).rejects.toEqual(new BadRequestException('database commit failed'));

      expect(publishPost).toHaveBeenCalledTimes(1);
      expect(failureUpdate).toHaveBeenLastCalledWith({
        where: { id: 'post' },
        data: expect.objectContaining({
          status: TelegramManagedPostStatus.FAILED,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.UNKNOWN,
          lastError: 'database commit failed',
        }),
      });
    });
  });

  it('keeps a channel update inside the workspace-scoped transaction', async () => {
    const transactionEvents: string[] = [];
    const prisma = {
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'channel',
          workspaceId: 'workspace',
          assignedMemberId: 'member',
        }),
        update: jest.fn().mockImplementation(async ({ where }) => {
          transactionEvents.push(`channel:${where.id}`);
          return { id: 'channel' };
        }),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        transactionEvents.push('begin');
        const result = await callback(prisma);
        transactionEvents.push('commit');
        return result;
      }),
    };
    const service = makeService(prisma);
    service['workspace'] = jest.fn().mockResolvedValue('workspace');
    service['findOne'] = jest.fn().mockResolvedValue({
      id: 'channel',
      workspaceId: 'workspace',
      assignedMemberId: 'member',
    });
    service['ensureTelegramChannelImportPolicyColumnsAvailable'] = jest.fn();

    await service.update('user', 'channel', { title: 'Updated' });

    expect(service['findOne']).toHaveBeenCalledWith('user', 'channel');
    expect(transactionEvents).toEqual(['begin', 'channel:channel', 'commit']);
  });

  it('treats missing revision storage as a supported no-op', async () => {
    const create = jest.fn();
    const store = new TelegramManagedPostRevisionStore({
      $queryRaw: jest.fn().mockResolvedValue([{ exists: null }]),
      telegramManagedPostRevision: { create },
    } as never);

    await expect(
      store.createManagedPostRevision({} as never, {} as never, 'before_edit'),
    ).resolves.toBeUndefined();

    expect(create).not.toHaveBeenCalled();
  });

  it('reattributes only workspace invite links and commits the mapped creator changes together', async () => {
    const update = jest.fn().mockResolvedValue({});
    const transaction = jest.fn().mockResolvedValue([]);
    const service = makeService({
      workspaceMember: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'member', telegramUsername: '@owner' }]),
      },
      telegramUserAccountIntegration: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      telegramInviteLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'link',
            creatorTelegramUserId: null,
            creatorUsername: 'owner',
            creatorFirstName: null,
            creatorLastName: null,
            creatorPhotoUrl: null,
          },
        ]),
        update,
      },
      $transaction: transaction,
    });

    await service.reattributeWorkspaceInviteLinks('workspace');

    expect(service['prisma'].telegramInviteLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: 'workspace' } }),
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: 'link' },
      data: {
        creatorMemberId: 'member',
        creatorMatchSource:
          TelegramInviteLinkCreatorMatchSource.MEMBER_USERNAME,
        creatorUsername: 'owner',
      },
    });
    expect(transaction).toHaveBeenCalledWith([expect.any(Promise)]);
  });

  it('creates and attaches a post group within one workspace-scoped transaction', async () => {
    const events: string[] = [];
    const tx = {
      telegramManagedPost: {
        findMany: jest.fn().mockImplementation(async () => {
          events.push('load-posts');
          return [{ id: 'post', groupId: 'old-group' }];
        }),
        update: jest.fn().mockImplementation(async () => {
          events.push('attach-post');
          return {};
        }),
      },
      postGroup: {
        create: jest.fn().mockImplementation(async () => {
          events.push('create-group');
          return { id: 'new-group' };
        }),
      },
    };
    const prisma = {
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({ id: 'channel' }),
      },
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({ id: 'author-member' }),
      },
      icon: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'heart-icon' }),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        events.push('begin');
        const result = await callback(tx);
        events.push('commit');
        return result;
      }),
    };
    const service = createTelegramChannelsTestHarness(
      prisma as never,
      {
        resolveWorkspaceMembershipForUser: jest
          .fn()
          .mockResolvedValue({ id: 'member', workspaceId: 'workspace' }),
      } as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    service['ensurePostGroupSystemColumnsAvailable'] = jest.fn();
    service['normalizePostGroupNumbering'] = jest
      .fn()
      .mockImplementation(async (_tx, groupId) =>
        events.push(`normalize:${groupId}`),
      );
    service['postGroupForWorkspace'] = jest
      .fn()
      .mockResolvedValue({ id: 'new-group' });

    await service.createPostGroup('user', {
      telegramChannelId: 'channel',
      title: 'Group',
      icon: '❤️',
      createdByMemberId: 'author-member',
      postIds: ['post'],
    });

    expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith({
      where: { id: 'author-member', workspaceId: 'workspace' },
      select: { id: true },
    });
    expect(tx.postGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdByMemberId: 'author-member',
        icon: 'heart-icon',
      }),
    });
    expect(prisma.icon.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace',
        type: 'emoji',
        emoji: '❤️',
      }),
      select: { id: true },
    });

    expect(events).toEqual([
      'begin',
      'load-posts',
      'create-group',
      'attach-post',
      'normalize:old-group',
      'normalize:new-group',
      'commit',
    ]);
  });

  it('rolls back posts already moved when a later group move fails', async () => {
    const service = makeService({
      postGroup: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'group',
          telegramChannelId: 'source',
          posts: [{ id: 'first' }, { id: 'second' }],
        }),
      },
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({ id: 'target' }),
      },
    });
    service['workspace'] = jest.fn().mockResolvedValue('workspace');
    service['moveManagedPostInternal'] = jest
      .fn()
      .mockResolvedValueOnce({
        result: {
          postId: 'first',
          title: 'First',
          previousStatus: TelegramManagedPostStatus.DRAFT,
          newStatus: TelegramManagedPostStatus.DRAFT,
          success: true,
        },
      })
      .mockResolvedValueOnce({
        result: {
          postId: 'second',
          title: 'Second',
          previousStatus: TelegramManagedPostStatus.DRAFT,
          newStatus: TelegramManagedPostStatus.FAILED,
          success: false,
          error: 'move failed',
        },
      })
      .mockResolvedValueOnce({
        result: {
          postId: 'first',
          title: 'First',
          previousStatus: TelegramManagedPostStatus.DRAFT,
          newStatus: TelegramManagedPostStatus.DRAFT,
          success: true,
        },
      });

    await expect(
      service.movePostGroup('user', 'group', {
        targetTelegramChannelId: 'target',
      }),
    ).rejects.toEqual(
      new BadRequestException(
        'Could not move group. move failed. The group was left in the original channel.',
      ),
    );
    expect(service['moveManagedPostInternal'].mock.calls).toEqual([
      ['workspace', 'first', 'target', true],
      ['workspace', 'second', 'target', true],
      ['workspace', 'first', 'source', true],
    ]);
  });
});
