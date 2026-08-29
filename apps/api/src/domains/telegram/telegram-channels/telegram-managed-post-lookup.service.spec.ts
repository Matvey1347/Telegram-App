import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TELEGRAM_MANAGED_POST_LOOKUP_MAX_IDS } from '@telegram-system/shared';
import { TelegramManagedPostLookupDto } from './telegram-channel-bounded-read.dto';
import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';
import { TelegramManagedPostLookupService } from './telegram-managed-post-lookup.service';

function post(id: string, messageId = id) {
  return {
    id,
    title: `Title ${id}`,
    icon: id,
    status: 'DRAFT',
    scheduledAt: null,
    publishedAt: null,
    telegramRemoteStatus: 'NONE',
    telegramMessageIds: [messageId],
    telegramIdVerificationStatus: 'UNVERIFIED',
    lastError: null,
    text: 'must not leak',
    imageUrls: ['must-not-leak'],
    plannerRunId: 'must-not-leak',
    assignedMember: { id: 'must-not-leak' },
    group: { id: 'must-not-leak' },
  };
}

function setup(rows: ReturnType<typeof post>[]) {
  const prisma = {
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
    telegramChannel: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'channel-1',
      }),
      create: jest.fn(),
      update: jest.fn(),
    },
    telegramManagedPost: {
      findMany: jest.fn().mockResolvedValue(rows),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    telegramPost: { findMany: jest.fn() },
    icon: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
  };
  const presentation = new TelegramManagedPostGroupPresentationService(
    prisma as never,
  );
  const service = new TelegramManagedPostLookupService(
    prisma as never,
    { workspace: jest.fn().mockResolvedValue('workspace-1') } as never,
    presentation,
  );
  return { prisma, service };
}

describe('TelegramManagedPostLookupService', () => {
  it('returns more than 100 posts in request order with a constant batch shape', async () => {
    const ids = Array.from({ length: 125 }, (_, index) => `post-${index}`);
    const rows = ids.map((id) => post(id)).reverse();
    const { prisma, service } = setup(rows);

    const result = await service.lookup('user-1', 'channel-1', ids);

    expect(result.items.map((item) => item.id)).toEqual(ids);
    expect(result.missingIds).toEqual([]);
    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.telegramManagedPost.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.telegramPost.findMany).not.toHaveBeenCalled();
    expect(prisma.icon.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.telegramManagedPost.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ids },
        workspaceId: 'workspace-1',
        telegramChannelId: 'channel-1',
      },
      select: {
        id: true,
        title: true,
        icon: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        telegramRemoteStatus: true,
        telegramMessageIds: true,
        telegramIdVerificationStatus: true,
        lastError: true,
      },
    });
    expect(result.items[0]).toEqual({
      id: 'post-0',
      title: 'Title post-0',
      icon: 'post-0',
      iconPresentation: null,
      status: 'DRAFT',
      scheduledAt: null,
      publishedAt: null,
      telegramRemoteStatus: 'NONE',
      telegramMessageIds: ['post-0'],
      telegramIdVerificationStatus: 'UNVERIFIED',
      lastError: null,
    });
    expect(result.items[0]).not.toHaveProperty('workspaceId');
    expect(result.items[0]).not.toHaveProperty('text');
    expect(result.items[0]).not.toHaveProperty('imageUrls');
    expect(result.items[0]).not.toHaveProperty('plannerRunId');
    expect(result.items[0]).not.toHaveProperty('assignedMember');
    expect(result.items[0]).not.toHaveProperty('group');
    expect(result.items[0]).not.toHaveProperty('engagementMetrics');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.telegramManagedPost.create).not.toHaveBeenCalled();
    expect(prisma.telegramManagedPost.update).not.toHaveBeenCalled();
    expect(prisma.telegramManagedPost.delete).not.toHaveBeenCalled();
    expect(prisma.icon.create).not.toHaveBeenCalled();
  });

  it('reports missing and cross-workspace post IDs in request order', async () => {
    const { service } = setup([post('post-3'), post('post-1')]);

    const result = await service.lookup('user-1', 'channel-1', [
      'post-1',
      'other-workspace-post',
      'post-3',
      'missing-post',
    ]);

    expect(result.items.map((item) => item.id)).toEqual(['post-1', 'post-3']);
    expect(result.missingIds).toEqual(['other-workspace-post', 'missing-post']);
  });

  it('rejects a channel outside the active workspace before reading posts', async () => {
    const { prisma, service } = setup([]);
    prisma.telegramChannel.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.lookup('user-1', 'other-channel', ['post-1']),
    ).rejects.toThrow('Telegram channel not found');

    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'other-channel',
        workspaceId: 'workspace-1',
        isActive: true,
      },
      select: {
        id: true,
      },
    });
    expect(prisma.telegramManagedPost.findMany).not.toHaveBeenCalled();
  });
});

describe('TelegramManagedPostLookupDto', () => {
  async function errors(ids: string[]) {
    return validate(plainToInstance(TelegramManagedPostLookupDto, { ids }));
  }

  it('accepts the frozen maximum and rejects empty, duplicate, and oversized ID lists', async () => {
    const maximum = Array.from(
      { length: TELEGRAM_MANAGED_POST_LOOKUP_MAX_IDS },
      (_, index) => `post-${index}`,
    );

    expect(await errors(maximum)).toHaveLength(0);
    expect(await errors([])).not.toHaveLength(0);
    expect(await errors([''])).not.toHaveLength(0);
    expect(await errors(['post-1', 'post-1'])).not.toHaveLength(0);
    expect(await errors([...maximum, 'one-too-many'])).not.toHaveLength(0);
  });
});
