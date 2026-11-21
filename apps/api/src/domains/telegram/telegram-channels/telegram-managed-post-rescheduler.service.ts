import { recoverAcknowledgedNativeReplacement } from './telegram-managed-post-native-replacement';
import { randomUUID } from 'node:crypto';
import {
  assertMissingNativeScheduleRepairable,
  assertExistingNativeScheduleIdentity,
  nativeScheduleContentMatches,
  historyCandidatesForReschedule,
  overlappingNativeSchedules,
  requestedRescheduleOutcomes,
  ordinaryScheduledPostWhere,
  preservedScheduleStage,
} from './telegram-managed-post-rescheduler-repair';
import { Injectable } from '@nestjs/common';
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
  rescheduleContext,
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
    postIds = postIds ? [...new Set(postIds)] : undefined;
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
      where: ordinaryScheduledPostWhere(workspaceId, channelId, postIds),
      orderBy: { scheduledAt: 'asc' },
    });
    const results = await requestedRescheduleOutcomes(
      this.prisma,
      workspaceId,
      channelId,
      posts,
      postIds,
    );
    const failedPostIds = results
      .filter((item) => item.stage === 'FAILED')
      .map((item) => item.postId!);
    const ineligibleCount = results.length;
    const total = posts.length + ineligibleCount;
    let rescheduledCount = 0;
    let returnedToDraftCount = results.filter(
      (item) => item.stage === 'DRAFTED',
    ).length;
    let alreadyPublishedCount = results.filter(
      (item) => item.stage === 'ALREADY_PUBLISHED',
    ).length;
    let locallyScheduledCount = 0;
    let nativelyScheduledCount = 0;
    const result = (): RescheduleChannelScheduledPostsResult => ({
      action: 'RESCHEDULE_CHANNEL_SCHEDULED_POSTS',
      channelId,
      rescheduledCount,
      returnedToDraftCount,
      alreadyPublishedCount,
      locallyScheduledCount,
      nativelyScheduledCount,
      failedCount: failedPostIds.length,
      failedPostIds,
      results,
    });
    results.forEach((item, index) => onProgress?.(item, index + 1, total));

    if (!posts.length) {
      onProgress?.(
        { stage: 'RECONCILING_TELEGRAM', message: 'No scheduled posts found.' },
        0,
        0,
      );
      return result();
    }

    const progressFor = (
      index: number,
      post: (typeof posts)[number],
      stage: RescheduleChannelScheduledPostProgress['stage'],
      message?: string,
    ) => {
      const item = {
        postId: post.id,
        title: post.title,
        scheduledAt: post.scheduledAt?.toISOString() ?? null,
        stage,
        ...(message ? { message } : {}),
      };
      if (
        [
          'FAILED',
          'RESCHEDULED',
          'DRAFTED',
          'ALREADY_PUBLISHED',
          'LOCAL_SCHEDULE_PRESERVED',
          'NATIVE_SCHEDULE_PRESERVED',
        ].includes(stage)
      )
        results.push(item);
      onProgress?.(item, index + ineligibleCount, total);
    };

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
    const overduePosts = historyCandidatesForReschedule(
      posts,
      accountContexts,
      now,
    );
    const claimedRemoteIds = posts.flatMap(
      (post) => post.telegramScheduledMessageIds,
    );
    const foreignSchedules = claimedRemoteIds.length
      ? await this.prisma.telegramManagedPost.findMany({
          where: {
            workspaceId,
            telegramChannelId: channelId,
            id: { notIn: posts.map((post) => post.id) },
            status: { in: ['SCHEDULED', 'PUBLISHING'] },
            telegramScheduledMessageIds: { hasSome: claimedRemoteIds },
          },
          select: {
            id: true,
            scheduleMode: true,
            telegramScheduledMessageIds: true,
          },
        })
      : [];
    const overlapping = overlappingNativeSchedules([
      ...posts,
      ...foreignSchedules,
    ]);
    onProgress?.(
      {
        stage: 'RECONCILING_TELEGRAM',
        message: `Telegram returned ${remoteScheduledCount} scheduled messages across ${accountIds.length} publishing accounts; checking ${overduePosts.length} posts for publication.`,
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
      const accountId = post.sourceId ?? '';
      const accountContext = accountContexts.get(accountId);
      const overlap = overlapping.has(post.id);
      const preserved =
        post.scheduleMode === 'LOCAL'
          ? preservedScheduleStage(post, accountContext, overlap)
          : undefined;
      const knownNativeIdentity =
        !overlap &&
        (nativeScheduleContentMatches(
          post,
          accountContext?.scheduledMessages,
        ) ||
          nativeScheduleContentMatches(
            post,
            accountContext?.confirmationOnlyScheduledMessages,
          ));
      if (preserved) {
        if (preserved === 'LOCAL_SCHEDULE_PRESERVED')
          locallyScheduledCount += 1;
        else nativelyScheduledCount += 1;
        progressFor(current, post, preserved);
        continue;
      }
      const owner = `reschedule:${randomUUID()}`;
      let claimed = false;
      let uncertain = false;
      try {
        assertExistingNativeScheduleIdentity(post, accountContext);
        if (overlap)
          throw new Error(
            'Stored native schedule IDs overlap another candidate; reconcile identity before retrying.',
          );
        const admission = await this.prisma.telegramManagedPost.updateMany({
          where: {
            id: post.id,
            ...ordinaryScheduledPostWhere(workspaceId, channelId),
            updatedAt: post.updatedAt,
            sendOperations: { none: { status: { in: ['STARTED', 'UNKNOWN'] } } },
            AND: [{ OR: [
              { nativeRecovery: { is: null } },
              { nativeRecovery: { is: { status: { notIn: ['STARTED', 'UNKNOWN'] } } } },
            ] }],
            OR: [
              { deliveryClaimOwner: null },
              { deliveryClaimExpiresAt: { lte: new Date() } },
            ],
          },
          data: {
            deliveryClaimOwner: owner,
            deliveryClaimExpiresAt: new Date(Date.now() + 120_000),
          },
        });
        if (admission.count !== 1)
          throw new Error(
            'Post changed or is already being processed. Refresh before retrying.',
          );
        claimed = true;
        if (
          await recoverAcknowledgedNativeReplacement({
            prisma: this.prisma,
            post,
            owner,
            snapshots: [
              accountContext?.scheduledMessages,
              accountContext?.confirmationOnlyScheduledMessages,
            ],
          })
        ) {
          rescheduledCount += 1;
          progressFor(
            current,
            post,
            'RESCHEDULED',
            'Recovered saved Telegram acknowledgement without sending again.',
          );
          continue;
        }
        if (
          future &&
          post.scheduleMode !== 'LOCAL' &&
          accountContext?.error &&
          !knownNativeIdentity
        ) {
          failedPostIds.push(post.id);
          progressFor(
            current,
            post,
            'FAILED',
            `Could not confirm Telegram's current schedule: ${accountContext.error}. Post left unchanged.`,
          );
          continue;
        }
        const remoteScheduledIds = knownNativeIdentity
          ? new Set(scheduledIds)
          : (accountContext?.scheduledIds ?? new Set<string>());
        const remotePublished = publishedByAccount.get(accountId);
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
          // Scheduled IDs belong to an account queue, not the channel's published
          // message namespace. A coincidentally equal ID is not publication proof.
          const matched = scheduledAt
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
            if (scheduledIds.some((id) => remoteScheduledIds.has(id))) {
              throw new Error(
                'Telegram shows both a published match and an outstanding schedule. Reconcile the original sender queue before making changes.',
              );
            }
            await markScheduledPostPublished(
              {
                prisma: this.prisma,
                owner,
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
          if (!remotePublished?.recentPublishedComplete)
            throw new Error('Published history is incomplete; the overdue post was left unchanged.');
          if (post.scheduleMode === 'LOCAL') {
            const attempts =
              await this.prisma.telegramManagedPostSendOperation.count({
                where: { postId: post.id, workspaceId, channelId },
              });
            if (
              attempts ||
              post.telegramMessageIds.length ||
              post.deliveryAttemptCount
            ) {
              throw new Error(
                'LOCAL send has delivery evidence but no unique Telegram publication match. Reconcile the send journal before retrying.',
              );
            }
            await returnScheduledPostToDraft(
              {
                prisma: this.prisma,
                owner,
                access: this.access,
                revisions: this.revisions,
                groups: this.groups,
              },
              userId,
              workspaceId,
              channelId,
              post,
            );
            returnedToDraftCount += 1;
            progressFor(current, post, 'DRAFTED');
            continue;
          }
          throw new Error(
            'The native schedule deadline has passed. Reconcile publication and the original sender queue before making changes.',
          );
        }

        if (!scheduledIds.length)
          throw new Error(
            'No stored Telegram scheduled-message IDs; left untouched to prevent a duplicate.',
          );
        if (
          !knownNativeIdentity &&
          !scheduledIds.every((id) => remoteScheduledIds.has(id))
        ) {
          await assertMissingNativeScheduleRepairable({
            prisma: this.prisma,
            identity: this.identity,
            post,
            context: accountContext,
            workspaceId,
            channelId,
            history: publishedByAccount.get(accountId),
          });
        }
        if (!scheduledAt || scheduledAt.getTime() <= Date.now())
          throw new Error(
            'Schedule deadline passed during reconciliation; refresh before retrying.',
          );
        uncertain = true;
        await rescheduleContext.run(
          {
            owner,
            signal: AbortSignal.timeout(60_000),
            scheduledAt,
            replacementFor: knownNativeIdentity ? post.id : undefined,
            ordinaryReplacement: knownNativeIdentity,
            confirmedMissingScheduleFor:
              !knownNativeIdentity &&
              scheduledIds.every((id) => !remoteScheduledIds.has(id))
                ? post.id
                : undefined,
          },
          () =>
            this.publication.publishManagedPost(
              workspaceId,
              channelId,
              post.id,
              scheduledAt,
              'IMAGES_THEN_TEXT',
              userId,
              true,
              (stage, message) => progressFor(index, post, stage, message),
            ),
        );
        uncertain = false;
        rescheduledCount += 1;
        progressFor(current, post, 'RESCHEDULED');
      } catch (error) {
        failedPostIds.push(post.id);
        progressFor(
          current,
          post,
          'FAILED',
          `${error instanceof Error ? error.message : 'Unknown error'}${uncertain ? ' Remote rescheduling outcome is uncertain; reconcile the durable receipt with the original Telegram sender before any retry.' : ''}`,
        );
      } finally {
        if (claimed && !uncertain)
          try {
            await this.prisma.telegramManagedPost.updateMany({
              where: { id: post.id, workspaceId, deliveryClaimOwner: owner },
              data: { deliveryClaimOwner: null, deliveryClaimExpiresAt: null },
            });
          } catch {
            if (!failedPostIds.includes(post.id)) failedPostIds.push(post.id);
            progressFor(
              current,
              post,
              'FAILED',
              'Operation completed but claim cleanup failed; inspect the stored claim and Telegram receipt before retrying.',
            );
          }
      }
    }
    this.support.invalidateTelegramChannelReadCache(userId, workspaceId);
    return result();
  }

  async listChannelRescheduleCandidates(userId: string, channelId: string) {
    const workspaceId = await this.support.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      select: { id: true },
    });
    if (!channel) throw telegramChannelNotFound();
    const posts = await this.prisma.telegramManagedPost.findMany({
      where: ordinaryScheduledPostWhere(workspaceId, channelId),
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    return { channelId, postIds: posts.map(({ id }) => id) };
  }
}
