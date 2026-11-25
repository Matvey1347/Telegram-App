import { TelegramChannelsService } from '../../telegram/telegram-channels/telegram-channels.service';
import { TelegramSystemPostGroupsService } from '../../telegram/telegram-channels/telegram-system-post-groups.service';
import { CreateCrossPromotionPlanDto } from './dto';
import { CrossPromotionPlansService } from './cross-promotion-plans.service';
import {
  managedPostPayload,
  publisherPublications,
  type Progress,
  type ScheduledPost,
} from './cross-promotion-placement-input';

export class CrossPromotionPlacementPublisher {
  constructor(
    private readonly plans: CrossPromotionPlansService,
    private readonly telegramChannels: TelegramChannelsService,
    private readonly systemPostGroups: TelegramSystemPostGroupsService,
  ) {}

  async schedulePosts(
    userId: string,
    dto: CreateCrossPromotionPlanDto,
    createdPosts: ScheduledPost[],
    onProgress: Progress,
    total: number,
    signal: AbortSignal,
    validate = true,
    onPlacementSaved?: (placement: ScheduledPost) => Promise<void>,
    pendingPostIds: ReadonlySet<string> = new Set(),
  ) {
    if (validate) await this.plans.validateForScheduling(userId, dto);
    const savedByPlacement = new Map(
      createdPosts.map(
        (post) => [`${post.publicationId}:${post.telegramChannelId}`, post],
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
      let savedPost = savedByPlacement.get(key);
      if (savedPost && !pendingPostIds.has(savedPost.managedPostId)) continue;
      signal.throwIfAborted();
      if (!savedPost) {
        const group = await this.systemPostGroups.ensureMutualPromotionGroup(userId, channelId);
        const post = await this.telegramChannels.createManagedPost(
          userId, channelId, managedPostPayload(dto, publication.post, placement), { groupId: group.id },
        );
        savedPost = {
          telegramChannelId: channelId, managedPostId: post.id, postGroupId: group.id,
          ...(publicationId ? { publicationId } : {}),
        };
        createdPosts.push(savedPost);
        savedByPlacement.set(key, savedPost);
        await onPlacementSaved?.(savedPost);
      }
      await this.telegramChannels.scheduleManagedPost(
        userId, channelId, savedPost.managedPostId,
        { scheduledAt: placement?.scheduledAt ?? dto.scheduledAt },
      );
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

  async publishPostsNow(
    userId: string,
    dto: CreateCrossPromotionPlanDto,
    createdPosts: ScheduledPost[],
    onProgress: Progress,
    total: number,
    signal: AbortSignal,
  ) {
    const publications = publisherPublications(dto);
    const items = publications.flatMap((publication) =>
      publication.placements.map((placement) => ({ publication, placement })),
    );
    for (const [index, { publication, placement }] of items.entries()) {
      signal.throwIfAborted();
      const group = await this.systemPostGroups.ensureMutualPromotionGroup(
        userId,
        placement.telegramChannelId,
      );
      const post = await this.telegramChannels.createManagedPost(
        userId,
        placement.telegramChannelId,
        managedPostPayload(dto, publication.post, placement),
        { groupId: group.id },
      );
      await this.telegramChannels.publishManagedPostNow(
        userId,
        placement.telegramChannelId,
        post.id,
        {},
      );
      createdPosts.push({
        telegramChannelId: placement.telegramChannelId,
        managedPostId: post.id,
        postGroupId: group.id,
        ...(dto.publicationPost.publisherPublications?.length
          ? { publicationId: publication.id }
          : {}),
      });
      onProgress(
        {
          phase: 'SCHEDULING',
          message: `Published ${index + 1} of ${items.length} posts`,
          telegramChannelId: placement.telegramChannelId,
          success: true,
        },
        index + 1,
        total,
      );
    }
  }

  async rollback(
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
