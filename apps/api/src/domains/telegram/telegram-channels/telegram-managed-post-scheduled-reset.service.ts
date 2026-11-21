import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  RescheduleChannelScheduledPostsResult,
  RescheduleChannelScheduledPostProgress,
  ResetChannelScheduledPostsResult,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import { telegramChannelNotFound } from './telegram-posts.errors';
import { ordinaryScheduledPostWhere } from './telegram-managed-post-rescheduler-repair';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramManagedPostReschedulerService } from './telegram-managed-post-rescheduler.service';

@Injectable()
export class TelegramManagedPostScheduledResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: TelegramChannelsSupportService,
    private readonly revisions: TelegramManagedPostRevisionStore,
    private readonly groups: TelegramPostGroupsService,
    private readonly publication: TelegramManagedPostPublicationService,
    private readonly rescheduler: TelegramManagedPostReschedulerService,
  ) {}

  rescheduleChannelScheduledPosts(
    userId: string,
    channelId: string,
    onProgress?: (
      item: RescheduleChannelScheduledPostProgress,
      current: number,
      total: number,
    ) => void,
    postIds?: string[],
  ): Promise<RescheduleChannelScheduledPostsResult> {
    return this.rescheduler.rescheduleChannelScheduledPosts(
      userId,
      channelId,
      onProgress,
      postIds,
    );
  }

  listChannelRescheduleCandidates(userId: string, channelId: string) {
    return this.rescheduler.listChannelRescheduleCandidates(userId, channelId);
  }

  async resetChannelScheduledPosts(
    userId: string,
    channelId: string,
    postIds: string[] = [],
  ): Promise<ResetChannelScheduledPostsResult> {
    const workspaceId = await this.support.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      select: { id: true },
    });
    if (!channel) throw telegramChannelNotFound();
    const selected = [...new Set(postIds)];
    const eligible: Prisma.TelegramManagedPostWhereInput = {
      ...ordinaryScheduledPostWhere(workspaceId, channelId),
      origin: 'SYSTEM',
      remoteImportKey: null,
      telegramLinkSource: 'AUTO',
      telegramPostId: null,
      telegramMessageIds: { isEmpty: true },
      deliveryAttemptCount: 0,
      sendOperations: { none: {} },
      OR: [
        { nativeRecovery: { is: null } },
        { scheduleMode: 'TELEGRAM_NATIVE', nativeRecovery: { is: { status: 'ACKED' } } },
      ],
    };
    const posts = selected.length
      ? await this.prisma.telegramManagedPost.findMany({
          where: { ...eligible, id: { in: selected } },
          include: { telegramChannel: true },
        })
      : [];
    const byId = new Map(posts.map((post) => [post.id, post]));
    const result: ResetChannelScheduledPostsResult = {
      action: 'RESET_CHANNEL_SCHEDULED_TO_DRAFT',
      channelId,
      remoteScheduledDeletedCount: 0,
      postsReturnedToDraftCount: 0,
      postIds: [],
      results: [],
    };
    for (const postId of selected) {
      const post = byId.get(postId);
      const localOnly = post?.scheduleMode === 'LOCAL' && post.telegramRemoteStatus === 'NONE' &&
        !post.telegramScheduledMessageIds.length && !post.deliveryClaimOwner;
      const native = post?.scheduleMode === 'TELEGRAM_NATIVE' && post.telegramRemoteStatus === 'SCHEDULED' &&
        post.telegramScheduledMessageIds.length > 0 &&
        (!post.deliveryClaimOwner || post.deliveryClaimOwner.startsWith('native-cancel-acked:'));
      if (!post || (!localOnly && !native)) {
        result.results.push({ postId, status: 'SKIPPED', reason: 'Not an eligible ordinary schedule', remoteDeletedCount: 0 });
        continue;
      }
      let remoteDeletedCount = 0;
      try {
        const owner = native ? await this.publication.cancelScheduledManagedPost(workspaceId, post) : null;
        if (native && !owner) throw new Error('Telegram cancellation was not acknowledged');
        remoteDeletedCount = owner && owner !== post.deliveryClaimOwner ? post.telegramScheduledMessageIds.length : 0;
        result.remoteScheduledDeletedCount += remoteDeletedCount;
        await this.prisma.$transaction(async (tx) => {
          const updated = await tx.telegramManagedPost.updateMany({
            where: {
              ...eligible,
              id: postId,
              ...(owner ? {} : { updatedAt: post.updatedAt }),
              scheduleMode: post.scheduleMode,
              scheduledAt: post.scheduledAt,
              sourceId: post.sourceId,
              sourceType: post.sourceType,
              telegramScheduledMessageIds: { equals: post.telegramScheduledMessageIds },
              deliveryClaimOwner: owner,
            },
            data: {
              status: 'DRAFT',
              scheduledAt: null,
              scheduleMode: null,
              publicationSlotId: null,
              telegramScheduledMessageIds: [],
              telegramRemoteStatus: 'NONE',
              deliveryClaimOwner: null,
              deliveryClaimExpiresAt: null,
              deliveryNextAttemptAt: null,
              sourceId: null,
              sourceType: null,
              publishMode: null,
              lastError: null,
              lastTelegramSyncNote: owner ? 'Telegram cancellation acknowledged.' : 'Local schedule cleared.',
            },
          });
          if (updated.count !== 1) throw new Error('The schedule changed before reset; reconcile before retrying');
          await this.revisions.createManagedPostRevisions(tx, [post], 'before_channel_scheduled_reset', userId);
          if (post.groupId) await this.groups.normalizePostGroupNumbering(tx, post.groupId);
        });
        result.postIds.push(postId);
        result.postsReturnedToDraftCount += 1;
        result.results.push({ postId, status: 'DRAFTED', remoteDeletedCount });
      } catch (error) {
        result.results.push({
          postId,
          status: 'FAILED',
          reason: error instanceof Error ? error.message : 'Could not reset the schedule',
          remoteDeletedCount,
        });
      }
    }
    if (selected.length) this.support.invalidateTelegramChannelReadCache(userId, workspaceId);
    return result;
  }
}
