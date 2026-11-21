import { BadRequestException, Injectable } from '@nestjs/common';
import { TelegramChannelsService } from '../../telegram/telegram-channels/telegram-channels.service';
import { TelegramSystemPostGroupsService } from '../../telegram/telegram-channels/telegram-system-post-groups.service';
import { CreateCrossPromotionPlanDto } from './dto';
import { CrossPromotionPlansService } from './cross-promotion-plans.service';
import { TelegramManagedPostRemoteDeletionService } from '../../telegram/telegram-channels/telegram-managed-post-remote-deletion.service';
import {
  managedPostPayload,
  publisherPublications,
  publisherScheduleTimes,
  withImmediatePublisherTimes,
  type Progress,
  type ScheduledPost,
} from './cross-promotion-placement-input';
import { CrossPromotionPlacementPublisher } from './cross-promotion-placement-publisher';

@Injectable()
export class CrossPromotionPlanSchedulingService {
  private readonly placementPublisher: CrossPromotionPlacementPublisher;

  constructor(
    private readonly plans: CrossPromotionPlansService,
    private readonly telegramChannels: TelegramChannelsService,
    private readonly systemPostGroups: TelegramSystemPostGroupsService,
    private readonly remoteDeletion: TelegramManagedPostRemoteDeletionService,
  ) {
    this.placementPublisher = new CrossPromotionPlacementPublisher(
      plans,
      telegramChannels,
      systemPostGroups,
    );
  }

  async remove(userId: string, id: string) {
    const context = await this.plans.removalContext(userId, id);
    if (context.remotePostIds.length) {
      const result = await this.remoteDeletion.deletePublishedManagedPosts({
        workspaceId: context.workspaceId,
        managedPostIds: context.remotePostIds,
      });
      if (result.failed) {
        throw new Error(
          result.results.find((item) => !item.success)?.error ??
            'Telegram posts could not be deleted',
        );
      }
    }
    return this.plans.remove(userId, id);
  }

  async createAndSchedule(
    userId: string,
    dto: CreateCrossPromotionPlanDto,
    onProgress: Progress,
    signal: AbortSignal,
  ) {
    const total = publisherScheduleTimes(dto).length + 2;
    const createdPosts: ScheduledPost[] = [];
    let planId: string | null = null;
    onProgress(
      { phase: 'VALIDATING', message: 'Validating promotion placement' },
      0,
      total,
    );

    try {
      // Persist the intent before the first Telegram call. A disconnected
      // browser or a transient Telegram error must leave a resumable job,
      // never an untracked subset of posts.
      await this.plans.validateForScheduling(userId, dto);
      const plan = await this.plans.create(userId, dto);
      planId = plan.id;
      await this.placementPublisher.schedulePosts(
        userId,
        dto,
        createdPosts,
        onProgress,
        total,
        signal,
        true,
        async () => {
          await this.plans.savePlacements(userId, plan.id, {
            placements: createdPosts,
            lastError: null,
          });
        },
      );

      signal.throwIfAborted();
      onProgress(
        { phase: 'SAVING', message: 'Saving promotion placement' },
        total - 1,
        total,
      );
      const saved = await this.plans.savePlacements(userId, plan.id, {
        placements: createdPosts,
        lastError: null,
      });
      onProgress(
        { phase: 'SAVING', message: 'Promotion scheduled', success: true },
        total,
        total,
      );
      return saved;
    } catch (error) {
      if (planId) {
        await this.plans
          .savePlacements(userId, planId, {
            placements: createdPosts,
            lastError:
              error instanceof Error ? error.message : 'Scheduling failed',
          })
          .catch(() => undefined);
      }
      throw error;
    }
  }

