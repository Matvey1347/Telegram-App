import { NotFoundException } from '@nestjs/common';
import { TelegramChannelsService } from './telegram-channels.service';
import {
  createTelegramChannelsTestHarness,
  type TelegramChannelsTestHarness,
} from './__fixtures__/telegram-channels.test-harness';

describe('TelegramChannelsService importManagedPosts', () => {
  const setup = (options?: { groupFound?: boolean }) => {
    const posts: Array<Record<string, unknown>> = [
      {
        id: 'existing',
        workspaceId: 'workspace',
        telegramChannelId: 'channel',
        title: 'Existing',
        text: null,
        imageUrls: [],
        assignedMemberId: 'member-1',
        icon: null,
        groupId: 'group-1',
        groupPosition: 0,
        createdAt: new Date('2026-08-01T10:00:00Z'),
        updatedAt: new Date('2026-08-01T10:00:00Z'),
      },
    ];
    let nextPostId = 1;
    const create = jest.fn().mockImplementation(async ({ data }) => {
      const post = {
        id: `post-${nextPostId++}`,
        ...data,
        createdAt: new Date(`2026-08-01T10:00:0${nextPostId}Z`),
        updatedAt: new Date(`2026-08-01T10:00:0${nextPostId}Z`),
      };
      posts.push(post);
      return post;
    });
    const findMany = jest.fn().mockImplementation(async (args) => {
      let result = posts;
      if (args?.where?.id?.in) {
        result = result.filter((post) => args.where.id.in.includes(post.id));
      }
      if (args?.where?.groupId) {
        const groupId = args.where.groupId;
        result = result.filter((post) =>
          typeof groupId === 'string'
            ? post.groupId === groupId
            : groupId.in.includes(post.groupId),
        );
      }
      if (args?.orderBy) {
        result = [...result].sort((left, right) => {
          const leftPosition = left.groupPosition as number | null;
          const rightPosition = right.groupPosition as number | null;
          if (leftPosition !== rightPosition) {
            return (
              (leftPosition ?? Number.MAX_SAFE_INTEGER) -
              (rightPosition ?? Number.MAX_SAFE_INTEGER)
            );
          }
          return (
            (left.createdAt as Date).getTime() -
            (right.createdAt as Date).getTime()
          );
        });
      }
      if (args?.select?.groupId) {
        return result.map((post) => ({
          id: post.id,
          groupId: post.groupId,
          status: post.status,
        }));
      }
      if (args?.select?.id) {
        return result.map((post) => ({ id: post.id }));
      }
      return result;
    });
    const update = jest.fn().mockImplementation(async ({ where, data }) => {
      const post = posts.find((item) => item.id === where.id);
      if (!post) return null;
      Object.assign(post, data);
      return post;
    });
    const executeRaw = jest.fn().mockImplementation(async () => {
      const grouped = posts
        .filter((post) => post.groupId === 'group-1')
        .sort((left, right) => {
          const leftPosition = left.groupPosition as number | null;
          const rightPosition = right.groupPosition as number | null;
          if (leftPosition !== rightPosition) {
            return (
              (leftPosition ?? Number.MAX_SAFE_INTEGER) -
              (rightPosition ?? Number.MAX_SAFE_INTEGER)
            );
          }
          return (
            (left.createdAt as Date).getTime() -
            (right.createdAt as Date).getTime()
          );
        });
      grouped.forEach((post, index) => {
        post.groupPosition = index;
        post.statusPosition = index;
      });
      return grouped.length;
    });
    const count = jest
      .fn()
      .mockImplementation(
        async ({ where }) =>
          posts.filter((post) => post.groupId === where.groupId).length,
      );
    const prisma = {
      telegramManagedPost: {
        create,
        count,
        findMany,
        update,
      },
      postGroup: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            options?.groupFound === false
              ? null
              : { id: 'group-1', workspaceId: 'workspace' },
          ),
      },
      icon: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation(async ({ where }) => ({
          id: where.id,
        })),
        upsert: jest.fn().mockImplementation(async ({ create }) => ({
          id: `icon-${create.emoji}`,
        })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $executeRaw: executeRaw,
      $transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(prisma)),
    };
    const workspaceService = {
      resolveAssignedMemberId: jest.fn().mockResolvedValue({
        workspaceId: 'workspace',
        assignedMemberId: 'member-1',
      }),
    };
    const service = createTelegramChannelsTestHarness(
      prisma as never,
      workspaceService as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    service['findOne'] = jest.fn().mockResolvedValue({
      id: 'channel',
      workspaceId: 'workspace',
    });
    return { service, prisma, create, posts };
  };

  it('creates selected rows in the selected group with managed-post defaults and normalized positions', async () => {
    const { service, prisma, create, posts } = setup();

    const result = await service.importManagedPosts('user', 'channel', {
      postGroupId: 'group-1',
      rows: [
        {
          title: 'First',
          text: 'First body',
          emoji: '🔥',
          urls: ['https://example.com/one.png'],
        },
        {
          title: 'Second',
          text: 'Second body',
          urls: ['https://example.com/two.png'],
        },
      ],
    });

    expect(result.createdCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(result.rows.map((row) => row.status)).toEqual([
      'created',
      'created',
    ]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'workspace',
          telegramChannelId: 'channel',
          groupId: 'group-1',
          assignedMemberId: 'member-1',
          title: 'First',
          text: 'First body',
          imageUrls: ['https://example.com/one.png'],
          origin: 'SYSTEM',
          icon: 'icon-🔥',
          groupPosition: 1,
        }),
      }),
    );
    expect(prisma.icon.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          workspaceId: 'workspace',
          type: 'emoji',
          name: 'First',
          emoji: '🔥',
          createdByUserId: 'user',
        }),
      }),
    );
    expect(
      posts.map((post) => [post.id, post.groupPosition, post.statusPosition]),
    ).toEqual([
      ['existing', 0, 0],
      ['post-1', 1, 1],
      ['post-2', 2, 2],
    ]);
  });

  it('skips invalid rows and still creates valid rows', async () => {
    const { service, create } = setup();
    const onProgress = jest.fn();

    const result = await service.importManagedPosts(
      'user',
      'channel',
      {
        postGroupId: 'group-1',
        rows: [
          { title: '   ', text: 'No title' },
          { title: 'Bad image', urls: 42 },
          {
            title: 'Good',
            urls: 'https://example.com/one.png, https://example.com/two.png',
          },
        ],
      },
      onProgress,
    );

    expect(result.createdCount).toBe(1);
    expect(result.skippedCount).toBe(2);
    expect(result.rows).toEqual([
      { index: 0, status: 'skipped', error: 'Title is required' },
      {
        index: 1,
        status: 'skipped',
        error: 'Image URLs must be strings',
      },
      expect.objectContaining({ index: 2, status: 'created' }),
    ]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 0,
        status: 'skipped',
        error: 'Title is required',
      }),
      1,
      3,
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 2,
        status: 'created',
        title: 'Good',
        message: 'Post created: Good',
      }),
      3,
      3,
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Good',
          imageUrls: [
            'https://example.com/one.png',
            'https://example.com/two.png',
          ],
        }),
      }),
    );
  });

  it('cleans markdown-wrapped image urls during import', async () => {
    const { service, create } = setup();

    await service.importManagedPosts('user', 'channel', {
      rows: [
        {
          title: 'Markdown image',
          urls: [
            '[https://images.example.com/a.png](https://images.example.com/a.png)',
          ],
        },
      ],
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          imageUrls: ['https://images.example.com/a.png'],
        }),
      }),
    );
  });

  it('keeps commas inside a single image URL', async () => {
    const { service, create } = setup();

    await service.importManagedPosts('user', 'channel', {
      rows: [
        {
          title: 'Comma URL',
          urls: ['https://loremflickr.com/1280/800/open,door,road?lock=22003'],
        },
      ],
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          imageUrls: [
            'https://loremflickr.com/1280/800/open,door,road?lock=22003',
          ],
        }),
      }),
    );
  });

  it('keeps each imported row outside a long import transaction', async () => {
    const { service, prisma } = setup();

    await service.importManagedPosts('user', 'channel', {
      postGroupId: 'group-1',
      rows: Array.from({ length: 8 }, (_, index) => ({
        title: `Post ${index + 1}`,
      })),
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
  });

  it('uses standard group positions without JSON position fields', async () => {
    const { service, create, posts } = setup();

    await service.importManagedPosts('user', 'channel', {
      postGroupId: 'group-1',
      rows: [
        { title: 'First blank', text: 'Body' },
        { title: 'Second blank', text: 'Body' },
      ],
    });

    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ groupPosition: 1 }),
      }),
    );
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ groupPosition: 2 }),
      }),
    );
    expect(
      posts.map((post) => [post.id, post.groupPosition, post.statusPosition]),
    ).toEqual([
      ['existing', 0, 0],
      ['post-1', 1, 1],
      ['post-2', 2, 2],
    ]);
  });

  it('reports schedule errors and retries scheduling the existing draft', async () => {
    const { service, create } = setup();
    const onProgress = jest.fn();
    const publish = jest
      .spyOn(service as any, 'publishManagedPost')
      .mockRejectedValueOnce(new Error('Telegram rejected the image') as never)
      .mockImplementationOnce(
        async (...args: unknown[]) =>
          ({
            id: args[2],
            status: 'SCHEDULED',
          }) as never,
      );
    const payload = {
      rows: [
        {
          title: 'Retry me',
          text: 'Body',
          scheduledAt: '2099-08-22T09:55:00.000Z',
        },
      ],
    };

    const failed = await service.importManagedPosts(
      'user',
      'channel',
      payload,
      onProgress,
    );
    const retried = await service.importManagedPosts(
      'user',
      'channel',
      payload,
    );

    expect(failed.createdCount).toBe(0);
    expect(failed.skippedCount).toBe(1);
    expect(failed.rows[0]).toEqual(
      expect.objectContaining({
        status: 'scheduleFailed',
        error: 'Telegram rejected the image',
      }),
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'scheduleFailed',
        error: 'Telegram rejected the image',
        message: expect.stringContaining('Telegram rejected the image'),
      }),
      1,
      1,
    );
    expect(retried.createdCount).toBe(1);
    expect(retried.skippedCount).toBe(0);
    expect(retried.rows[0]).toEqual(
      expect.objectContaining({ status: 'scheduled' }),
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('stops before the next row when the import stream is aborted', async () => {
    const { service, create } = setup();
    const controller = new AbortController();

    const result = await service.importManagedPosts(
      'user',
      'channel',
      { rows: [{ title: 'First' }, { title: 'Second' }] },
      () => controller.abort(),
      controller.signal,
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(
      expect.objectContaining({ status: 'created' }),
    );
  });

  it('requires the selected group to belong to the current workspace and channel', async () => {
    const { service, prisma } = setup({ groupFound: false });

    await expect(
      service.importManagedPosts('user', 'channel', {
        postGroupId: 'group-from-other-workspace',
        rows: [{ title: 'Post' }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.postGroup.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'group-from-other-workspace',
        workspaceId: 'workspace',
        telegramChannelId: 'channel',
      },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
