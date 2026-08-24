import { Injectable, NotFoundException } from '@nestjs/common';
import { TelegramManagedPostStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';
import { TelegramManagedPostIdentityService } from './telegram-managed-post-identity.service';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';

@Injectable()
export class TelegramManagedPostReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly identityService: TelegramManagedPostIdentityService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
    private readonly telegramManagedPostGroupPresentationService: TelegramManagedPostGroupPresentationService,
    private readonly telegramManagedPostPublicationService: TelegramManagedPostPublicationService,
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

  async reconcileDueManagedPosts(workspaceId: string, channelId?: string) {
    return this.reconcileManagedPostIdentities({ workspaceId, channelId });
  }

  async reconcileAllDueManagedPosts() {
    const localDelivery = await this.publishDueLocallyScheduledManagedPosts();
    const identity = await this.identityService.reconcilePendingWorkspaces((workspaceId) =>
      this.reconcileDueManagedPosts(workspaceId),
    );
    return { ...identity, localDelivery };
  }

  public async publishDueLocallyScheduledManagedPosts() {
    const duePosts = await this.prisma.telegramManagedPost.findMany({
      where: {
        status: TelegramManagedPostStatus.SCHEDULED,
        scheduleMode: 'LOCAL',
        scheduledAt: { lte: new Date() },
      },
      select: { id: true, workspaceId: true, telegramChannelId: true },
      orderBy: { scheduledAt: 'asc' },
      take: 25,
    });
    let published = 0;
    let failed = 0;
    for (const due of duePosts) {
      const claim = await this.prisma.telegramManagedPost.updateMany({
        where: {
          id: due.id,
          status: TelegramManagedPostStatus.SCHEDULED,
          scheduleMode: 'LOCAL',
          scheduledAt: { lte: new Date() },
        },
        data: { status: TelegramManagedPostStatus.PUBLISHING },
      });
      if (claim.count) {
        try {
          await this.telegramManagedPostPublicationService.publishManagedPost(
            due.workspaceId,
            due.telegramChannelId,
            due.id,
          );
          published += 1;
        } catch {
          // The publisher persists the post-level FAILED state and message.
          // Continue so one broken bot or post cannot block the remaining due queue.
          failed += 1;
        }
      }
    }
    return { considered: duePosts.length, published, failed };
  }

  public async reconcileManagedPostIdentities(params: {
    workspaceId: string;
    channelId?: string;
    postId?: string;
    explicit?: boolean;
    publishedOnly?: boolean;
  }) {
    return this.identityService.reconcile({
      ...params,
      loadRemote: async (channelId, posts) => {
        const account =
          await this.telegramChannelAccessService.connectedAccount(
            params.workspaceId,
            channelId,
          );
        const channelReference =
          this.telegramChannelAccessService.mtprotoChannelReference(
            posts[0].telegramChannel,
          );
        return this.mtprotoClient.getManagedPostMessages({
          ...this.telegramChannelAccessService.accountCredentials(account),
          channel: channelReference,
          publishedMessageIds: posts.flatMap((post) =>
            post.status === 'PUBLISHED' ? post.telegramMessageIds : [],
          ),
          scheduledMessageIds: posts.flatMap(
            (post) => post.telegramScheduledMessageIds,
          ),
        });
      },
      repairDependants: (workspaceId, channelId, postId, publishedAt) =>
        this.repairScheduledPostDependants(
          workspaceId,
          channelId,
          postId,
          publishedAt,
        ),
    });
  }

  async verifyManagedPostTelegramId(
    userId: string,
    channelId: string,
    postId: string,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.reconcileManagedPostIdentities({
      workspaceId,
      channelId,
      postId,
      explicit: true,
    });
    this.telegramChannelsSupportService.invalidateTelegramChannelReadCache(
      userId,
      workspaceId,
    );
    const updated = await this.prisma.telegramManagedPost.findFirst({
      where: { id: postId, workspaceId, telegramChannelId: channelId },
      include: this.managedPostInclude,
    });
    if (!updated) throw new NotFoundException('Managed post not found');
    const [hydrated] =
      await this.telegramManagedPostGroupPresentationService.attachManagedPostIcons(
        [updated],
      );
    return hydrated;
  }

  async verifyManagedPostTelegramIds(userId: string, channelId: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    const total = await this.identityService.reconcilePublishedChannel(() =>
      this.reconcileManagedPostIdentities({
        workspaceId,
        channelId,
        explicit: true,
        publishedOnly: true,
      }),
    );
    this.telegramChannelsSupportService.invalidateTelegramChannelReadCache(
      userId,
      workspaceId,
    );
    return total;
  }

  public async repairScheduledPostDependants(
    workspaceId: string,
    channelId: string,
    targetPostId: string,
    publishedAt: Date,
  ) {
    await this.identityService.repairDependants({
      workspaceId,
      channelId,
      targetPostId,
      publishedAt,
      reschedule: (dependant) =>
        this.telegramManagedPostPublicationService.publishManagedPost(
          workspaceId,
          channelId,
          dependant.id,
          dependant.scheduledAt,
          dependant.publishMode === 'CAPTION_THEN_TEXT'
            ? 'CAPTION_THEN_TEXT'
            : 'IMAGES_THEN_TEXT',
        ),
    });
  }
}
