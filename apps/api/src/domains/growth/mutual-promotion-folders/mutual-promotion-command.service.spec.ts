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
    );
    return { service, tx, validation };
  }

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
        mutualPromotionFolderId: 'folder-1',
        status: 'COMPLETED',
        resultMutualPromotionPostId: null,
      }),
      select: { id: true, payload: true },
    });
    expect(tx.telegramSystemBotWorkflow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { resultMutualPromotionPostId: 'post-1' },
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
});
