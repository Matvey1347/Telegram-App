import { Injectable } from '@nestjs/common';
import { ResponseCacheService } from '../../../common/response-cache.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelSchemaCompatibilityService } from './telegram-channel-schema-compatibility.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramManagedPostAutoRepairService } from './telegram-managed-post-auto-repair.service';
import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';
import { TelegramManagedPostReconciliationService } from './telegram-managed-post-reconciliation.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import { parseTelegramPostUrl } from '../../../telegram/shared/telegram-post-url';
import {
  telegramPostEngagementMetrics,
  telegramPostEngagementSelect,
  telegramPostTitle,
  telegramPostUrl,
  type TelegramPostEngagementRow,
} from './telegram-post-engagement';

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
  workspaceId: string;
  telegramMessageIds: string[];
  telegramMessageUrls: string[];
  icon: string | null;
  buttonRows: unknown;
  assignedMember: ManagedPostMemberRow | null;
  group: {
    icon: string | null;
    isSystem: boolean;
    systemKey: string | null;
    title: string;
    [key: string]: unknown;
  } | null;
};

type ManagedPostQueryChannel = {
  id: string;
  username: string | null;
  telegramChatId: string | null;
  inviteLink?: string | null;
  telegramAccessHash?: string | null;
  currentSubscribersCount: number | null;
  ownViewsPerPost: number;
  ownReactionsPerPost: number;
  assignedMember: ManagedPostMemberRow | null;
};

@Injectable()
export class TelegramManagedPostQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly responseCache: ResponseCacheService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelSchemaCompatibilityService: TelegramChannelSchemaCompatibilityService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramManagedPostRevisionStore: TelegramManagedPostRevisionStore,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
    private readonly telegramManagedPostGroupPresentationService: TelegramManagedPostGroupPresentationService,
    private readonly telegramPostGroupsService: TelegramPostGroupsService,
    private readonly telegramManagedPostReconciliationService: TelegramManagedPostReconciliationService,
    private readonly telegramManagedPostAutoRepairService: TelegramManagedPostAutoRepairService,
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

  private async loadManagedPosts(
    workspaceId: string,
    channelId: string,
  ): Promise<ManagedPostReadRow[]> {
    return this.prisma.telegramManagedPost.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: this.managedPostInclude,
    });
  }

  private linkedTelegramMessageIds(post: {
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

  async managedPosts(userId: string, channelId: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const channel = (await this.telegramChannelCatalogService.findOne(
      userId,
      channelId,
    )) as unknown as ManagedPostQueryChannel;
    try {
      const reconciliation =
        await this.telegramManagedPostReconciliationService.reconcileDueManagedPosts(
          workspaceId,
          channelId,
        );
      if (reconciliation.checked) {
        this.telegramChannelsSupportService.invalidateTelegramChannelReadCache(
          userId,
          workspaceId,
        );
      }
      await this.telegramManagedPostAutoRepairService.autoRepairImportedManagedPostsOnRead(
        {
          workspaceId,
          channelId,
          channel,
        },
      );
      await this.telegramPostGroupsService.normalizeChannelPostGroupNumberingOnRead(
        workspaceId,
        channelId,
      );
    } catch (error) {
      if (
        !this.telegramChannelSchemaCompatibilityService.isMissingTelegramManagedPostOriginColumns(
          error,
        )
      )
        throw error;
      await this.telegramChannelSchemaCompatibilityService.ensureTelegramManagedPostOriginColumnsAvailable();
      const reconciliation =
        await this.telegramManagedPostReconciliationService.reconcileDueManagedPosts(
          workspaceId,
          channelId,
        );
      if (reconciliation.checked) {
        this.telegramChannelsSupportService.invalidateTelegramChannelReadCache(
          userId,
          workspaceId,
        );
      }
      await this.telegramManagedPostAutoRepairService.autoRepairImportedManagedPostsOnRead(
        {
          workspaceId,
          channelId,
          channel,
        },
      );
      await this.telegramPostGroupsService.normalizeChannelPostGroupNumberingOnRead(
        workspaceId,
        channelId,
      );
    }

    let managedPosts: ManagedPostReadRow[];
    try {
      managedPosts = await this.loadManagedPosts(workspaceId, channelId);
    } catch (error) {
      if (
        !this.telegramChannelSchemaCompatibilityService.isMissingTelegramManagedPostOriginColumns(
          error,
        )
      ) {
        throw error;
      }
      await this.telegramChannelSchemaCompatibilityService.ensureTelegramManagedPostOriginColumnsAvailable();
      managedPosts = await this.loadManagedPosts(workspaceId, channelId);
    }

    const telegramPosts = (await this.prisma.telegramPost.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      select: telegramPostEngagementSelect,
      orderBy: [{ postDate: 'desc' }, { id: 'desc' }],
    })) as TelegramPostEngagementRow[];
    const telegramPostByMessageId = new Map(
      telegramPosts.map((post) => [post.telegramMessageId, post]),
    );
    const matchedTelegramPostIds = new Set<string>();
    const enrichedManagedPosts = managedPosts.map((post) => {
      const linkedMessageIds = this.linkedTelegramMessageIds(post);
      const engagementMetrics = linkedMessageIds.flatMap((messageId) => {
        const telegramPost = telegramPostByMessageId.get(messageId);
        if (!telegramPost || matchedTelegramPostIds.has(telegramPost.id)) {
          return [];
        }
        matchedTelegramPostIds.add(telegramPost.id);
        return [telegramPostEngagementMetrics(telegramPost, channel)];
      });
      const primaryTelegramMessageUrl =
        post.telegramMessageUrls[0] ??
        (linkedMessageIds[0]
          ? telegramPostUrl(channel, linkedMessageIds[0])
          : null);
      return {
        ...post,
        readOnlyTelegramPost: false,
        primaryTelegramMessageUrl,
        engagementMetrics,
      };
    });
    const remainingTelegramPosts = telegramPosts.filter(
      (post) => !matchedTelegramPostIds.has(post.id),
    );

    let assignedMember = channel.assignedMember;
    if (remainingTelegramPosts.length && !assignedMember) {
      assignedMember = await this.prisma.workspaceMember.findFirst({
        where: { workspaceId, userId },
        select: this.memberSummarySelect,
      });
    }

    const syntheticPosts = remainingTelegramPosts.map((post) => {
      const messageUrl = telegramPostUrl(channel, post.telegramMessageId);
      return {
        id: `telegram-post:${post.id}`,
        workspaceId,
        telegramChannelId: channelId,
        origin: 'TELEGRAM' as const,
        readOnlyTelegramPost: true,
        telegramPostId: post.id,
        assignedMemberId: assignedMember?.id ?? userId,
        assignedMember: assignedMember ?? {
          id: userId,
          role: 'admin' as const,
          telegramUsername: null,
          avatarIconId: null,
          avatarIcon: null,
          user: { id: userId, name: 'Workspace member' },
        },
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
        status: 'PUBLISHED' as const,
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
    });

    return this.telegramManagedPostGroupPresentationService.attachManagedPostIcons(
      [...enrichedManagedPosts, ...syntheticPosts],
    );
  }
}
