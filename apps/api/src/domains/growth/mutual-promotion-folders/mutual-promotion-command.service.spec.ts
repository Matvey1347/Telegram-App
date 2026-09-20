/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- focused Prisma transaction mock and Jest matcher assertions */
import { MutualPromotionCommandService } from './mutual-promotion-command.service';

describe('MutualPromotionCommandService', () => {
  const startsAt = new Date('2026-09-08T10:00:00.000Z');
  const endsAt = new Date('2026-09-09T10:00:00.000Z');

  function setup(workflowConsumed = 1) {
    const tx = {
      telegramSystemBotWorkflow: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'workflow-1',
          connectionId: 'connection-1',
          payload: {
            contents: [
              {
                text: 'Imported body',
                imageUrls: [],
                buttonRows: [],
                sourceTitle: 'Source channel',
              },
              {
                text: 'Second body',
                imageUrls: [],
                buttonRows: [],
                sourceTitle: 'Second source',
              },
            ],
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: workflowConsumed }),
      },
      mutualPromotionFolderPost: {
        count: jest.fn().mockResolvedValue(0),
        createManyAndReturn: jest
          .fn()
          .mockResolvedValue([{ id: 'post-1' }, { id: 'post-2' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const validation = {
      lockFolder: jest.fn().mockResolvedValue(undefined),
      requireFolder: jest.fn().mockResolvedValue({
        id: 'folder-1',
        status: 'DRAFT',
        startsAt,
        endsAt,
      }),
      requireDraft: jest.fn(),
    };
    const read = {
      detailForWorkspace: jest.fn().mockResolvedValue({ id: 'folder-1' }),
    };
    const service = new MutualPromotionCommandService(
      { $transaction: jest.fn((callback) => callback(tx)) } as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      {} as never,
      {} as never,
      validation as never,
      read as never,
      {} as never,
    );
    return { service, tx, validation };
  }

  it('creates a paid-only folder already active', async () => {
    const created = { id: 'folder-paid', title: 'Paid only' };
    const tx = {
      mutualPromotionFolder: { create: jest.fn().mockResolvedValue(created) },
    };
    const validation = {
      parseInterval: jest.fn().mockReturnValue({ startsAt, endsAt }),
      lockInviteLinks: jest.fn(),
      validateParticipants: jest.fn(),
    };
    const expenses = { createForFolder: jest.fn() };
    const read = { detailForWorkspace: jest.fn().mockResolvedValue(created) };
    const service = new MutualPromotionCommandService(
      { $transaction: jest.fn((callback) => callback(tx)) } as never,
      {
        resolveWorkspaceMembershipForUser: jest
          .fn()
          .mockResolvedValue({ workspaceId: 'workspace-1' }),
      } as never,
      expenses as never,
      {} as never,
      validation as never,
      read as never,
      {} as never,
    );

    await service.create('user-1', {
      title: 'Paid only',
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      participants: [
        {
          telegramChannelId: 'channel-1',
          inviteLinkId: 'invite-1',
          role: 'PAID',
        },
      ],
    });

    expect(tx.mutualPromotionFolder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'ACTIVE',
        activatedAt: expect.any(Date),
        nextDueAt: endsAt,
      }),
    });
  });

  it('requires finance.create before allocating paid-folder expenses', async () => {
    const prisma = { $transaction: jest.fn() };
    const authorization = {
      require: jest.fn().mockRejectedValue(new Error('finance.create denied')),
    };
    const service = new MutualPromotionCommandService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      authorization as never,
    );
    const dto = {
      title: 'September',
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      participants: [
        {
          telegramChannelId: 'channel-1',
          inviteLinkId: 'link-1',
          role: 'PAID' as const,
        },
      ],
      expenseAllocation: {
        mode: 'EQUAL' as const,
        accountId: 'account-1',
        totalAmount: 10,
      },
    };
    await expect(service.create('user-1', dto)).rejects.toThrow(
      'finance.create denied',
    );
    await expect(service.update('user-1', 'folder-1', dto)).rejects.toThrow(
      'finance.create denied',
    );
    expect(authorization.require).toHaveBeenNthCalledWith(
      1,
      'user-1',
      'finance.create',
    );
    expect(authorization.require).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cannot remove existing workspace expenses through an expense-free folder edit without finance.create', async () => {
    const tx = {
      mutualPromotionFolderParticipant: {
        findMany: jest.fn().mockResolvedValue([{ id: 'participant-1' }]),
        deleteMany: jest.fn(),
      },
      transaction: {
        findFirst: jest.fn().mockResolvedValue({ id: 'expense-1' }),
        deleteMany: jest.fn(),
      },
      mutualPromotionFolder: { update: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const authorization = {
      require: jest.fn().mockRejectedValue(new Error('finance.create denied')),
    };
    const validation = {
      parseInterval: jest.fn().mockReturnValue({ startsAt, endsAt }),
      lockFolder: jest.fn(),
      requireFolder: jest.fn().mockResolvedValue({ status: 'DRAFT' }),
      requireDraft: jest.fn(),
      lockInviteLinks: jest.fn(),
      validateParticipants: jest.fn(),
    };
    const service = new MutualPromotionCommandService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      {} as never,
      {} as never,
      validation as never,
      {} as never,
      {} as never,
      authorization as never,
    );

    await expect(
      service.update('user-1', 'folder-1', {
        title: 'Edited title',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        participants: [],
      }),
    ).rejects.toThrow('finance.create denied');

    expect(validation.requireFolder).toHaveBeenCalledWith(
      'workspace-1',
      'folder-1',
      tx,
    );
    expect(tx.mutualPromotionFolderParticipant.findMany).toHaveBeenCalledWith({
      where: { folderId: 'folder-1', workspaceId: 'workspace-1' },
      select: { id: true },
    });
    expect(tx.transaction.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        mutualPromotionParticipantId: { in: ['participant-1'] },
      },
      select: { id: true },
    });
    expect(authorization.require).toHaveBeenCalledWith(
      'user-1',
      'finance.create',
    );
    expect(tx.transaction.deleteMany).not.toHaveBeenCalled();
    expect(
      tx.mutualPromotionFolderParticipant.deleteMany,
    ).not.toHaveBeenCalled();
    expect(tx.mutualPromotionFolder.update).not.toHaveBeenCalled();
  });

  it('serializes the folder and consumes one completed System Bot import', async () => {
    const { service, tx, validation } = setup();

    await service.addPost('user-1', 'folder-1', {
      importWorkflowId: 'workflow-1',
      posts: [
        {
          scheduledAt: '2026-09-08T12:00:00.000Z',
          title: 'Edited title',
          text: '**Edited** body',
          imageUrls: ['https://cdn.test/edited.jpg'],
          buttonRows: [
            [
              {
                text: 'Open',
                url: 'https://example.test',
                style: 'default',
              },
            ],
          ],
        },
        {
          scheduledAt: '2026-09-08T13:00:00.000Z',
          title: 'Second post',
          text: 'Second body',
          imageUrls: [],
          buttonRows: [],
        },
      ],
    });

    expect(validation.lockFolder).toHaveBeenCalledWith(tx, 'folder-1');
    expect(validation.lockFolder.mock.invocationCallOrder[0]).toBeLessThan(
      validation.requireFolder.mock.invocationCallOrder[0],
    );
    expect(tx.telegramSystemBotWorkflow.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'workflow-1',
        workspaceId: 'workspace-1',
        kind: 'WEBSITE_POST_IMPORT',
        postImportMode: 'MULTIPLE',
        status: 'COMPLETED',
        resultMutualPromotionPostId: null,
        connection: {
          is: {
            userId: 'user-1',
            enabled: true,
          },
        },
      }),
      select: { id: true, connectionId: true, payload: true },
    });
    expect(tx.telegramSystemBotWorkflow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          connectionId: 'connection-1',
          connection: { is: { userId: 'user-1', enabled: true } },
        }),
        data: expect.objectContaining({
          resultMutualPromotionPostId: 'post-1',
          consumedAt: expect.any(Date),
        }),
      }),
    );
    expect(
      tx.mutualPromotionFolderPost.createManyAndReturn,
    ).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ title: 'Edited title', position: 0 }),
        expect.objectContaining({ title: 'Second post', position: 1 }),
      ],
      select: { id: true },
    });
  });

  it('rejects a workflow owned by another user in the same workspace', async () => {
    const { service, tx } = setup();
    tx.telegramSystemBotWorkflow.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.addPost('user-2', 'folder-1', {
        importWorkflowId: 'workflow-1',
        posts: [
          {
            scheduledAt: '2026-09-08T12:00:00.000Z',
            title: 'Imported body',
            text: 'Imported body',
            imageUrls: [],
            buttonRows: [],
          },
        ],
      }),
    ).rejects.toThrow('A completed, unused System Bot import is required');

    expect(tx.telegramSystemBotWorkflow.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          connection: {
            is: {
              userId: 'user-2',
              enabled: true,
            },
          },
        }),
      }),
    );
    expect(
      tx.mutualPromotionFolderPost.createManyAndReturn,
    ).not.toHaveBeenCalled();
    expect(tx.telegramSystemBotWorkflow.updateMany).not.toHaveBeenCalled();
  });

  it('rolls back when the completed import was consumed concurrently', async () => {
    const { service } = setup(0);

    await expect(
      service.addPost('user-1', 'folder-1', {
        importWorkflowId: 'workflow-1',
        posts: [
          {
            scheduledAt: '2026-09-08T12:00:00.000Z',
            title: 'Imported body',
            text: 'Imported body',
            imageUrls: [],
            buttonRows: [],
          },
        ],
      }),
    ).rejects.toThrow('System Bot import was already used');
  });

  it('rejects an edited draft with no publishable content', async () => {
    const { service, tx } = setup();

    await expect(
      service.addPost('user-1', 'folder-1', {
        importWorkflowId: 'workflow-1',
        posts: [
          {
            scheduledAt: '2026-09-08T12:00:00.000Z',
            title: 'Empty post',
            text: '   ',
            imageUrls: [],
            buttonRows: [],
          },
        ],
      }),
    ).rejects.toThrow('has no publishable text or media');
    expect(
      tx.mutualPromotionFolderPost.createManyAndReturn,
    ).not.toHaveBeenCalled();
    expect(tx.telegramSystemBotWorkflow.updateMany).not.toHaveBeenCalled();
  });

  it('rejects adding more posts than were captured by the bot', async () => {
    const { service, tx } = setup();
    tx.telegramSystemBotWorkflow.findFirst.mockResolvedValue({
      id: 'workflow-1',
      payload: {
        content: {
          text: 'Only captured post',
          imageUrls: [],
          buttonRows: [],
        },
      },
    });

    await expect(
      service.addPost('user-1', 'folder-1', {
        importWorkflowId: 'workflow-1',
        posts: [
          {
            scheduledAt: '2026-09-08T12:00:00.000Z',
            title: 'First',
            text: 'First',
            imageUrls: [],
            buttonRows: [],
          },
          {
            scheduledAt: '2026-09-08T13:00:00.000Z',
            title: 'Injected second',
            text: 'Injected second',
            imageUrls: [],
            buttonRows: [],
          },
        ],
      }),
    ).rejects.toThrow('more posts than the System Bot import');
    expect(
      tx.mutualPromotionFolderPost.createManyAndReturn,
    ).not.toHaveBeenCalled();
  });

  it('updates publication content and schedule together', async () => {
    const { service, tx } = setup();

    await service.updatePost('user-1', 'folder-1', 'post-1', {
      scheduledAt: '2026-09-08T14:00:00.000Z',
      title: 'Updated title',
      text: '**Updated** body',
      imageUrls: [' https://cdn.test/updated.jpg '],
      buttonRows: [
        [{ text: 'Open', url: 'https://example.test', style: 'primary' }],
      ],
    });

    expect(tx.mutualPromotionFolderPost.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'post-1',
        folderId: 'folder-1',
        workspaceId: 'workspace-1',
      },
      data: {
        scheduledAt: new Date('2026-09-08T14:00:00.000Z'),
        title: 'Updated title',
        text: '**Updated** body',
        imageUrls: ['https://cdn.test/updated.jpg'],
        mediaItems: [{ kind: 'PHOTO', url: 'https://cdn.test/updated.jpg' }],
        buttonRows: [
          [{ text: 'Open', url: 'https://example.test', style: 'primary' }],
        ],
      },
    });
  });

  it('removes Telegram copies before deleting a folder', async () => {
    const tx = {
      telegramManagedPost: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mutualPromotionFolder: {
        delete: jest.fn().mockResolvedValue({ id: 'folder-1' }),
      },
    };
    const prisma = {
      mutualPromotionFolder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'folder-1',
          posts: [
            {
              deliveries: [
                {
                  managedPostId: 'post-1',
                  managedPost: {
                    status: 'PUBLISHED',
                    telegramMessageIds: ['123'],
                    telegramScheduledMessageIds: [],
                    telegramRemoteStatus: 'PRESENT',
                  },
                },
              ],
            },
          ],
        }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const remoteDeletion = {
      deletePublishedManagedPosts: jest.fn().mockResolvedValue({
        failed: 0,
        results: [{ postId: 'post-1', success: true }],
      }),
    };
    const service = new MutualPromotionCommandService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      remoteDeletion as never,
    );

    await expect(service.remove('user-1', 'folder-1')).resolves.toEqual({
      id: 'folder-1',
    });
    expect(remoteDeletion.deletePublishedManagedPosts).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      managedPostIds: ['post-1'],
    });
    expect(tx.telegramManagedPost.deleteMany).toHaveBeenCalled();
    expect(tx.mutualPromotionFolder.delete).toHaveBeenCalledWith({
      where: { id: 'folder-1' },
    });
  });
});
