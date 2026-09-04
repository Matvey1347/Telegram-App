import { Injectable } from '@nestjs/common';
import { TelegramManagedPostStatus, type Prisma } from '@prisma/client';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { PrismaService } from '../../../prisma/prisma.service';
import { parseTelegramPostUrl } from '../../../telegram/shared/telegram-post-url';
import { TelegramManagedPostsQueryDto } from './dto';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';
import { TelegramManagedPostSyntheticReadService } from './telegram-managed-post-synthetic-read.service';
import {
  telegramPostEngagementMetrics,
  telegramPostEngagementSelect,
  telegramPostTitle,
  telegramPostUrl,
  type TelegramPostEngagementRow,
} from './telegram-post-engagement';
import { managedPostNotFound } from './telegram-posts.errors';

type ManagedPostMemberRow = {
  id: string;
  role: string;
  telegramUsername: string | null;
  avatarIconId: string | null;
  avatarIcon: {
    id: string;
    type: 'emoji' | 'image';
    name: string;
    emoji: string | null;
    imageUrl: string | null;
  } | null;
  user: { id: string; name: string | null };
};
type ManagedPostReadRow = {
  [key: string]: unknown;
  id: string;
  workspaceId: string;
  telegramMessageIds: string[];
  telegramMessageUrls: string[];
  assignedMember: ManagedPostMemberRow | null;
};
type ManagedPostQueryChannel = {
  id: string;
  username: string | null;
  telegramChatId: string | null;
  currentSubscribersCount: number | null;
  ownViewsPerPost: number;
  ownReactionsPerPost: number;
  assignedMember: ManagedPostMemberRow | null;
};

