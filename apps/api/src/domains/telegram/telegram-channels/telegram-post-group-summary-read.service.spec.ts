import { PayloadTooLargeException } from '@nestjs/common';
import { TelegramManagedPostStatus } from '@prisma/client';
import { TELEGRAM_POST_GROUP_SUMMARY_MAX_ITEMS } from '@telegram-system/shared';
import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';
import { TelegramPostGroupSummaryReadService } from './telegram-post-group-summary-read.service';

function group(index: number) {
  return {
    id: `group-${index}`,
    workspaceId: 'workspace-1',
    telegramChannelId: 'channel-1',
    title: `Group ${index}`,
    description: null,
    icon: `icon-${index}`,
    isSystem: false,
    systemKey: null,
    statusNumberingEnabled: false,
    createdByMemberId: 'member-1',
    sidebarPosition: index,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    createdByMember: {
      id: 'member-1',
      role: 'admin',
      telegramUsername: null,
      avatarIconId: null,
      avatarIcon: null,
      user: { id: 'user-1', name: 'Owner' },
    },
    telegramChannel: { id: 'channel-1', title: 'Channel' },
  };
}

function setup(groups: ReturnType<typeof group>[]) {
  const prisma = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    telegramChannel: {
      findFirst: jest.fn().mockResolvedValue({ id: 'channel-1' }),
      create: jest.fn(),
      update: jest.fn(),
    },
    postGroup: {
      findMany: jest.fn().mockResolvedValue(groups),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    telegramManagedPost: {
      groupBy: jest.fn().mockResolvedValue(
        groups.flatMap((item) => [
          {
            groupId: item.id,
            status: TelegramManagedPostStatus.DRAFT,
            _count: { _all: 2 },
          },
          {
            groupId: item.id,
            status: TelegramManagedPostStatus.PUBLISHED,
            _count: { _all: 3 },
          },
        ]),
      ),
      create: jest.fn(),
      update: jest.fn(),
    },
    icon: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
  };
  const presentation = new TelegramManagedPostGroupPresentationService(
    prisma as never,
  );
  const service = new TelegramPostGroupSummaryReadService(
    prisma as never,
    { workspace: jest.fn().mockResolvedValue('workspace-1') } as never,
    presentation,
  );
  return { prisma, service };
}

describe('TelegramPostGroupSummaryReadService', () => {
  it.each([1, 100, TELEGRAM_POST_GROUP_SUMMARY_MAX_ITEMS])(
    'uses the same bounded batch shape for %i groups',
    async (count) => {
      const { prisma, service } = setup(
        Array.from({ length: count }, (_, index) => group(index)),
      );

      const result = await service.summaries('user-1', 'channel-1');

      expect(result).toHaveLength(count);
      expect(result[0]?.postsCount).toBe(5);
      expect(result[0]?.statusSummary).toEqual({
        totalPosts: 5,
        draftCount: 2,
        scheduledCount: 0,
        publishedCount: 3,
        failedCount: 0,
        computedStatus: 'MIXED',
      });
      expect(prisma.telegramChannel.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.postGroup.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.telegramManagedPost.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.icon.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.postGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId: 'workspace-1',
            telegramChannelId: 'channel-1',
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: TELEGRAM_POST_GROUP_SUMMARY_MAX_ITEMS + 1,
        }),
      );
      expect(prisma.telegramManagedPost.groupBy).toHaveBeenCalledWith({
        by: ['groupId', 'status'],
        where: {
          workspaceId: 'workspace-1',
          telegramChannelId: 'channel-1',
          groupId: {
            in: Array.from({ length: count }, (_, index) => `group-${index}`),
          },
        },
        _count: { _all: true },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.postGroup.create).not.toHaveBeenCalled();
      expect(prisma.postGroup.update).not.toHaveBeenCalled();
      expect(prisma.postGroup.delete).not.toHaveBeenCalled();
      expect(prisma.telegramManagedPost.create).not.toHaveBeenCalled();
      expect(prisma.telegramManagedPost.update).not.toHaveBeenCalled();
      expect(prisma.icon.create).not.toHaveBeenCalled();
    },
  );

  it('fails explicitly above the frozen limit without truncating or hydrating', async () => {
    const { prisma, service } = setup(
      Array.from(
        { length: TELEGRAM_POST_GROUP_SUMMARY_MAX_ITEMS + 1 },
        (_, index) => group(index),
      ),
    );

    await expect(
      service.summaries('user-1', 'channel-1'),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);

    expect(prisma.postGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: TELEGRAM_POST_GROUP_SUMMARY_MAX_ITEMS + 1,
      }),
    );
    expect(prisma.telegramManagedPost.groupBy).not.toHaveBeenCalled();
    expect(prisma.icon.findMany).not.toHaveBeenCalled();
  });

  it('rejects a channel outside the workspace before reading group data', async () => {
    const { prisma, service } = setup([]);
    prisma.telegramChannel.findFirst.mockResolvedValueOnce(null);

    await expect(service.summaries('user-1', 'other-channel')).rejects.toThrow(
      'Telegram channel not found',
    );

    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'other-channel',
        workspaceId: 'workspace-1',
        isActive: true,
      },
      select: { id: true },
    });
    expect(prisma.postGroup.findMany).not.toHaveBeenCalled();
  });
});
