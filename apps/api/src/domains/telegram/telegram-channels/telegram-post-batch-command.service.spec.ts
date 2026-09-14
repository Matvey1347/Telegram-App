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
    };
    const workspace = {
      resolveWorkspaceMembershipForUser: jest
        .fn()
        .mockResolvedValue(membership),
    };
    const read = { get: jest.fn().mockResolvedValue({ id: 'batch-1' }) };
    const service = new TelegramPostBatchCommandService(
      prisma as never,
      workspace as never,
      read as never,
      { dispatch: jest.fn() } as never,
    );
    return { service, prisma, read };
  }

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