@Injectable()
export class TelegramManagedPostQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: TelegramChannelsSupportService,
    private readonly catalog: TelegramChannelCatalogService,
    private readonly presentation: TelegramManagedPostGroupPresentationService,
    private readonly syntheticRead: TelegramManagedPostSyntheticReadService,
  ) {}

  private readonly iconSelect = {
    id: true,
    type: true,
    name: true,
    emoji: true,
    imageUrl: true,
  } as const;
  private readonly memberSummarySelect = {
    id: true,
    role: true,
    telegramUsername: true,
    avatarIconId: true,
    avatarIcon: { select: this.iconSelect },
    user: { select: { id: true, name: true } },
  } as const;
  private readonly managedPostInclude = {
    assignedMember: { select: this.memberSummarySelect },
    group: {
      select: {
        id: true,
        workspaceId: true,
        telegramChannelId: true,
        title: true,
        icon: true,
        isSystem: true,
        systemKey: true,
        statusNumberingEnabled: true,
        sidebarPosition: true,
      },
    },
  } as const;

  private statuses(query: TelegramManagedPostsQueryDto) {
    if (!query.status) return [];
    return (Array.isArray(query.status) ? query.status : [query.status]).filter(
      (status): status is TelegramManagedPostStatus =>
        Object.values(TelegramManagedPostStatus).includes(status),
    );
  }

  private managedWhere(
    workspaceId: string,
    channelId: string,
    query: TelegramManagedPostsQueryDto,
  ): Prisma.TelegramManagedPostWhereInput {
    const statuses = this.statuses(query);
    const search = query.search?.trim();
    return {
      workspaceId,
      telegramChannelId: channelId,
      ...(statuses.length ? { status: { in: statuses } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { text: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private linkedMessageIds(post: {
    telegramMessageIds: string[];
    telegramMessageUrls: string[];
  }) {
    return [
      ...new Set([
        ...post.telegramMessageIds,
        ...post.telegramMessageUrls.flatMap((url) => {
          const parsed = parseTelegramPostUrl(url);
          return parsed ? [parsed.messageId] : [];
        }),
      ]),
    ];
  }

  private async enrichManaged(
    posts: ManagedPostReadRow[],
    channel: ManagedPostQueryChannel,
  ) {
    const linkedIds = [
      ...new Set(posts.flatMap((post) => this.linkedMessageIds(post))),
    ];
    const telegramPosts = linkedIds.length
      ? ((await this.prisma.telegramPost.findMany({
          where: {
            workspaceId: posts[0]?.workspaceId,
            telegramChannelId: channel.id,
            telegramMessageId: { in: linkedIds },
          },
          select: telegramPostEngagementSelect,
        })) as TelegramPostEngagementRow[])
      : [];
    const byMessageId = new Map(
      telegramPosts.map((post) => [post.telegramMessageId, post]),
    );
    return posts.map((post) => {
      const linkedMessageIds = this.linkedMessageIds(post);
      return {
        ...post,
        readOnlyTelegramPost: false,
        primaryTelegramMessageUrl:
          post.telegramMessageUrls[0] ??
          (linkedMessageIds[0]
            ? telegramPostUrl(channel, linkedMessageIds[0])
            : null),
        engagementMetrics: linkedMessageIds.flatMap((messageId) => {
          const telegramPost = byMessageId.get(messageId);
          return telegramPost
            ? [telegramPostEngagementMetrics(telegramPost, channel)]
            : [];
        }),
      };
    });
  }

  private syntheticPost(
    workspaceId: string,
    channel: ManagedPostQueryChannel,
    member: ManagedPostMemberRow,
    post: TelegramPostEngagementRow,
  ) {
    const messageUrl = telegramPostUrl(channel, post.telegramMessageId);
    return {
      id: `telegram-post:${post.id}`,
      workspaceId,
      telegramChannelId: channel.id,
      origin: 'TELEGRAM' as const,
      readOnlyTelegramPost: true,
      telegramPostId: post.id,
      assignedMemberId: member.id,
      assignedMember: member,
      icon: null,
      groupId: null,
      groupPosition: null,
      statusPosition: null,
      sidebarPosition: null,
      group: null,
      title: telegramPostTitle(post),
      text: post.text || '',
      formattedText: post.formattedText,
      hasMedia: post.hasMedia,
      mediaKind: post.mediaKind,
      imageUrls: (post.imageUrls ?? []).filter((url) =>
        /^https?:\/\//i.test(url),
      ),
      buttonRows: [],
      status: TelegramManagedPostStatus.PUBLISHED,
      scheduledAt: null,
      scheduleMode: null,
      publishedAt: post.postDate,
      telegramScheduledMessageIds: [] as string[],
      telegramMessageIds: [post.telegramMessageId],
      telegramMessageUrls: messageUrl ? [messageUrl] : [],
      primaryTelegramMessageUrl: messageUrl,
      telegramIdVerificationStatus: 'VERIFIED' as const,
      telegramLinkSource: 'AUTO' as const,
      telegramIdVerifiedAt: post.updatedAt,
      telegramIdLastCheckedAt: post.updatedAt,
      telegramRemoteStatus: 'PUBLISHED' as const,
      lastTelegramSyncedAt: post.updatedAt,
      lastTelegramSyncNote: null,
      sourceType: null,
      sourceId: null,
      sourceWasPremium: null,
      captionLengthMaxUsed: null,
      messageLengthMaxUsed: null,
      publishMode: null,
      lastError: null,
      plannerFormatId: null,
      plannerSlotId: null,
      plannerRunId: null,
      plannerPlannedAt: null,
      plannerProvenance: null,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      engagementMetrics: [telegramPostEngagementMetrics(post, channel)],
    };
  }

  private async syntheticMember(
    userId: string,
    workspaceId: string,
    channel: ManagedPostQueryChannel,
  ): Promise<ManagedPostMemberRow> {
    return (
      channel.assignedMember ??
      (await this.prisma.workspaceMember.findFirst({
        where: { workspaceId, userId },
        select: this.memberSummarySelect,
      })) ?? {
        id: userId,
        role: 'admin',
        telegramUsername: null,
        avatarIconId: null,
        avatarIcon: null,
        user: { id: userId, name: 'Workspace member' },
      }
    );
  }

  async managedPosts(
    userId: string,
    channelId: string,
    query: TelegramManagedPostsQueryDto = {},
  ) {
    const workspaceId = await this.support.workspace(userId);
    const channel = (await this.catalog.findOne(
      userId,
      channelId,
    )) as unknown as ManagedPostQueryChannel;
    const pagination = normalizePagination(query);
    const where = this.managedWhere(workspaceId, channelId, query);
    const statuses = this.statuses(query);
    const includeSynthetic =
      !statuses.length ||
      statuses.includes(TelegramManagedPostStatus.PUBLISHED);
    const [syntheticTotal, managedTotal] = await Promise.all([
      includeSynthetic
        ? this.syntheticRead.count(workspaceId, channelId, query.search)
        : Promise.resolve(0),
      query.all
        ? Promise.resolve(null)
        : this.prisma.telegramManagedPost.count({ where }),
    ]);
    const managedTake = Math.min(
      pagination.take,
      Math.max(0, (managedTotal ?? 0) - pagination.skip),
    );
    const managedRows =
      !query.all && managedTake === 0
        ? []
        : await this.prisma.telegramManagedPost.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            ...(query.all ? {} : { skip: pagination.skip, take: managedTake }),
            include: this.managedPostInclude,
          });
    const resolvedManagedTotal = managedTotal ?? managedRows.length;
    const syntheticRows = includeSynthetic
      ? await this.syntheticRead.findPage(
          workspaceId,
          channelId,
          query.search,
          query.all ? 0 : Math.max(0, pagination.skip - resolvedManagedTotal),
          query.all
            ? syntheticTotal
            : Math.max(0, pagination.take - managedTake),
        )
      : [];
    const enriched = await this.enrichManaged(managedRows, channel);
    const member = syntheticRows.length
      ? await this.syntheticMember(userId, workspaceId, channel)
      : null;
    const items = [
      ...enriched,
      ...syntheticRows.map((post) =>
        this.syntheticPost(workspaceId, channel, member!, post),
      ),
    ];
    const totalItems = resolvedManagedTotal + syntheticTotal;
    return createPaginatedResponse(
      await this.presentation.attachManagedPostIcons(items),
      totalItems,
      query.all ? { page: 1, pageSize: Math.max(1, totalItems) } : pagination,
    );
  }

  async managedPost(userId: string, channelId: string, postId: string) {
    const workspaceId = await this.support.workspace(userId);
    const channel = (await this.catalog.findOne(
      userId,
      channelId,
    )) as unknown as ManagedPostQueryChannel;
    const managed = await this.prisma.telegramManagedPost.findFirst({
      where: { id: postId, workspaceId, telegramChannelId: channelId },
      include: this.managedPostInclude,
    });
    if (managed) {
      const [item] = await this.enrichManaged([managed], channel);
      const [presented] = await this.presentation.attachManagedPostIcons([
        item,
      ]);
      return presented;
    }
    if (!postId.startsWith('telegram-post:')) {
      throw managedPostNotFound();
    }
    const telegramPost = await this.syntheticRead.findOne(
      workspaceId,
      channelId,
      postId.slice('telegram-post:'.length),
    );
    if (!telegramPost) throw managedPostNotFound();
    const member = await this.syntheticMember(userId, workspaceId, channel);
    const [presented] = await this.presentation.attachManagedPostIcons([
      this.syntheticPost(workspaceId, channel, member, telegramPost),
    ]);
    return presented;
  }
}
