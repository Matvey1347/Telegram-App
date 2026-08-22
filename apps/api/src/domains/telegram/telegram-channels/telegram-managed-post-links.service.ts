import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostLinkSource,
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  buildStableTelegramPostUrl,
  parseTelegramPostUrl,
} from '../../../telegram/shared/telegram-post-url';
import { ManagedPostLinkTargetsQueryDto } from './dto';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';
import { TelegramManagedPostReconciliationService } from './telegram-managed-post-reconciliation.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from './telegram-post-groups.service';

@Injectable()
export class TelegramManagedPostLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramManagedPostRevisionStore: TelegramManagedPostRevisionStore,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
    private readonly telegramManagedPostGroupPresentationService: TelegramManagedPostGroupPresentationService,
    private readonly telegramPostGroupsService: TelegramPostGroupsService,
    private readonly telegramManagedPostReconciliationService: TelegramManagedPostReconciliationService,
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

  async setManagedPostTelegramUrl(
    userId: string,
    channelId: string,
    postId: string,
    telegramUrl: string,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const [post, channel] = await Promise.all([
      this.prisma.telegramManagedPost.findFirst({
        where: { id: postId, workspaceId, telegramChannelId: channelId },
        select: { id: true },
      }),
      this.prisma.telegramChannel.findFirst({
        where: { id: channelId, workspaceId },
      }),
    ]);
    if (!post || !channel)
      throw new NotFoundException('Managed post not found');
    const normalizedInput = telegramUrl.trim();
    const currentPost = await this.prisma.telegramManagedPost.findFirst({
      where: { id: postId, workspaceId, telegramChannelId: channelId },
    });
    if (!currentPost) throw new NotFoundException('Managed post not found');
    if (
      normalizedInput &&
      currentPost.status === TelegramManagedPostStatus.SCHEDULED
    ) {
      throw new BadRequestException(
        'Cancel or publish the scheduled Telegram post before attaching a manual link.',
      );
    }
    if (!normalizedInput) {
      const publishedPost = await this.prisma.$transaction(async (tx) => {
        await this.telegramManagedPostRevisionStore.createManagedPostRevision(
          tx,
          currentPost,
          'before_manual_link',
        );
        const updated = await tx.telegramManagedPost.update({
          where: { id: postId },
          data: {
            status: TelegramManagedPostStatus.DRAFT,
            telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
            telegramScheduledMessageIds: [],
            telegramMessageIds: [],
            telegramMessageUrls: [],
            telegramIdVerificationStatus:
              TelegramManagedPostIdVerificationStatus.UNVERIFIED,
            telegramLinkSource: TelegramManagedPostLinkSource.AUTO,
            telegramIdVerifiedAt: null,
            telegramIdLastCheckedAt: null,
            publishedAt: null,
            scheduledAt: null,
            sourceType: null,
            sourceId: null,
            publishMode: null,
            lastError: null,
            lastTelegramSyncedAt: new Date(),
            lastTelegramSyncNote:
              'Telegram link was removed manually. Post returned to draft.',
          },
          include: this.managedPostInclude,
        });
        if (currentPost.groupId) {
          await this.telegramPostGroupsService.normalizePostGroupNumbering(
            tx,
            currentPost.groupId,
          );
        }
        const canonical = await tx.telegramManagedPost.findUnique({
          where: { id: updated.id },
          include: this.managedPostInclude,
        });
        if (!canonical) throw new NotFoundException('Managed post not found');
        return canonical;
      });
      const [hydrated] =
        await this.telegramManagedPostGroupPresentationService.attachManagedPostIcons(
          [publishedPost],
        );
      return hydrated;
    }
    const parsed = parseTelegramPostUrl(normalizedInput);
    if (!parsed) {
      throw new BadRequestException('Enter a valid https://t.me/... post URL');
    }
    const channelUsername =
      this.telegramChannelsSupportService.normalizeUsername(channel.username);
    const channelChatId = this.telegramChannelsSupportService.normalizeChatId(
      channel.telegramChatId,
    );
    if (
      (parsed.kind === 'public' && parsed.username !== channelUsername) ||
      (parsed.kind === 'private' && parsed.chatId !== channelChatId)
    ) {
      throw new BadRequestException('Telegram link belongs to another channel');
    }
    const normalizedTelegramUrl = buildStableTelegramPostUrl({
      telegramChatId: channel.telegramChatId,
      messageId: parsed.messageId,
    });
    if (!normalizedTelegramUrl) {
      throw new BadRequestException(
        'Channel has no stable Telegram channel ID. Sync or re-import the channel first.',
      );
    }
    const linkedPost = await this.prisma.$transaction(async (tx) => {
      await this.telegramManagedPostRevisionStore.createManagedPostRevision(
        tx,
        currentPost,
        'before_manual_link',
      );
      const updated = await tx.telegramManagedPost.update({
        where: { id: postId },
        data: {
          status: TelegramManagedPostStatus.PUBLISHED,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.UNKNOWN,
          telegramScheduledMessageIds: [],
          telegramMessageIds: [parsed.messageId],
          telegramMessageUrls: [normalizedTelegramUrl],
          telegramIdVerificationStatus:
            TelegramManagedPostIdVerificationStatus.UNVERIFIED,
          telegramLinkSource: TelegramManagedPostLinkSource.MANUAL,
          telegramIdVerifiedAt: null,
          telegramIdLastCheckedAt: null,
          publishedAt:
            currentPost.publishedAt ?? currentPost.scheduledAt ?? new Date(),
          scheduledAt: null,
          lastError: null,
          lastTelegramSyncedAt: new Date(),
          lastTelegramSyncNote:
            'Telegram link was manually attached without remote sync.',
        },
        include: this.managedPostInclude,
      });
      if (currentPost.groupId) {
        await this.telegramPostGroupsService.normalizePostGroupNumbering(
          tx,
          currentPost.groupId,
        );
      }
      const canonical = await tx.telegramManagedPost.findUnique({
        where: { id: updated.id },
        include: this.managedPostInclude,
      });
      if (!canonical) throw new NotFoundException('Managed post not found');
      return canonical;
    });
    const [hydrated] =
      await this.telegramManagedPostGroupPresentationService.attachManagedPostIcons(
        [linkedPost],
      );
    return hydrated;
  }

  async managedPostLinkTargets(
    userId: string,
    channelId: string,
    query: ManagedPostLinkTargetsQueryDto,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, channelId);
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
    const search = query.search?.trim();
    const scheduledBefore =
      query.usage === 'schedule' && query.scheduledAt
        ? new Date(query.scheduledAt)
        : null;
    const editingTargets = query.usage === 'edit';
    const posts = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        ...(editingTargets
          ? {}
          : {
              lastError: null,
              OR: [
                {
                  status: TelegramManagedPostStatus.PUBLISHED,
                  telegramRemoteStatus:
                    TelegramManagedPostRemoteStatus.PUBLISHED,
                  telegramIdVerificationStatus:
                    TelegramManagedPostIdVerificationStatus.VERIFIED,
                  telegramMessageIds: { isEmpty: false },
                },
                ...(scheduledBefore
                  ? [
                      {
                        status: TelegramManagedPostStatus.SCHEDULED,
                        telegramRemoteStatus:
                          TelegramManagedPostRemoteStatus.SCHEDULED,
                        scheduledAt: { lt: scheduledBefore },
                        telegramScheduledMessageIds: { isEmpty: false },
                      },
                    ]
                  : []),
              ],
            }),
        ...(query.groupId ? { groupId: query.groupId } : {}),
        ...(query.excludePostId ? { id: { not: query.excludePostId } } : {}),
        ...(search
          ? { title: { contains: search, mode: Prisma.QueryMode.insensitive } }
          : {}),
      },
      select: {
        id: true,
        workspaceId: true,
        title: true,
        icon: true,
        status: true,
        telegramRemoteStatus: true,
        lastError: true,
        groupId: true,
        publishedAt: true,
        scheduledAt: true,
        imageUrls: true,
        telegramMessageIds: true,
        telegramMessageUrls: true,
        telegramIdVerificationStatus: true,
        telegramChannelId: true,
        group: { select: { title: true } },
        telegramChannel: {
          select: { title: true, username: true, telegramChatId: true },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { title: 'asc' }],
      take: query.limit ?? 30,
    });
    return (
      await this.telegramManagedPostGroupPresentationService.attachManagedPostIcons(
        posts,
      )
    ).map((post) => {
      const primaryId =
        this.telegramChannelAccessService.primaryTelegramMessageId({
          messageIds: post.telegramMessageIds,
          imageCount: post.imageUrls.length,
        });
      const primaryTelegramMessageUrl = primaryId
        ? this.telegramChannelAccessService.telegramMessageUrl(
            post.telegramChannel,
            primaryId,
          )
        : null;
      return {
        id: post.id,
        title: post.title,
        icon: post.icon,
        iconPresentation: post.iconPresentation,
        status: post.status,
        telegramRemoteStatus: post.telegramRemoteStatus,
        telegramIdVerificationStatus: post.telegramIdVerificationStatus,
        groupId: post.groupId,
        groupTitle: post.group?.title ?? null,
        telegramChannelId: post.telegramChannelId,
        telegramChannelTitle: post.telegramChannel.title,
        publishedAt: post.publishedAt,
        primaryTelegramMessageUrl:
          post.telegramMessageUrls[0] ?? primaryTelegramMessageUrl,
      };
    });
  }
}
