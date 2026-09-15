import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TelegramContentHypothesisStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import {
  TelegramContentHypothesisInputDto,
  TelegramManagedPostHypothesesInputDto,
} from './telegram-content-hypotheses.dto';

const hypothesisInclude = {
  icon: true,
  posts: {
    select: {
      managedPost: {
        select: {
          id: true,
          status: true,
          telegramMessageIds: true,
          publishedAt: true,
        },
      },
    },
  },
} satisfies Prisma.TelegramContentHypothesisInclude;
type HypothesisRow = Prisma.TelegramContentHypothesisGetPayload<{
  include: typeof hypothesisInclude;
}>;
type PostMetric = {
  telegramMessageId: string;
  viewsCount: number | null;
  reactionsCount: number | null;
  commentsCount: number | null;
  forwardsCount: number | null;
};
type AudienceSnapshot = { collectedAt: Date; subscribersCount: number | null };

@Injectable()
export class TelegramContentHypothesesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
  ) {}

  private async scope(userId: string, channelId: string) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    return workspaceId;
  }

  private async validateIcon(workspaceId: string, iconId?: string | null) {
    if (!iconId) return;
    const icon = await this.prisma.icon.findFirst({
      where: { id: iconId, OR: [{ workspaceId }, { workspaceId: null }] },
      select: { id: true },
    });
    if (!icon)
      throw new BadRequestException('Icon is unavailable in this workspace');
  }

  private async validatePostIds(
    workspaceId: string,
    channelId: string,
    postIds?: string[],
  ) {
    if (postIds === undefined) return undefined;
    const ids = [...new Set(postIds)];
    const count = ids.length
      ? await this.prisma.telegramManagedPost.count({
          where: { id: { in: ids }, workspaceId, telegramChannelId: channelId },
        })
      : 0;
    if (count !== ids.length)
      throw new BadRequestException(
        'One or more posts do not belong to this channel',
      );
    return ids;
  }

  private lifecycle(
    status: TelegramContentHypothesisStatus,
    existing?: { startedAt: Date | null; completedAt: Date | null },
  ) {
    const terminal =
      status === 'SUCCESSFUL' || status === 'FAILED' || status === 'ARCHIVED';
    return {
      startedAt:
        status === 'ACTIVE'
          ? (existing?.startedAt ?? new Date())
          : existing?.startedAt,
      completedAt: terminal ? (existing?.completedAt ?? new Date()) : null,
    };
  }

  async postOptions(userId: string, channelId: string) {
    const workspaceId = await this.scope(userId, channelId);
    const posts = await this.prisma.telegramManagedPost.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      select: {
        id: true,
        title: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        group: { select: { title: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 1000,
    });
    return posts.map((post) => ({
      id: post.id,
      title: post.title,
      status: post.status,
      groupTitle: post.group?.title ?? null,
      scheduledAt: post.scheduledAt?.toISOString() ?? null,
      publishedAt: post.publishedAt?.toISOString() ?? null,
    }));
  }

  async list(userId: string, channelId: string) {
    const workspaceId = await this.scope(userId, channelId);
    const rows = await this.prisma.telegramContentHypothesis.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      include: hypothesisInclude,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    const messageIds = [
      ...new Set(
        rows.flatMap((hypothesis) =>
          hypothesis.posts.flatMap(
            (post) => post.managedPost.telegramMessageIds,
          ),
        ),
      ),
    ];
    const postMetrics: PostMetric[] = messageIds.length
      ? await this.prisma.telegramPost.findMany({
          where: {
            workspaceId,
            telegramChannelId: channelId,
            telegramMessageId: { in: messageIds },
            excludeFromAnalytics: false,
          },
          select: {
            telegramMessageId: true,
            viewsCount: true,
            reactionsCount: true,
            commentsCount: true,
            forwardsCount: true,
          },
        })
      : [];
    const metricsByMessage = new Map(
      postMetrics.map((post) => [post.telegramMessageId, post]),
    );
    const snapshotDates = rows
      .flatMap((hypothesis) => [hypothesis.startedAt, hypothesis.completedAt])
      .filter((date): date is Date => Boolean(date));
    const snapshots: AudienceSnapshot[] = snapshotDates.length
      ? await this.prisma.telegramChannelAudienceSnapshot.findMany({
          where: {
            workspaceId,
            telegramChannelId: channelId,
            collectedAt: {
              gte: new Date(
                Math.min(...snapshotDates.map(Number)) - 24 * 60 * 60_000,
              ),
              lte: new Date(
                Math.max(Date.now(), ...snapshotDates.map(Number)) +
                  24 * 60 * 60_000,
              ),
            },
          },
          select: { collectedAt: true, subscribersCount: true },
          orderBy: { collectedAt: 'asc' },
          take: 5000,
        })
      : [];
    return rows.map((row) => this.map(row, metricsByMessage, snapshots));
  }

  private map(
    row: HypothesisRow,
    metricsByMessage = new Map<string, PostMetric>(),
    snapshots: AudienceSnapshot[] = [],
  ) {
    const managedPosts = row.posts.map((post) => post.managedPost);
    const publishedPosts = managedPosts.filter(
      (post) => post.publishedAt || post.status === 'PUBLISHED',
    );
    const metrics = publishedPosts.flatMap((post) =>
      post.telegramMessageIds.flatMap((id) => {
        const metric = metricsByMessage.get(id);
        return metric ? [metric] : [];
      }),
    );
    const average = (read: (metric: PostMetric) => number | null) => {
      const values = metrics
        .map(read)
        .filter(
          (value): value is number => value !== null && Number.isFinite(value),
        );
      return values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;
    };
    const closest = (date: Date | null, side: 'before' | 'after') => {
      if (!date) return null;
      const snapshot =
        side === 'before'
          ? [...snapshots].reverse().find((item) => item.collectedAt <= date)
          : snapshots.find((item) => item.collectedAt >= date);
      return snapshot?.subscribersCount ?? null;
    };
    const start = closest(row.startedAt, 'after');
    const end = closest(row.completedAt ?? new Date(), 'before');
    return {
      id: row.id,
      telegramChannelId: row.telegramChannelId,
      name: row.name,
      description: row.description,
      status: row.status,
      iconId: row.iconId,
      iconPresentation: iconToResolvedEmoji(row.icon),
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      conclusion: row.conclusion,
      metrics: {
        linkedPosts: managedPosts.length,
        publishedPosts: publishedPosts.length,
        averageViews: average((metric) => metric.viewsCount),
        averageReactionRate: average((metric) =>
          metric.viewsCount
            ? ((metric.reactionsCount ?? 0) / metric.viewsCount) * 100
            : null,
        ),
        averageCommentRate: average((metric) =>
          metric.viewsCount
            ? ((metric.commentsCount ?? 0) / metric.viewsCount) * 100
            : null,
        ),
        averageForwardRate: average((metric) =>
          metric.viewsCount
            ? ((metric.forwardsCount ?? 0) / metric.viewsCount) * 100
            : null,
        ),
        observedSubscriberDelta:
          start !== null && end !== null ? end - start : null,
      },
      postIds: managedPosts.map((post) => post.id),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async create(
    userId: string,
    channelId: string,
    dto: TelegramContentHypothesisInputDto,
  ) {
    const workspaceId = await this.scope(userId, channelId);
    await this.validateIcon(workspaceId, dto.iconId);
    const postIds =
      (await this.validatePostIds(workspaceId, channelId, dto.postIds)) ?? [];
    const status = dto.status ?? TelegramContentHypothesisStatus.ACTIVE;
    const row = await this.prisma.telegramContentHypothesis.create({
      data: {
        workspaceId,
        telegramChannelId: channelId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        status,
        iconId: dto.iconId ?? null,
        conclusion: dto.conclusion?.trim() || null,
        ...this.lifecycle(status),
        posts: postIds.length
          ? { create: postIds.map((managedPostId) => ({ managedPostId })) }
          : undefined,
      },
      include: hypothesisInclude,
    });
    return this.map(row);
  }

  async update(
    userId: string,
    channelId: string,
    id: string,
    dto: TelegramContentHypothesisInputDto,
  ) {
    const workspaceId = await this.scope(userId, channelId);
    await this.validateIcon(workspaceId, dto.iconId);
    const existing = await this.prisma.telegramContentHypothesis.findFirst({
      where: { id, workspaceId, telegramChannelId: channelId },
      select: { id: true, status: true, startedAt: true, completedAt: true },
    });
    if (!existing) throw new NotFoundException('Content hypothesis not found');
    const postIds = await this.validatePostIds(
      workspaceId,
      channelId,
      dto.postIds,
    );
    const status = dto.status ?? existing.status;
    const row = await this.prisma.telegramContentHypothesis.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        status,
        iconId: dto.iconId ?? null,
        conclusion: dto.conclusion?.trim() || null,
        ...this.lifecycle(status, existing),
        posts:
          postIds === undefined
            ? undefined
            : {
                deleteMany: {},
                create: postIds.map((managedPostId) => ({ managedPostId })),
              },
      },
      include: hypothesisInclude,
    });
    return this.map(row);
  }

  async remove(userId: string, channelId: string, id: string) {
    const workspaceId = await this.scope(userId, channelId);
    const result = await this.prisma.telegramContentHypothesis.deleteMany({
      where: { id, workspaceId, telegramChannelId: channelId },
    });
    if (!result.count)
      throw new NotFoundException('Content hypothesis not found');
    return { success: true };
  }

  async setPostHypotheses(
    userId: string,
    channelId: string,
    postId: string,
    dto: TelegramManagedPostHypothesesInputDto,
  ) {
    const workspaceId = await this.scope(userId, channelId);
    const post = await this.prisma.telegramManagedPost.findFirst({
      where: { id: postId, workspaceId, telegramChannelId: channelId },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Managed post not found');
    const ids = [...new Set(dto.hypothesisIds)];
    const count = await this.prisma.telegramContentHypothesis.count({
      where: { id: { in: ids }, workspaceId, telegramChannelId: channelId },
    });
    if (count !== ids.length)
      throw new BadRequestException(
        'One or more hypotheses do not belong to this channel',
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.telegramManagedPostContentHypothesis.deleteMany({
        where: { managedPostId: postId },
      });
      if (ids.length)
        await tx.telegramManagedPostContentHypothesis.createMany({
          data: ids.map((hypothesisId) => ({
            managedPostId: postId,
            hypothesisId,
          })),
        });
    });
    return { postId, hypothesisIds: ids };
  }
}
