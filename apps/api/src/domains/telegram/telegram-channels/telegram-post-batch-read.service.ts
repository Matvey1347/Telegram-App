import { Injectable } from '@nestjs/common';
import type {
  TelegramPostBatch,
  TelegramPostBatchChannelOverride,
  TelegramPostBatchAssociationTarget,
  TelegramPostBatchDelivery,
  TelegramPostBatchListResponse,
} from '@telegram-system/shared';
import { normalizeTelegramPostMediaItems } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeTelegramPostButtonRows } from '../../../telegram/shared/telegram-inline-keyboard';
import { postBatchNotFound } from './telegram-post-batch.errors';
import { TelegramPostBatchSummaryService } from './telegram-post-batch-summary.service';

const batchSelect = {
  id: true,
  workspaceId: true,
  title: true,
  status: true,
  version: true,
  channelIds: true,
  defaultDeleteAfterHours: true,
  createdAt: true,
  updatedAt: true,
  posts: {
    orderBy: { position: 'asc' as const },
    select: {
      id: true,
      position: true,
      title: true,
      text: true,
      imageUrls: true,
      mediaItems: true,
      buttonRows: true,
      action: true,
      scheduledAt: true,
      deleteAfterHours: true,
      longTextMode: true,
      channelOverrides: true,
    },
  },
  adSaleLinks: {
    select: {
      id: true,
      adSaleId: true,
      adSale: { select: { title: true, advertiserName: true } },
    },
  },
  mutualPromotionLinks: {
    select: {
      id: true,
      mutualPromotionFolderId: true,
      mutualPromotionFolder: { select: { title: true } },
    },
  },
} as const;

type BatchRow =
  Awaited<ReturnType<TelegramPostBatchReadService['batchRow']>> extends infer T
    ? NonNullable<T>
    : never;