  async resume(
    userId: string,
    id: string,
    onProgress: Progress,
    signal: AbortSignal,
  ) {
    const context = await this.plans.resumeSchedulingContext(userId, id);
    const total = publisherScheduleTimes(context.dto).length + 2;
    const posts = [...context.placements];
    onProgress(
      { phase: 'VALIDATING', message: 'Resuming promotion placement' },
      posts.length,
      total,
    );
    try {
      await this.placementPublisher.schedulePosts(
        userId,
        context.dto,
        posts,
        onProgress,
        total,
        signal,
        true,
        async () => {
          await this.plans.savePlacements(userId, id, {
            placements: posts,
            lastError: null,
          });
        },
      );
      const saved = await this.plans.savePlacements(userId, id, {
        placements: posts,
        lastError: null,
      });
      onProgress(
        { phase: 'SAVING', message: 'Promotion scheduled', success: true },
        total,
        total,
      );
      return saved;
    } catch (error) {
      await this.plans
        .savePlacements(userId, id, {
          placements: posts,
          lastError:
            error instanceof Error ? error.message : 'Scheduling failed',
        })
        .catch(() => undefined);
      throw error;
    }
  }

  async replaceAndSchedule(
    userId: string,
    id: string,
    dto: CreateCrossPromotionPlanDto,
    onProgress: Progress,
    signal: AbortSignal,
  ) {
    // A past placement must never be moved to DRAFT by attempting to recreate
    // its already-published posts. Use the metadata PATCH flow instead.
    if (
      publisherScheduleTimes(dto).some(
        (time) => !Number.isFinite(time) || time <= Date.now(),
      )
    ) {
      throw new BadRequestException(
        'Every publishing post must be scheduled in the future',
      );
    }
    const total = publisherScheduleTimes(dto).length + 2;
    const createdPosts: ScheduledPost[] = [];
    onProgress(
      { phase: 'VALIDATING', message: 'Validating promotion changes' },
      0,
      total,
    );
    await this.plans.validateForScheduling(userId, dto);
    const previous = await this.plans.placementsForReschedule(userId, id);
    await this.plans.claimRescheduling(userId, id);
    try {
      const context = await this.plans.removalContext(userId, id);
      if (context.remotePostIds.length) {
        onProgress(
          {
            phase: 'DELETING',
            message: `Deleting 0 of ${context.remotePostIds.length} existing posts`,
          },
          1,
          total,
        );
        const deletion = await this.remoteDeletion.deletePublishedManagedPosts({
          workspaceId: context.workspaceId,
          managedPostIds: context.remotePostIds,
        });
        if (deletion.failed) {
          throw new Error(
            deletion.results.find((item) => !item.success)?.error ??
              'Existing Telegram posts could not be removed',
          );
        }
        onProgress(
          {
            phase: 'DELETING',
            message: `Deleted ${deletion.deleted + deletion.skipped} of ${context.remotePostIds.length} existing posts`,
            success: true,
          },
          2,
          total,
        );
      }
      for (const placement of previous) {
        if (context.remotePostIds.includes(placement.managedPostId)) continue;
        signal.throwIfAborted();
        await this.telegramChannels.deleteManagedPost(
          userId,
          placement.telegramChannelId,
          placement.managedPostId,
        );
      }
      await this.placementPublisher.schedulePosts(
        userId,
        dto,
        createdPosts,
        onProgress,
        total,
        signal,
        false,
        (placement) =>
          this.plans.appendReschedulingPlacement(userId, id, placement),
      );
      const saved = await this.plans.replaceScheduled(
        userId,
        id,
        dto,
        createdPosts,
      );
      onProgress(
        { phase: 'SAVING', message: 'Promotion updated', success: true },
        total,
        total,
      );
      return saved;
    } catch (error) {
      await this.placementPublisher.rollback(
        userId,
        createdPosts,
        onProgress,
        total,
      );
      await this.plans
        .markRescheduling(
          userId,
          id,
          error instanceof Error ? error.message : 'Rescheduling failed',
        )
        .catch(() => undefined);
      throw error;
    }
  }

