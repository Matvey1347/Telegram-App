import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TelegramContentHypothesesService } from './telegram-content-hypotheses.service';

describe('TelegramContentHypothesesService', () => {
  const tx: any = {
    telegramManagedPostContentHypothesis: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
  };
  const prisma: any = {
    telegramChannel: { findFirst: jest.fn() },
    telegramManagedPost: {
      findFirst: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    telegramContentHypothesis: {
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    icon: { findFirst: jest.fn() },
    $transaction: jest.fn((callback) => callback(tx)),
  };
  const workspace: any = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
  };
  const service = new TelegramContentHypothesesService(prisma, workspace);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'channel-1' });
  });

  it('does not attach a hypothesis from another channel or workspace', async () => {
    prisma.telegramManagedPost.findFirst.mockResolvedValue({ id: 'post-1' });
    prisma.telegramContentHypothesis.count.mockResolvedValue(0);
    await expect(
      service.setPostHypotheses('user-1', 'channel-1', 'post-1', {
        hypothesisIds: ['foreign'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      tx.telegramManagedPostContentHypothesis.deleteMany,
    ).not.toHaveBeenCalled();
  });

  it('returns not found when the managed post is outside the channel scope', async () => {
    prisma.telegramManagedPost.findFirst.mockResolvedValue(null);
    await expect(
      service.setPostHypotheses('user-1', 'channel-1', 'post-1', {
        hypothesisIds: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('atomically replaces post hypotheses', async () => {
    prisma.telegramManagedPost.findFirst.mockResolvedValue({ id: 'post-1' });
    prisma.telegramContentHypothesis.count.mockResolvedValue(2);
    await expect(
      service.setPostHypotheses('user-1', 'channel-1', 'post-1', {
        hypothesisIds: ['h1', 'h2'],
      }),
    ).resolves.toEqual({ postId: 'post-1', hypothesisIds: ['h1', 'h2'] });
    expect(
      tx.telegramManagedPostContentHypothesis.deleteMany,
    ).toHaveBeenCalledWith({ where: { managedPostId: 'post-1' } });
    expect(
      tx.telegramManagedPostContentHypothesis.createMany,
    ).toHaveBeenCalledTimes(1);
  });

  it('creates a hypothesis together with its channel-scoped post assignments', async () => {
    const createdAt = new Date('2026-09-15T08:00:00.000Z');
    prisma.telegramManagedPost.count.mockResolvedValue(2);
    prisma.telegramContentHypothesis.create.mockResolvedValue({
      id: 'hypothesis-1',
      telegramChannelId: 'channel-1',
      name: 'Hooks',
      description: null,
      status: 'ACTIVE',
      iconId: null,
      icon: null,
      startedAt: null,
      completedAt: null,
      conclusion: null,
      posts: [
        {
          managedPost: {
            id: 'post-1',
            status: 'DRAFT',
            telegramMessageIds: [],
            publishedAt: null,
          },
        },
        {
          managedPost: {
            id: 'post-2',
            status: 'PUBLISHED',
            telegramMessageIds: [],
            publishedAt: createdAt,
          },
        },
      ],
      createdAt,
      updatedAt: createdAt,
    });

    const result = await service.create('user-1', 'channel-1', {
      name: 'Hooks',
      postIds: ['post-1', 'post-2'],
    });

    expect(prisma.telegramManagedPost.count).toHaveBeenCalledWith({
      where: {
        id: { in: ['post-1', 'post-2'] },
        workspaceId: 'workspace-1',
        telegramChannelId: 'channel-1',
      },
    });
    expect(prisma.telegramContentHypothesis.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          posts: {
            create: [{ managedPostId: 'post-1' }, { managedPostId: 'post-2' }],
          },
        }),
      }),
    );
    expect(result).toMatchObject({
      postIds: ['post-1', 'post-2'],
      metrics: { linkedPosts: 2, publishedPosts: 1 },
    });
  });

  it('rejects post assignments from another channel when saving a hypothesis', async () => {
    prisma.telegramManagedPost.count.mockResolvedValue(1);

    await expect(
      service.create('user-1', 'channel-1', {
        name: 'Hooks',
        postIds: ['post-1', 'foreign-post'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.telegramContentHypothesis.create).not.toHaveBeenCalled();
  });

  it('replaces post assignments when editing a hypothesis', async () => {
    const createdAt = new Date('2026-09-01T08:00:00.000Z');
    prisma.telegramManagedPost.count.mockResolvedValue(1);
    prisma.telegramContentHypothesis.findFirst.mockResolvedValue({
      id: 'hypothesis-1',
      status: 'ACTIVE',
      startedAt: null,
      completedAt: null,
    });
    prisma.telegramContentHypothesis.update.mockResolvedValue({
      id: 'hypothesis-1',
      telegramChannelId: 'channel-1',
      name: 'Edited hooks',
      description: null,
      status: 'ACTIVE',
      iconId: null,
      icon: null,
      startedAt: null,
      completedAt: null,
      conclusion: null,
      posts: [
        {
          managedPost: {
            id: 'post-2',
            status: 'PUBLISHED',
            telegramMessageIds: [],
            publishedAt: createdAt,
          },
        },
      ],
      createdAt,
      updatedAt: createdAt,
    });

    await service.update('user-1', 'channel-1', 'hypothesis-1', {
      name: 'Edited hooks',
      postIds: ['post-2'],
    });

    expect(prisma.telegramContentHypothesis.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'hypothesis-1' },
        data: expect.objectContaining({
          posts: {
            deleteMany: {},
            create: [{ managedPostId: 'post-2' }],
          },
        }),
      }),
    );
  });
});
