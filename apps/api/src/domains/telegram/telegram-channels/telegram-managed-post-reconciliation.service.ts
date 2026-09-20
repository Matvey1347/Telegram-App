import { Injectable } from '@nestjs/common';
import { TelegramManagedPostStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';
import { TelegramManagedPostIdentityService } from './telegram-managed-post-identity.service';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramManagedPostRemoteDeletionService } from './telegram-managed-post-remote-deletion.service';
import { MANAGED_POST_LOCAL_PUBLISHING_STALE_MS } from '../../operations/scheduled-tasks/due-work-predicates';
import { managedPostNotFound } from './telegram-posts.errors';

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
    private readonly telegramManagedPostRemoteDeletionService: TelegramManagedPostRemoteDeletionService,
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
    const identity = await this.identityService.reconcilePendingWorkspaces(
      (workspaceId) => this.reconcileDueManagedPosts(workspaceId),
    );
    const autoDeletion = await this.deleteDueManagedPosts();
    return { ...identity, localDelivery, autoDeletion };
  }

  private async deleteDueManagedPosts() {
    const now = new Date();
    const awaitingDeadline = await this.prisma.telegramManagedPost.findMany({
      where: {
        status: TelegramManagedPostStatus.PUBLISHED,
        deleteAfterHours: { not: null },
        deleteAt: null,
      },
      select: { id: true, publishedAt: true, deleteAfterHours: true },
      take: 100,
    });
    await Promise.all(
      awaitingDeadline.map((post) =>
        post.publishedAt && post.deleteAfterHours
          ? this.prisma.telegramManagedPost.updateMany({
              where: {
                id: post.id,
                status: TelegramManagedPostStatus.PUBLISHED,
                deleteAt: null,
              },
              data: {
                deleteAt: new Date(
                  post.publishedAt.getTime() + post.deleteAfterHours * 3_600_000,
                ),
              },
            })
          : Promise.resolve(),
      ),
    );
    const due = await this.prisma.telegramManagedPost.findMany({
      where: {
        status: TelegramManagedPostStatus.PUBLISHED,
        deleteAt: { lte: now },
        telegramRemoteStatus: { not: 'AUTO_DELETED' },
      },
      select: { id: true, workspaceId: true },
      orderBy: [{ deleteAt: 'asc' }, { id: 'asc' }],
      take: 50,
    });
    const byWorkspace = new Map<string, string[]>();
    due.forEach((post) => {
      const ids = byWorkspace.get(post.workspaceId) ?? [];
      ids.push(post.id);
      byWorkspace.set(post.workspaceId, ids);
    });
    let deleted = 0;
    let failed = 0;
    for (const [workspaceId, managedPostIds] of byWorkspace) {
      try {
        const result =
          await this.telegramManagedPostRemoteDeletionService.deletePublishedManagedPosts({
            workspaceId,
            managedPostIds,
          });
        deleted += result.deleted;
        failed += result.failed;
      } catch {
        failed += managedPostIds.length;
      }
    }
    return { considered: due.length, deleted, failed };
  }

  public async publishDueLocallyScheduledManagedPosts() {
    const now = new Date();
    const stalePublishingCutoff = new Date(
      now.getTime() - MANAGED_POST_LOCAL_PUBLISHING_STALE_MS,
    );
    const duePosts = await this.prisma.telegramManagedPost.findMany({
      where: {
        scheduleMode: 'LOCAL',
        OR: [
          {
            status: TelegramManagedPostStatus.SCHEDULED,
            scheduledAt: { lte: now },
          },
          {
            status: TelegramManagedPostStatus.PUBLISHING,
            updatedAt: { lte: stalePublishingCutoff },
          },
        ],
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
          scheduleMode: 'LOCAL',
          OR: [
            {
              status: TelegramManagedPostStatus.SCHEDULED,
              scheduledAt: { lte: new Date() },
            },
            {
              status: TelegramManagedPostStatus.PUBLISHING,
              updatedAt: { lte: stalePublishingCutoff },
            },
          ],
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
        const scheduledMessageIds = posts.flatMap(
          (post) => post.telegramScheduledMessageIds,
        );
        const scheduledDates = posts
          .map((post) => post.scheduledAt)
          .filter((value): value is Date => value instanceof Date);
        const publicationMatchMarginMs = posts.some(
          (post) => post.origin === 'TELEGRAM',
        )
          ? 24 * 60 * 60_000
          : 6 * 60 * 60_000;
        const earliestScheduledAt = scheduledDates.length
          ? new Date(
              Math.min(...scheduledDates.map((value) => value.getTime())) -
                publicationMatchMarginMs,
            )
          : undefined;
        const latestScheduledAt = scheduledDates.length
          ? new Date(
              Math.max(...scheduledDates.map((value) => value.getTime())) +
                publicationMatchMarginMs,
            )
          : undefined;
        const remote = await this.mtprotoClient.getManagedPostMessages({
          ...this.telegramChannelAccessService.accountCredentials(account),
          channel: channelReference,
          publishedMessageIds: posts.flatMap((post) =>
            post.status === 'PUBLISHED'
              ? post.telegramMessageIds
              : post.telegramScheduledMessageIds,
          ),
          scheduledMessageIds,
          recentPublishedFrom: earliestScheduledAt,
          recentPublishedUntil: latestScheduledAt,
        });
        if (!earliestScheduledAt || !latestScheduledAt) return remote;
        const synchronized = await this.prisma.telegramPost.findMany({
          where: {
            workspaceId: params.workspaceId,
            telegramChannelId: channelId,
            postDate: {
              gte: earliestScheduledAt,
              lte: latestScheduledAt,
            },
          },
          orderBy: [{ postDate: 'asc' }, { telegramMessageId: 'asc' }],
          take: 500,
          select: {
            telegramMessageId: true,
            text: true,
            formattedText: true,
            postDate: true,
            hasMedia: true,
            rawMessage: true,
          },
        });
        const synchronizedMessages = synchronized.map((message) => ({
          id: message.telegramMessageId,
          text: message.text ?? '',
          html: message.formattedText ?? undefined,
          date: message.postDate.toISOString(),
          hasMedia: message.hasMedia,
          groupedId:
            message.rawMessage &&
            typeof message.rawMessage === 'object' &&
            'groupedId' in message.rawMessage
              ? String(message.rawMessage.groupedId ?? '') || null
              : null,
        }));
        const recentPublished = new Map(
          [...remote.recentPublished, ...synchronizedMessages].map(
            (message) => [message.id, message] as const,
          ),
        );
        return { ...remote, recentPublished: [...recentPublished.values()] };
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
    if (!updated) throw managedPostNotFound();
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