  /**
   * A destructive recovery path for a live promotion: remove the old remote
   * messages, then publish the replacement to every publisher channel now.
   */
  async replaceAndPublishNow(
    userId: string,
    id: string,
    dto: CreateCrossPromotionPlanDto,
    onProgress: Progress,
    signal: AbortSignal,
  ) {
    const now = new Date().toISOString();
    const immediate = withImmediatePublisherTimes(dto, now);
    const total = publisherScheduleTimes(immediate).length + 2;
    const createdPosts: ScheduledPost[] = [];
    onProgress(
      { phase: 'VALIDATING', message: 'Validating replacement publication' },
      0,
      total,
    );
    await this.plans.validateForScheduling(userId, immediate);
    const previous = await this.plans.placementsForReschedule(userId, id);
    const context = await this.plans.removalContext(userId, id);
    try {
      if (context.remotePostIds.length) {
        onProgress(
          {
            phase: 'DELETING',
            message: `Deleting 0 of ${context.remotePostIds.length} existing posts`,
          },
          1,
          total,
        );
        const deletion = await this.remoteDeletion.deletePublishedManagedPosts({
          workspaceId: context.workspaceId,
          managedPostIds: context.remotePostIds,
        });
        if (deletion.failed) {
          throw new Error(
            deletion.results.find((item) => !item.success)?.error ??
              'Existing Telegram posts could not be deleted',
          );
        }
        onProgress(
          {
            phase: 'DELETING',
            message: `Deleted ${deletion.deleted + deletion.skipped} of ${context.remotePostIds.length} existing posts`,
            success: true,
          },
          2,
          total,
        );
      }
      await this.plans.markRescheduling(
        userId,
        id,
        'Replacing published posts',
      );
      for (const placement of previous) {
        if (context.remotePostIds.includes(placement.managedPostId)) continue;
        signal.throwIfAborted();
        await this.telegramChannels.deleteManagedPost(
          userId,
          placement.telegramChannelId,
          placement.managedPostId,
        );
      }
      await this.placementPublisher.publishPostsNow(
        userId,
        immediate,
        createdPosts,
        onProgress,
        total,
        signal,
      );
      const saved = await this.plans.replaceScheduled(
        userId,
        id,
        immediate,
        createdPosts,
        'ACTIVE',
      );
      onProgress(
        { phase: 'SAVING', message: 'Replacement published', success: true },
        total,
        total,
      );
      return saved;
    } catch (error) {
      await this.placementPublisher.rollback(
        userId,
        createdPosts,
        onProgress,
        total,
      );
      await this.plans
        .markRescheduling(
          userId,
          id,
          error instanceof Error ? error.message : 'Replacement failed',
        )
        .catch(() => undefined);
      throw error;
    }
  }

