import { BadRequestException, Injectable } from '@nestjs/common';
import type { CrossPromotionSchedulingProgress } from '@telegram-system/shared';
import { TelegramChannelsService } from '../../telegram/telegram-channels/telegram-channels.service';
import { TelegramSystemPostGroupsService } from '../../telegram/telegram-channels/telegram-system-post-groups.service';
import type { CreateTelegramManagedPostDto } from '../../telegram/telegram-channels/dto';
import type {
  CrossPromotionChannelPlacementInput,
  CrossPromotionPublicationItem,
} from '@telegram-system/shared';
import { CreateCrossPromotionPlanDto } from './dto';
import { CrossPromotionPlansService } from './cross-promotion-plans.service';
import { TelegramManagedPostRemoteDeletionService } from '../../telegram/telegram-channels/telegram-managed-post-remote-deletion.service';

type Progress = (
  item: CrossPromotionSchedulingProgress,
  current: number,
  total: number,
) => void;
type ScheduledPost = {
  telegramChannelId: string;
  managedPostId: string;
  postGroupId?: string | null;
  publicationId?: string | null;
};

type PublisherPublication = CrossPromotionPublicationItem;

function publisherPublications(
  dto: CreateCrossPromotionPlanDto,
): PublisherPublication[] {
  const configured = dto.publicationPost.publisherPublications;
  if (configured?.length) return configured;
  return [
    {
      id: 'legacy-publisher-publication',
      post: dto.publicationPost,
      placements:
        dto.publicationPost.publisherPlacements ??
        dto.publisherChannelIds.map((telegramChannelId) => ({
          telegramChannelId,
          scheduledAt: dto.scheduledAt,
        })),
    },
  ];
}

/**
 * The plan-level timestamp is a display/tracking anchor.  Telegram posts are
 * actually scheduled from the per-publisher placements, which may override
 * that default date and time.  Do not reject a valid future placement merely
 * because an old default timestamp was left on the plan.
 */
function publisherScheduleTimes(dto: CreateCrossPromotionPlanDto) {
  return publisherPublications(dto)
    .flatMap((publication) => publication.placements)
    .map((placement) => Date.parse(placement.scheduledAt ?? dto.scheduledAt));
}

@Injectable()
export class CrossPromotionPlanSchedulingService {
  constructor(
    private readonly plans: CrossPromotionPlansService,
    private readonly telegramChannels: TelegramChannelsService,
    private readonly systemPostGroups: TelegramSystemPostGroupsService,
    private readonly remoteDeletion: TelegramManagedPostRemoteDeletionService,
  ) {}

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
      await this.schedulePosts(
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
      await this.schedulePosts(
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
    const context = await this.plans.removalContext(userId, id);
    try {
      if (context.remotePostIds.length) {
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
      }
      await this.plans.markRescheduling(userId, id, 'Rescheduling in progress');
      for (const placement of previous) {
        signal.throwIfAborted();
        await this.telegramChannels.deleteManagedPost(
          userId,
          placement.telegramChannelId,
          placement.managedPostId,
        );
      }
      await this.schedulePosts(
        userId,
        dto,
        createdPosts,
        onProgress,
        total,
        signal,
        false,
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
      await this.rollback(userId, createdPosts, onProgress, total);
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

  private async schedulePosts(
    userId: string,
    dto: CreateCrossPromotionPlanDto,
    createdPosts: ScheduledPost[],
    onProgress: Progress,
    total: number,
    signal: AbortSignal,
    validate = true,
    onPlacementSaved?: () => Promise<void>,
  ) {
    if (validate) await this.plans.validateForScheduling(userId, dto);
    const scheduledPublicationKeys = new Set(
      createdPosts.map(
        (post) => `${post.publicationId}:${post.telegramChannelId}`,
      ),
    );
    const usesPublicationItems = Boolean(
      dto.publicationPost.publisherPublications?.length,
    );
    const publications = publisherPublications(dto);
    const scheduled = publications.flatMap((publication) =>
      publication.placements.map((placement) => ({ publication, placement })),
    );
    for (const [index, item] of scheduled.entries()) {
      const { publication, placement } = item;
      const channelId = placement.telegramChannelId;
      const publicationId = usesPublicationItems ? publication.id : undefined;
      const key = `${publicationId}:${channelId}`;
      if (scheduledPublicationKeys.has(key)) continue;
      signal.throwIfAborted();
      const group = await this.systemPostGroups.ensureMutualPromotionGroup(
        userId,
        channelId,
      );
      const post = await this.telegramChannels.createManagedPost(
        userId,
        channelId,
        this.managedPostPayload(dto, publication.post, placement),
        { groupId: group.id },
      );
      await this.telegramChannels.scheduleManagedPost(
        userId,
        channelId,
        post.id,
        { scheduledAt: placement?.scheduledAt ?? dto.scheduledAt },
      );
      createdPosts.push({
        telegramChannelId: channelId,
        managedPostId: post.id,
        postGroupId: group.id,
        ...(publicationId ? { publicationId } : {}),
      });
      await onPlacementSaved?.();
      onProgress(
        {
          phase: 'SCHEDULING',
          message: `Scheduled ${index + 1} of ${scheduled.length} posts`,
          telegramChannelId: channelId,
          success: true,
        },
        index + 1,
        total,
      );
    }
  }

  private managedPostPayload(
    dto: CreateCrossPromotionPlanDto,
    post: CreateCrossPromotionPlanDto['publicationPost'],
    placement?: CrossPromotionChannelPlacementInput,
  ): CreateTelegramManagedPostDto {
    return {
      title: post.title?.trim() || dto.title.trim(),
      text: post.text ?? '',
      imageUrls: post.imageUrls ?? [],
      mediaItems: post.mediaItems ?? [],
      buttonRows: (post.buttonRows ?? []).map((row) =>
        row.map((button) => ({
          text: button.text,
          url: button.url,
          style: button.style ?? 'default',
        })),
      ),
      deleteAfterHours: this.deleteAfterHours(placement),
    };
  }

  private deleteAfterHours(
    placement?: CrossPromotionChannelPlacementInput,
  ): 24 | 48 | 72 | null | undefined {
    if (!placement?.deleteAt) return null;
    const scheduledAt = Date.parse(placement.scheduledAt);
    const deleteAt = Date.parse(placement.deleteAt);
    if (!Number.isFinite(scheduledAt) || !Number.isFinite(deleteAt))
      return null;
    const hours = Math.round((deleteAt - scheduledAt) / 3_600_000);
    return hours === 24 || hours === 48 || hours === 72 ? hours : null;
  }

  private async rollback(
    userId: string,
    posts: ScheduledPost[],
    onProgress: Progress,
    total: number,
  ) {
    for (const post of [...posts].reverse()) {
      try {
        await this.telegramChannels.deleteManagedPost(
          userId,
          post.telegramChannelId,
          post.managedPostId,
        );
      } catch {
        // Preserve the original scheduling error. Failed cleanup remains visible
        // as a managed post and can be handled from Telegram Posts.
      }
    }
    if (posts.length) {
      onProgress(
        {
          phase: 'ROLLING_BACK',
          message: 'Scheduling failed; created posts were rolled back',
          success: false,
        },
        Math.min(posts.length, total),
        total,
      );
    }
  }
}
