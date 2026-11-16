import { Injectable } from '@nestjs/common';
import { TelegramManagedPostStatus } from '@prisma/client';
import type {
  RescheduleChannelScheduledPostsResult,
  RescheduleChannelScheduledPostProgress,
} from '@telegram-system/shared';
import { normalizeTelegramPostMediaItems } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import { telegramChannelNotFound } from './telegram-posts.errors';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramManagedPostIdentityService } from './telegram-managed-post-identity.service';
import {
  markScheduledPostPublished,
  returnScheduledPostToDraft,
} from './telegram-managed-post-rescheduler.persistence';
import {
  loadTelegramPublishedHistory,
  loadTelegramScheduledQueues,
} from './telegram-managed-post-rescheduler.remote';

@Injectable()
export class TelegramManagedPostReschedulerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly support: TelegramChannelsSupportService,
    private readonly access: TelegramChannelAccessService,
    private readonly revisions: TelegramManagedPostRevisionStore,
    private readonly groups: TelegramPostGroupsService,
    private readonly publication: TelegramManagedPostPublicationService,
    private readonly identity: TelegramManagedPostIdentityService,
  ) {}

  async rescheduleChannelScheduledPosts(
    userId: string,
    channelId: string,
    onProgress?: (
      item: RescheduleChannelScheduledPostProgress,
      current: number,
      total: number,
    ) => void,
    postIds?: string[],
  ): Promise<RescheduleChannelScheduledPostsResult> {
    const workspaceId = await this.support.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      select: {
        id: true,
        username: true,
        telegramChatId: true,
        inviteLink: true,
        telegramAccessHash: true,
      },
    });
    if (!channel) throw telegramChannelNotFound();
    onProgress?.(
      {
        stage: 'LOADING_LOCAL_SCHEDULE',
        message:
          'Counting scheduled posts for this channel before checking Telegram.',
      },
      0,
      0,
    );
    const posts = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        status: TelegramManagedPostStatus.SCHEDULED,
        postBatchDelivery: { is: null },
        adSalePlacements: { none: {} },
        mutualPromotionDelivery: { is: null },
        ...(postIds ? { id: { in: postIds } } : {}),
      },
      orderBy: { scheduledAt: 'asc' },
    });
    const total = posts.length;
    let rescheduledCount = 0;
    let returnedToDraftCount = 0;
    let alreadyPublishedCount = 0;
    let locallyScheduledCount = 0;
    const failedPostIds: string[] = [];

    if (!total) {
      onProgress?.(
        { stage: 'RECONCILING_TELEGRAM', message: 'No scheduled posts found.' },
        0,
        0,
      );
      return {
        action: 'RESCHEDULE_CHANNEL_SCHEDULED_POSTS',
        channelId,
        rescheduledCount,
        returnedToDraftCount,
        alreadyPublishedCount,
        locallyScheduledCount,
        failedCount: 0,
        failedPostIds,
      };
    }

    const progressFor = (
      index: number,
      post: (typeof posts)[number],
      stage: RescheduleChannelScheduledPostProgress['stage'],
      message?: string,
    ) =>
      onProgress?.(
        {
          postId: post.id,
          title: post.title,
          scheduledAt: post.scheduledAt?.toISOString() ?? null,
          stage,
          ...(message ? { message } : {}),
        },
        index,
        total,
      );

    const channelReference = this.access.mtprotoChannelReference(channel);
    const { accountContexts, accountIds, remoteScheduledCount } =
      await loadTelegramScheduledQueues(
        { access: this.access, mtprotoClient: this.mtprotoClient },
        {
          workspaceId,
          channelId,
          channelReference,
          posts,
          total,
          onProgress,
        },
      );
    const now = new Date();
    const overduePosts = posts.filter(
      (post) => !post.scheduledAt || post.scheduledAt <= now,
    );
    onProgress?.(
      {
        stage: 'RECONCILING_TELEGRAM',
        message: `Telegram returned ${remoteScheduledCount} scheduled messages across ${accountIds.length} publishing accounts; checking ${overduePosts.length} overdue posts for publication.`,
      },
      0,
      total,
    );
    const { publishedByAccount, publishedHistoryErrors } =
      await loadTelegramPublishedHistory(
        { access: this.access, mtprotoClient: this.mtprotoClient },
        {
          channelReference,
          overduePosts,
          accountContexts,
          now,
          total,
          onProgress,
        },
      );
    for (const [index, post] of posts.entries()) {
      const current = index + 1;
      progressFor(index, post, 'RECONCILING_TELEGRAM');
      const scheduledAt = post.scheduledAt;
      const scheduledIds = post.telegramScheduledMessageIds ?? [];
      const future = Boolean(scheduledAt && scheduledAt > now);
      try {
        if (future && post.scheduleMode === 'LOCAL') {
          locallyScheduledCount += 1;
          progressFor(
            current,
            post,
            'LOCAL_SCHEDULE_PRESERVED',
            'This post uses the local scheduler and was left unchanged.',
          );
          continue;
        }
        const accountId = post.sourceId ?? '';
        const accountContext = accountContexts.get(accountId);
        if (post.scheduleMode !== 'LOCAL' && accountContext?.error) {
          failedPostIds.push(post.id);
          progressFor(
            current,
            post,
            'FAILED',
            `Could not confirm Telegram's current schedule: ${accountContext.error}. Post left unchanged.`,
          );
          continue;
        }
        const remoteScheduledIds =
          accountContext?.scheduledIds ?? new Set<string>();
        const remotePublished = publishedByAccount.get(accountId);
        const publishedById = new Map(
          (remotePublished?.published ?? []).map((message) => [
            message.id,
            message,
          ]),
        );
        const recentPublished = remotePublished?.recentPublished ?? [];
        if (!future) {
          const publishedHistoryError = publishedHistoryErrors.get(accountId);
          if (publishedHistoryError) {
            failedPostIds.push(post.id);
            progressFor(
              current,
              post,
              'FAILED',
              `Could not verify whether this post was published: ${publishedHistoryError}. Post left unchanged.`,
            );
            continue;
          }
          const expectedIds = scheduledIds;
          const exactPublished =
            expectedIds.length > 0 &&
            expectedIds.every((id) => publishedById.has(id));
          const matched = exactPublished
            ? {
                messageIds: expectedIds,
                matchedMessage: publishedById.get(expectedIds.at(-1)!)!,
              }
            : scheduledAt
              ? this.identity.findPublishedIdentity(
                  {
                    text: post.text,
                    imageCount: normalizeTelegramPostMediaItems(
                      post.mediaItems,
                      post.imageUrls,
                    ).length,
                    publishMode: post.publishMode,
                    scheduledAt,
                    origin: post.origin,
                  },
                  recentPublished,
                )
              : null;
          if (matched) {
            const remainingRemoteSchedule = scheduledIds.filter((id) =>
              remoteScheduledIds.has(id),
            );
            if (remainingRemoteSchedule.length) {
              const sourceAccount = await this.access.connectedAccount(
                workspaceId,
                channelId,
                post.sourceId ?? undefined,
              );
              await this.mtprotoClient.deleteScheduledPost({
                ...this.access.accountCredentials(sourceAccount),
                channel: channelReference,
                messageIds: remainingRemoteSchedule,
              });
            }
            await markScheduledPostPublished(
              {
                prisma: this.prisma,
                access: this.access,
                revisions: this.revisions,
                groups: this.groups,
              },
              workspaceId,
              channelId,
              post,
              channel,
              matched,
            );
            alreadyPublishedCount += 1;
            progressFor(
              current,
              post,
              'ALREADY_PUBLISHED',
              'Confirmed published in Telegram; left unchanged.',
            );
            continue;
          }
          if (!scheduledIds.length) {
            failedPostIds.push(post.id);
            progressFor(
              current,
              post,
              'FAILED',
              'No stored Telegram message IDs and no unique published match; left untouched to prevent an unsafe draft transition.',
            );
            continue;
          }
          progressFor(index, post, 'RETURNING_TO_DRAFT');
          const stillScheduledIds = scheduledIds.filter((id) =>
            remoteScheduledIds.has(id),
          );
          if (
            stillScheduledIds.length === scheduledIds.length &&
            scheduledIds.length &&
            post.origin !== 'TELEGRAM'
          ) {
            await this.publication.returnManagedPostToDraft(
              userId,
              channelId,
              post.id,
            );
          } else {
            if (stillScheduledIds.length) {
              const sourceAccount = await this.access.connectedAccount(
                workspaceId,
                channelId,
                post.sourceId ?? undefined,
              );
              await this.mtprotoClient.deleteScheduledPost({
                ...this.access.accountCredentials(sourceAccount),
                channel: channelReference,
                messageIds: stillScheduledIds,
              });
            }
            await returnScheduledPostToDraft(
              {
                prisma: this.prisma,
                access: this.access,
                revisions: this.revisions,
                groups: this.groups,
              },
              userId,
              workspaceId,
              channelId,
              post,
            );
          }
          returnedToDraftCount += 1;
          progressFor(current, post, 'DRAFTED');
          continue;
        }

        if (!scheduledIds.length) {
          failedPostIds.push(post.id);
          progressFor(
            current,
            post,
            'FAILED',
            'No stored Telegram scheduled-message IDs; left untouched to prevent a duplicate.',
          );
          continue;
        }
        if (
          scheduledIds.length &&
          !scheduledIds.every((id) => remoteScheduledIds.has(id))
        ) {
          failedPostIds.push(post.id);
          progressFor(
            current,
            post,
            'FAILED',
            'Telegram no longer confirms every stored scheduled message ID; left untouched to prevent a duplicate.',
          );
          continue;
        }
        await this.publication.publishManagedPost(
          workspaceId,
          channelId,
          post.id,
          scheduledAt!,
          'IMAGES_THEN_TEXT',
          userId,
          true,
          (stage) => progressFor(index, post, stage),
        );
        rescheduledCount += 1;
        progressFor(current, post, 'RESCHEDULED');
      } catch (error) {
        failedPostIds.push(post.id);
        progressFor(
          current,
          post,
          'FAILED',
          error instanceof Error ? error.message : 'Unknown error',
        );
      }
    }
    this.support.invalidateTelegramChannelReadCache(userId, workspaceId);
    return {
      action: 'RESCHEDULE_CHANNEL_SCHEDULED_POSTS',
      channelId,
      rescheduledCount,
      returnedToDraftCount,
      alreadyPublishedCount,
      locallyScheduledCount,
      failedCount: failedPostIds.length,
      failedPostIds,
    };
  }

  async listChannelRescheduleCandidates(userId: string, channelId: string) {
    const workspaceId = await this.support.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      select: { id: true },
    });
    if (!channel) throw telegramChannelNotFound();
    const posts = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        status: TelegramManagedPostStatus.SCHEDULED,
        postBatchDelivery: { is: null },
        adSalePlacements: { none: {} },
        mutualPromotionDelivery: { is: null },
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    return { channelId, postIds: posts.map(({ id }) => id) };
  }
}
