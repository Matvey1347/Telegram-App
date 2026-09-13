import { Injectable } from '@nestjs/common';
import type { CrossPromotionSchedulingProgress } from '@telegram-system/shared';
import { TelegramChannelsService } from '../../telegram/telegram-channels/telegram-channels.service';
import { TelegramSystemPostGroupsService } from '../../telegram/telegram-channels/telegram-system-post-groups.service';
import type { CreateTelegramManagedPostDto } from '../../telegram/telegram-channels/dto';
import { CreateCrossPromotionPlanDto } from './dto';
import { CrossPromotionPlansService } from './cross-promotion-plans.service';

type Progress = (
  item: CrossPromotionSchedulingProgress,
  current: number,
  total: number,
) => void;
type ScheduledPost = {
  telegramChannelId: string;
  managedPostId: string;
  postGroupId: string;
};

@Injectable()
export class CrossPromotionPlanSchedulingService {
  constructor(
    private readonly plans: CrossPromotionPlansService,
    private readonly telegramChannels: TelegramChannelsService,
    private readonly systemPostGroups: TelegramSystemPostGroupsService,
  ) {}

  async createAndSchedule(
    userId: string,
    dto: CreateCrossPromotionPlanDto,
    onProgress: Progress,
    signal: AbortSignal,
  ) {
    const total = dto.publisherChannelIds.length + 2;
    const createdPosts: ScheduledPost[] = [];
    let createdPlanId: string | null = null;
    onProgress(
      { phase: 'VALIDATING', message: 'Validating promotion placement' },
      0,
      total,
    );

    try {
      await this.schedulePosts(
        userId,
        dto,
        createdPosts,
        onProgress,
        total,
        signal,
      );

      signal.throwIfAborted();
      onProgress(
        { phase: 'SAVING', message: 'Saving promotion placement' },
        total - 1,
        total,
      );
      const plan = await this.plans.create(userId, dto);
      createdPlanId = plan.id;
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
      await this.rollback(userId, createdPosts, onProgress, total);
      if (createdPlanId) {
        await this.plans.remove(userId, createdPlanId).catch(() => undefined);
      }
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
    const total = dto.publisherChannelIds.length + 2;
    const createdPosts: ScheduledPost[] = [];
    onProgress(
      { phase: 'VALIDATING', message: 'Validating promotion changes' },
      0,
      total,
    );
    await this.plans.validateForScheduling(userId, dto);
    const previous = await this.plans.placementsForReschedule(userId, id);
    try {
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
  ) {
    if (validate) await this.plans.validateForScheduling(userId, dto);
    for (const [index, channelId] of dto.publisherChannelIds.entries()) {
      signal.throwIfAborted();
      const placement = dto.publicationPost.publisherPlacements?.find(
        (item) => item.telegramChannelId === channelId,
      );
      const group = await this.systemPostGroups.ensureMutualPromotionGroup(
        userId,
        channelId,
      );
      const post = await this.telegramChannels.createManagedPost(
        userId,
        channelId,
        this.managedPostPayload(dto),
        { groupId: group.id },
      );
      createdPosts.push({
        telegramChannelId: channelId,
        managedPostId: post.id,
        postGroupId: group.id,
      });
      await this.telegramChannels.scheduleManagedPost(
        userId,
        channelId,
        post.id,
        { scheduledAt: placement?.scheduledAt ?? dto.scheduledAt },
      );
      onProgress(
        {
          phase: 'SCHEDULING',
          message: `Scheduled ${index + 1} of ${dto.publisherChannelIds.length} posts`,
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
  ): CreateTelegramManagedPostDto {
    const post = dto.publicationPost;
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
    };
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
