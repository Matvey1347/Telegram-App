/* eslint-disable @typescript-eslint/no-unsafe-assignment -- focused Prisma test double */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TelegramPostBatchCommandService } from './telegram-post-batch-command.service';

describe('TelegramPostBatchCommandService', () => {
  const membership = { id: 'member-1', workspaceId: 'workspace-1' };

  function setup(
    overrides: {
      existing?: { id: string } | null;
      workflow?: object | null;
    } = {},
  ) {
    const prisma = {
      telegramPostBatch: {
        findFirst: jest.fn().mockResolvedValueOnce(overrides.existing ?? null),
        create: jest.fn().mockResolvedValue({ id: 'batch-1' }),
        update: jest.fn().mockResolvedValue({ id: 'batch-1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      telegramPostBatchPost: {
        create: jest.fn().mockResolvedValue({ id: 'post-2' }),
      },
      telegramChannel: {
        count: jest.fn().mockResolvedValue(1),
      },
      telegramSystemBotWorkflow: {
        findFirst: jest.fn().mockResolvedValue(
          Object.prototype.hasOwnProperty.call(overrides, 'workflow')
            ? overrides.workflow
            : {
                id: 'workflow-1',
                completedAt: new Date('2026-09-14T10:00:00.000Z'),
                payload: {
                  contents: [
                    {
                      text: 'Post text',
                      imageUrls: [],
                      mediaItems: [],
                      buttonRows: [],
                    },
                  ],
                },
              },
        ),
      },
      $transaction: jest
        .fn()
        .mockImplementation((operations: Array<Promise<unknown>>) =>
          Promise.all(operations),
        ),
    };
    const workspace = {
      resolveWorkspaceMembershipForUser: jest
        .fn()
        .mockResolvedValue(membership),
    };
    const read = { get: jest.fn().mockResolvedValue({ id: 'batch-1' }) };
    const dispatcher = { dispatch: jest.fn() };
    const service = new TelegramPostBatchCommandService(
      prisma as never,
      workspace as never,
      read as never,
      dispatcher as never,
    );
    return { service, prisma, read, dispatcher };
  }

  it('creates a manual draft for the selected channels without a bot workflow', async () => {
    const { service, prisma, read } = setup();

    await expect(
      service.createDraft('user-1', { channelIds: ['channel-1'] }),
    ).resolves.toEqual({ id: 'batch-1' });

    expect(prisma.telegramPostBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceWorkflowId: null,
          channelIds: ['channel-1'],
          posts: {
            create: expect.objectContaining({
              title: 'Post 1',
              action: 'PUBLISH_NOW',
            }),
          },
        }),
      }),
    );
    expect(read.get).toHaveBeenCalledWith('workspace-1', 'batch-1');
  });

  it('persists the complete local draft only when it is dispatched', async () => {
    const { service, prisma, dispatcher } = setup();
    dispatcher.dispatch.mockResolvedValue({ batch: { id: 'batch-1' } });

    await service.createAndDispatch('user-1', {
      title: 'Local campaign',
      channelIds: ['channel-1'],
      defaultDeleteAfterHours: 24,
      posts: [
        {
          title: 'First post',
          iconId: null,
          text: 'Content',
          imageUrls: [],
          mediaItems: [],
          buttonRows: [],
          action: 'PUBLISH_NOW',
          scheduledAt: null,
          deleteAfterHours: 24,
          longTextMode: 'IMAGES_THEN_TEXT',
          channelOverrides: [],
        },
      ],
    });

    expect(prisma.telegramPostBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Local campaign',
          posts: {
            create: [expect.objectContaining({ title: 'First post' })],
          },
        }),
      }),
    );
    expect(dispatcher.dispatch).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      memberId: 'member-1',
      batchId: 'batch-1',
      expectedVersion: 0,
    });
  });

  it('removes a newly persisted draft when dispatch preflight fails', async () => {
    const { service, prisma, dispatcher } = setup();
    dispatcher.dispatch.mockRejectedValue(new BadRequestException('failed'));

    await expect(
      service.createAndDispatch('user-1', {
        title: 'Local campaign',
        channelIds: ['channel-1'],
        defaultDeleteAfterHours: 24,
        posts: [
          {
            title: 'First post',
            iconId: null,
            text: 'Content',
            imageUrls: [],
            mediaItems: [],
            buttonRows: [],
            action: 'PUBLISH_NOW',
            scheduledAt: null,
            deleteAfterHours: 24,
            longTextMode: 'IMAGES_THEN_TEXT',
            channelOverrides: [],
          },
        ],
      }),
    ).rejects.toThrow('failed');
    expect(prisma.telegramPostBatch.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'batch-1',
        workspaceId: 'workspace-1',
        status: 'DRAFT',
      },
    });
  });

  it('adds another editable post to a manual draft', async () => {
    const { service, prisma, read } = setup();
    prisma.telegramPostBatch.findFirst.mockReset().mockResolvedValue({
      id: 'batch-1',
      version: 0,
      defaultDeleteAfterHours: 24,
      posts: [{ position: 0 }],
      _count: { posts: 1 },
    });

    await expect(service.addPost('user-1', 'batch-1')).resolves.toEqual({
      id: 'batch-1',
    });

    expect(prisma.telegramPostBatchPost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        batchId: 'batch-1',
        position: 1,
        title: 'Post 2',
      }),
    });
    expect(read.get).toHaveBeenCalledWith('workspace-1', 'batch-1');
  });

  it('deletes only a draft from the current workspace', async () => {
    const { service, prisma } = setup();

    await expect(service.removeDraft('user-1', 'batch-1')).resolves.toEqual({
      success: true,
    });

    expect(prisma.telegramPostBatch.deleteMany).toHaveBeenCalledWith({
      where: { id: 'batch-1', workspaceId: 'workspace-1', status: 'DRAFT' },
    });
  });

  it('does not delete a dispatched or foreign-workspace batch', async () => {
    const { service, prisma } = setup();
    prisma.telegramPostBatch.deleteMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.removeDraft('user-1', 'batch-1')).rejects.toThrow();
  });

  it('consumes a completed multi-post workflow into one durable draft', async () => {
    const { service, prisma, read } = setup();

    await expect(
      service.importWorkflow('user-1', 'workflow-1'),
    ).resolves.toEqual({ id: 'batch-1' });

    expect(prisma.telegramPostBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'workspace-1',
          sourceWorkflowId: 'workflow-1',
          posts: {
            create: [
              expect.objectContaining({
                position: 0,
                text: 'Post text',
                action: 'PUBLISH_NOW',
              }),
            ],
          },
        }),
      }),
    );
    expect(read.get).toHaveBeenCalledWith('workspace-1', 'batch-1');
  });

  it('is idempotent when the workflow was already consumed', async () => {
    const { service, prisma } = setup({ existing: { id: 'batch-existing' } });

    await service.importWorkflow('user-1', 'workflow-1');

    expect(prisma.telegramSystemBotWorkflow.findFirst).not.toHaveBeenCalled();
    expect(prisma.telegramPostBatch.create).not.toHaveBeenCalled();
  });

  it('does not consume a workflow outside the selected workspace', async () => {
    const { service } = setup({ workflow: null });

    await expect(
      service.importWorkflow('user-1', 'other-workspace-workflow'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    { title: 42, imageUrls: [], mediaItems: [], buttonRows: [] },
    { text: 'Post', imageUrls: 'not-an-array', mediaItems: [], buttonRows: [] },
  ])(
    'rejects malformed persisted workflow content as a domain 400',
    async (content) => {
      const { service, prisma } = setup({
        workflow: {
          id: 'workflow-1',
          completedAt: new Date(),
          payload: { contents: [content] },
        },
      });

      await expect(
        service.importWorkflow('user-1', 'workflow-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.telegramPostBatch.create).not.toHaveBeenCalled();
    },
  );

  it('rejects an imported post with more than ten media items before persistence', async () => {
    const { service, prisma } = setup({
      workflow: {
        id: 'workflow-1',
        completedAt: new Date(),
        payload: {
          contents: [
            {
              text: 'Post',
              imageUrls: Array.from(
                { length: 11 },
                (_, index) => `https://example.com/${index}.jpg`,
              ),
              mediaItems: [],
              buttonRows: [],
            },
          ],
        },
      },
    });

    await expect(
      service.importWorkflow('user-1', 'workflow-1'),
    ).rejects.toThrow('at most 10 media items');
    expect(prisma.telegramPostBatch.create).not.toHaveBeenCalled();
  });

  it('rejects more than 50 posts before touching persistence', async () => {
    const { service, prisma } = setup();
    await expect(
      service.update('user-1', 'batch-1', {
        expectedVersion: 0,
        title: 'Too large',
        channelIds: [],
        defaultDeleteAfterHours: 24,
        posts: Array.from({ length: 51 }, (_, index) => ({
          id: `post-${index}`,
          title: `Post ${index}`,
          iconId: null,
          text: 'content',
          imageUrls: [],
          mediaItems: [],
          buttonRows: [],
          action: 'PUBLISH_NOW' as const,
          scheduledAt: null,
          deleteAfterHours: 24 as const,
          longTextMode: 'IMAGES_THEN_TEXT' as const,
          channelOverrides: [],
        })),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.telegramPostBatch.findFirst).toHaveBeenCalledTimes(0);
  });
});