  async updatePublicationInTelegram(
    userId: string,
    id: string,
    publicationId: string,
    dto: CreateCrossPromotionPlanDto,
    onProgress: Progress = () => undefined,
    signal?: AbortSignal,
  ) {
    const publication = publisherPublications(dto).find(
      (item) => item.id === publicationId,
    );
    if (!publication) throw new BadRequestException('Partner post not found');
    const placements = (
      await this.plans.placementsForReschedule(userId, id)
    ).filter((item) => item.publicationId === publicationId);
    if (!placements.length)
      throw new BadRequestException(
        'Partner post has no Telegram publications',
      );
    const total = placements.length + 2;
    onProgress(
      { phase: 'VALIDATING', message: 'Validating partner post update' },
      0,
      total,
    );
    // This action edits an already-created Telegram message in place. It
    // cannot move its local/native delivery clock. Do not persist a changed
    // timestamp unless the replacement flow has recreated the delivery.
    const existingSchedule = await this.plans.publicationScheduleForUpdate(
      userId,
      id,
      publicationId,
    );
    const expectedTimes = new Map(
      existingSchedule.map((item) => [
        item.telegramChannelId,
        Date.parse(item.scheduledAt),
      ]),
    );
    if (
      publication.placements.length !== existingSchedule.length ||
      publication.placements.some(
        (item) =>
          !Number.isFinite(Date.parse(item.scheduledAt)) ||
          expectedTimes.get(item.telegramChannelId) !==
            Date.parse(item.scheduledAt),
      )
    ) {
      throw new BadRequestException(
        'A partner-post time cannot be changed in place. Replace the publication to create a new Telegram schedule.',
      );
    }
    const nextPost = managedPostPayload(dto, publication.post);
    const existingPosts = new Map(
      (
        await this.plans.managedPostsForPublicationUpdate(
          userId,
          id,
          publicationId,
        )
      ).map((post) => [post.linkedManagedPostId ?? post.id, post]),
    );
    // Do this before the first remote edit.  Telegram cannot atomically edit
    // messages in several channels; without this preflight a deleted/stale
    // managed-post record makes the operation stop halfway through and leaves
    // earlier channels with the new copy while later ones retain the old copy.
    const unavailablePlacements = placements.filter((placement) => {
      const post = existingPosts.get(placement.managedPostId);
      return !post || post.telegramChannelId !== placement.telegramChannelId;
    });
    if (unavailablePlacements.length) {
      throw new BadRequestException(
        `Partner post cannot be updated because its managed post is missing for ${unavailablePlacements.map((placement) => placement.telegramChannelId).join(', ')}. Replace the publication to recreate the missing Telegram post, then try again.`,
      );
    }
    const resolvedPlacements: ScheduledPost[] = [];
    for (const [index, placement] of placements.entries()) {
      signal?.throwIfAborted();
      const current = existingPosts.get(placement.managedPostId)!;
      const resolvedPlacement = { ...placement, managedPostId: current.id };
      resolvedPlacements.push(resolvedPlacement);
      // This is an explicit remote-repair action. Do not skip Telegram merely
      // because the local snapshot already matches: a previous Bot API edit can
      // have saved the new text locally while Telegram still has degraded
      // premium custom-emoji entities. Reapplying every placement lets the
      // MTProto repair stage restore those entities consistently.
      onProgress(
        {
          phase: 'SCHEDULING',
          message: `Updating post in ${placement.telegramChannelId}`,
          telegramChannelId: placement.telegramChannelId,
        },
        index,
        total,
      );
      await this.telegramChannels.updateManagedPost(
        userId,
        placement.telegramChannelId,
        resolvedPlacement.managedPostId,
        nextPost,
      );
      onProgress(
        {
          phase: 'SCHEDULING',
          message: `Updated post in ${placement.telegramChannelId}`,
          telegramChannelId: placement.telegramChannelId,
          success: true,
        },
        index + 1,
        total,
      );
    }
    signal?.throwIfAborted();
    onProgress(
      { phase: 'SAVING', message: 'Saving partner post update' },
      total - 1,
      total,
    );
    const updated = await this.plans.replacePublicationPlacements(
      userId,
      id,
      publicationId,
      dto,
      resolvedPlacements,
      'ACTIVE',
    );
    onProgress(
      { phase: 'SAVING', message: 'Partner post updated', success: true },
      total,
      total,
    );
    return updated;
  }

  async replacePublicationAndPublishNow(
    userId: string,
    id: string,
    publicationId: string,
    dto: CreateCrossPromotionPlanDto,
    onProgress: Progress,
    signal: AbortSignal,
  ) {
    const publication = publisherPublications(dto).find(
      (item) => item.id === publicationId,
    );
    if (!publication) throw new BadRequestException('Partner post not found');
    const previous = (
      await this.plans.placementsForReschedule(userId, id)
    ).filter((item) => item.publicationId === publicationId);
    if (!previous.length)
      throw new BadRequestException(
        'Partner post has no Telegram publications',
      );
    const context = await this.plans.removalContext(userId, id);
    const previousIds = new Set(previous.map((item) => item.managedPostId));
    const remotePostIds = context.remotePostIds.filter((item) =>
      previousIds.has(item),
    );
    const immediate = withImmediatePublisherTimes(
      {
        ...dto,
        publicationPost: {
          ...dto.publicationPost,
          publisherPublications: [publication],
        },
      },
      new Date().toISOString(),
    );
    const createdPosts: ScheduledPost[] = [];
    const total = publication.placements.length + 2;
    try {
      if (remotePostIds.length) {
        onProgress(
          { phase: 'DELETING', message: 'Deleting this partner post' },
          1,
          total,
        );
        const deletion = await this.remoteDeletion.deletePublishedManagedPosts({
          workspaceId: context.workspaceId,
          managedPostIds: remotePostIds,
        });
        if (deletion.failed)
          throw new Error('Existing Telegram posts could not be deleted');
      }
      for (const placement of previous) {
        if (!remotePostIds.includes(placement.managedPostId)) {
          await this.telegramChannels.deleteManagedPost(
            userId,
            placement.telegramChannelId,
            placement.managedPostId,
          );
        }
      }
      await this.placementPublisher.publishPostsNow(
        userId,
        immediate,
        createdPosts,
        onProgress,
        total,
        signal,
      );
      return this.plans.replacePublicationPlacements(
        userId,
        id,
        publicationId,
        dto,
        createdPosts,
        'ACTIVE',
      );
    } catch (error) {
      await this.placementPublisher.rollback(
        userId,
        createdPosts,
        onProgress,
        total,
      );
      throw error;
    }
  }

