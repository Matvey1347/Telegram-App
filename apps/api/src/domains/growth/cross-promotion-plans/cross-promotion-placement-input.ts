import type { CrossPromotionSchedulingProgress } from '@telegram-system/shared';
import type { CreateTelegramManagedPostDto } from '../../telegram/telegram-channels/dto';
import type {
  CrossPromotionChannelPlacementInput,
  CrossPromotionPublicationItem,
} from '@telegram-system/shared';
import { CreateCrossPromotionPlanDto } from './dto';

export type Progress = (
  item: CrossPromotionSchedulingProgress,
  current: number,
  total: number,
) => void;

export type ScheduledPost = {
  telegramChannelId: string;
  managedPostId: string;
  postGroupId?: string | null;
  publicationId?: string | null;
};

type PublisherPublication = CrossPromotionPublicationItem;

export function publisherPublications(
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
export function publisherScheduleTimes(dto: CreateCrossPromotionPlanDto) {
  return publisherPublications(dto)
    .flatMap((publication) => publication.placements)
    .map((placement) => Date.parse(placement.scheduledAt ?? dto.scheduledAt));
}

export function withImmediatePublisherTimes(
  dto: CreateCrossPromotionPlanDto,
  scheduledAt: string,
): CreateCrossPromotionPlanDto {
  const replace = (placement: CrossPromotionChannelPlacementInput) => {
    const previousAt = Date.parse(placement.scheduledAt);
    const previousDeleteAt = placement.deleteAt
      ? Date.parse(placement.deleteAt)
      : NaN;
    const deleteAt =
      Number.isFinite(previousAt) && Number.isFinite(previousDeleteAt)
        ? new Date(
            Date.parse(scheduledAt) + (previousDeleteAt - previousAt),
          ).toISOString()
        : null;
    return { ...placement, scheduledAt, deleteAt };
  };
  return {
    ...dto,
    scheduledAt,
    publicationPost: {
      ...dto.publicationPost,
      publisherPlacements:
        dto.publicationPost.publisherPlacements?.map(replace),
      publisherPublications: dto.publicationPost.publisherPublications?.map(
        (publication) => ({
          ...publication,
          placements: publication.placements.map(replace),
        }),
      ),
    },
  };
}

export function managedPostPayload(
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
    deleteAfterHours: deleteAfterHours(placement),
  };
}

function deleteAfterHours(
  placement?: CrossPromotionChannelPlacementInput,
): 24 | 48 | 72 | null | undefined {
  if (!placement?.deleteAt) return null;
  const scheduledAt = Date.parse(placement.scheduledAt);
  const deleteAt = Date.parse(placement.deleteAt);
  if (!Number.isFinite(scheduledAt) || !Number.isFinite(deleteAt)) return null;
  const hours = Math.round((deleteAt - scheduledAt) / 3_600_000);
  return hours === 24 || hours === 48 || hours === 72 ? hours : null;
}