@Injectable()
export class TelegramPostBatchReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly summaries: TelegramPostBatchSummaryService,
  ) {}

  async list(
    workspaceId: string,
    page = 1,
    pageSize = 20,
  ): Promise<TelegramPostBatchListResponse> {
    const skip = (page - 1) * pageSize;
    const [rows, totalItems] = await Promise.all([
      this.prisma.telegramPostBatch.findMany({
        where: { workspaceId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        select: {
          id: true,
          title: true,
          status: true,
          version: true,
          channelIds: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { posts: true } },
        },
      }),
      this.prisma.telegramPostBatch.count({ where: { workspaceId } }),
    ]);
    const aggregates = await this.summaries.aggregate(
      workspaceId,
      rows.map((row) => row.id),
    );
    return {
      items: rows.map((row) =>
        this.summaries.summary(
          { ...row, postCount: row._count.posts },
          aggregates.get(row.id),
        ),
      ),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async get(workspaceId: string, id: string): Promise<TelegramPostBatch> {
    const row = await this.batchRow(workspaceId, id);
    if (!row) throw postBatchNotFound();
    const aggregates = await this.summaries.aggregate(workspaceId, [id]);
    return this.detail(row, aggregates.get(id));
  }

  async deliveries(
    workspaceId: string,
    batchId: string,
    page = 1,
    pageSize = 50,
  ) {
    await this.requireBatch(workspaceId, batchId);
    const where = { workspaceId, batchId };
    const [rows, totalItems] = await Promise.all([
      this.prisma.telegramPostBatchDelivery.findMany({
        where,
        orderBy: [
          { scheduledAt: 'asc' },
          { batchPost: { position: 'asc' } },
          { id: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          batchPostId: true,
          action: true,
          scheduledAt: true,
          deleteAfterHours: true,
          status: true,
          publishedAt: true,
          deleteAt: true,
          deletedAt: true,
          attemptCount: true,
          lastError: true,
          managedPostId: true,
          batchPost: { select: { title: true } },
          telegramChannel: {
            select: { id: true, title: true, photoUrl: true },
          },
          managedPost: {
            select: { telegramMessageUrls: true, telegramRemoteStatus: true },
          },
        },
      }),
      this.prisma.telegramPostBatchDelivery.count({ where }),
    ]);
    return {
      items: rows.map(
        (row): TelegramPostBatchDelivery => ({
          id: row.id,
          postId: row.batchPostId,
          postTitle: row.batchPost.title,
          telegramChannel: row.telegramChannel,
          managedPostId: row.managedPostId,
          telegramMessageUrls: row.managedPost.telegramMessageUrls,
          telegramRemoteStatus: row.managedPost.telegramRemoteStatus,
          action: row.action,
          scheduledAt: row.scheduledAt.toISOString(),
          deleteAfterHours: lifetime(row.deleteAfterHours),
          status: row.status,
          publishedAt: iso(row.publishedAt),
          deleteAt: iso(row.deleteAt),
          deletedAt: iso(row.deletedAt),
          attemptCount: row.attemptCount,
          lastError: row.lastError,
        }),
      ),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async linkTargets(
    workspaceId: string,
    type: 'AD_SALE' | 'MUTUAL_PROMOTION_FOLDER',
  ): Promise<TelegramPostBatchAssociationTarget[]> {
    if (type === 'AD_SALE') {
      const rows = await this.prisma.telegramAdSale.findMany({
        where: { workspaceId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 100,
        select: {
          id: true,
          title: true,
          advertiserName: true,
          status: true,
        },
      });
      return rows.map((row) => ({
        type,
        entityId: row.id,
        title: row.title?.trim() || row.advertiserName,
        subtitle: row.status,
      }));
    }
    const rows = await this.prisma.mutualPromotionFolder.findMany({
      where: { workspaceId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: { id: true, title: true, status: true },
    });
    return rows.map((row) => ({
      type,
      entityId: row.id,
      title: row.title,
      subtitle: row.status,
    }));
  }

  async requireBatch(workspaceId: string, id: string) {
    const row = await this.prisma.telegramPostBatch.findFirst({
      where: { id, workspaceId },
      select: { id: true, status: true, version: true },
    });
    if (!row) throw postBatchNotFound();
    return row;
  }

  private batchRow(workspaceId: string, id: string) {
    return this.prisma.telegramPostBatch.findFirst({
      where: { id, workspaceId },
      select: batchSelect,
    });
  }

  private detail(
    row: BatchRow,
    aggregate: Parameters<TelegramPostBatchSummaryService['summary']>[1],
  ): TelegramPostBatch {
    return {
      ...this.summaries.summary(
        { ...row, postCount: row.posts.length },
        aggregate,
      ),
      channelIds: row.channelIds,
      defaultDeleteAfterHours: lifetime(row.defaultDeleteAfterHours),
      posts: row.posts.map((post) => ({
        id: post.id,
        position: post.position,
        title: post.title,
        text: post.text,
        imageUrls: post.imageUrls,
        mediaItems: normalizeTelegramPostMediaItems(
          post.mediaItems,
          post.imageUrls,
        ),
        buttonRows: normalizeTelegramPostButtonRows(post.buttonRows),
        action: post.action,
        scheduledAt: iso(post.scheduledAt),
        deleteAfterHours: lifetime(post.deleteAfterHours),
        longTextMode:
          post.longTextMode === 'CAPTION_THEN_TEXT'
            ? 'CAPTION_THEN_TEXT'
            : 'IMAGES_THEN_TEXT',
        channelOverrides: parseOverrides(post.channelOverrides),
      })),
      associations: [
        ...row.adSaleLinks.map((link) => ({
          id: link.id,
          type: 'AD_SALE' as const,
          entityId: link.adSaleId,
          title: link.adSale.title?.trim() || link.adSale.advertiserName,
        })),
        ...row.mutualPromotionLinks.map((link) => ({
          id: link.id,
          type: 'MUTUAL_PROMOTION_FOLDER' as const,
          entityId: link.mutualPromotionFolderId,
          title: link.mutualPromotionFolder.title,
        })),
      ],
    };
  }
}

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

function lifetime(value: number | null): 24 | 48 | 72 | null {
  return value === 24 || value === 48 || value === 72 ? value : null;
}

function parseOverrides(value: unknown): TelegramPostBatchChannelOverride[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (typeof row.telegramChannelId !== 'string') return [];
    const action =
      row.action === 'PUBLISH_NOW' || row.action === 'SCHEDULE'
        ? row.action
        : undefined;
    const scheduledAt =
      typeof row.scheduledAt === 'string' || row.scheduledAt === null
        ? row.scheduledAt
        : undefined;
    return [{ telegramChannelId: row.telegramChannelId, action, scheduledAt }];
  });
}