  async updatePublicationChannelSchedule(
    userId: string,
    id: string,
    publicationId: string,
    channelId: string,
    dto: CreateCrossPromotionPlanDto,
  ) {
    const publication = publisherPublications(dto).find(
      (item) => item.id === publicationId,
    );
    const nextPlacement = publication?.placements.find(
      (item) => item.telegramChannelId === channelId,
    );
    const previous = (
      await this.plans.placementsForReschedule(userId, id)
    ).find(
      (item) =>
        item.publicationId === publicationId &&
        item.telegramChannelId === channelId,
    );
    if (!publication || !nextPlacement || !previous)
      throw new BadRequestException('Partner-post channel placement not found');
    await this.plans.claimRescheduling(userId, id);
    try {
      await this.telegramChannels.scheduleManagedPost(
        userId,
        channelId,
        previous.managedPostId,
        { scheduledAt: nextPlacement.scheduledAt },
      );
      return await this.plans.replacePublicationChannelPlacement(
        userId,
        id,
        publicationId,
        channelId,
        dto,
        previous,
        'SCHEDULED',
      );
    } catch (error) {
      await this.plans
        .markRescheduling(
          userId,
          id,
          error instanceof Error ? error.message : 'Rescheduling failed',
        )
        .catch(() => undefined);
      throw error;
    }
  }

  async replacePublicationChannelSchedule(
    userId: string,
    id: string,
    publicationId: string,
    channelId: string,
    dto: CreateCrossPromotionPlanDto,
  ) {
    const publication = publisherPublications(dto).find(
      (item) => item.id === publicationId,
    );
    const nextPlacement = publication?.placements.find(
      (item) => item.telegramChannelId === channelId,
    );
    const previous = (
      await this.plans.placementsForReschedule(userId, id)
    ).find(
      (item) =>
        item.publicationId === publicationId &&
        item.telegramChannelId === channelId,
    );
    if (!publication || !nextPlacement || !previous)
      throw new BadRequestException('Partner-post channel placement not found');
    await this.plans.claimRescheduling(userId, id);
    try {
      const context = await this.plans.removalContext(userId, id);
      const deletion = await this.remoteDeletion.deletePublishedManagedPosts({
        workspaceId: context.workspaceId,
        managedPostIds: [previous.managedPostId],
      });
      // A user may already have deleted the published Telegram message manually.
      // That is the desired end state for this replacement, so only fail for an
      // operational deletion error rather than a missing remote message.
      const onlyAlreadyMissing =
        deletion.failed > 0 &&
        deletion.results
          .filter((result) => !result.success)
          .every(
            (result) =>
              result.error?.includes('could not be identified') ||
              result.error?.includes('no published Telegram message IDs'),
          );
      if (deletion.failed && !onlyAlreadyMissing)
        throw new Error('Existing Telegram post could not be deleted');
      await this.telegramChannels.deleteManagedPost(
        userId,
        channelId,
        previous.managedPostId,
      );
      const group = await this.systemPostGroups.ensureMutualPromotionGroup(
        userId,
        channelId,
      );
      const post = await this.telegramChannels.createManagedPost(
        userId,
        channelId,
        managedPostPayload(dto, publication.post, nextPlacement),
        { groupId: group.id },
      );
      await this.telegramChannels.scheduleManagedPost(
        userId,
        channelId,
        post.id,
        {
          scheduledAt: nextPlacement.scheduledAt,
        },
      );
      return await this.plans.replacePublicationChannelPlacement(
        userId,
        id,
        publicationId,
        channelId,
        dto,
        {
          telegramChannelId: channelId,
          managedPostId: post.id,
          postGroupId: group.id,
          publicationId,
        },
        'SCHEDULED',
      );
    } catch (error) {
      await this.plans
        .markRescheduling(
          userId,
          id,
          error instanceof Error ? error.message : 'Rescheduling failed',
        )
        .catch(() => undefined);
      throw error;
    }
  }
}
