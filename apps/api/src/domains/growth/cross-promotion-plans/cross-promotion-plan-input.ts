import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CrossPromotionPlacementPost } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCrossPromotionPlanDto } from './dto';

export function nextPublisherDeletionAt(post: CrossPromotionPlacementPost) {
  const placements = post.publisherPublications?.length
    ? post.publisherPublications.flatMap(
        (publication) => publication.placements,
      )
    : (post.publisherPlacements ?? []);
  const timestamps = placements
    .flatMap((placement) =>
      placement.deleteAt ? [Date.parse(placement.deleteAt)] : [],
    )
    .filter(
      (timestamp) => Number.isFinite(timestamp) && timestamp > Date.now(),
    );
  return timestamps.length ? new Date(Math.min(...timestamps)) : null;
}

export function firstLifecycleAt(dto: CreateCrossPromotionPlanDto) {
  const timestamps = [
    ...publisherPlacements(
      dto.publicationPost,
      dto.publisherChannelIds,
      dto.scheduledAt,
    ),
    ...partnerPlacements(dto.publicationPost),
  ]
    .flatMap((placement) => [placement.scheduledAt, placement.deleteAt])
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  return timestamps.length ? new Date(Math.min(...timestamps)) : null;
}

export function firstPartnerPublicationAt(dto: CreateCrossPromotionPlanDto) {
  const timestamps = partnerPlacements(dto.publicationPost)
    .map((placement) => Date.parse(placement.scheduledAt))
    .filter(Number.isFinite);
  return timestamps.length ? new Date(Math.min(...timestamps)) : null;
}

export function publisherPlacements(
  post: CrossPromotionPlacementPost,
  publisherChannelIds: string[] = [],
  scheduledAt?: string,
): Array<{
  telegramChannelId: string;
  scheduledAt: string;
  deleteAt?: string | null;
}> {
  if (post.publisherPublications?.length) {
    return post.publisherPublications.flatMap(
      (publication) => publication.placements,
    );
  }
  return (
    post.publisherPlacements ??
    publisherChannelIds.map((telegramChannelId) => ({
      telegramChannelId,
      scheduledAt: scheduledAt ?? '',
    }))
  );
}

function partnerPlacements(post: CrossPromotionPlacementPost): Array<{
  telegramChannelId: string;
  scheduledAt: string;
  deleteAt?: string | null;
}> {
  if (post.partnerPublications?.length) {
    return post.partnerPublications.flatMap(
      (publication) => publication.placements,
    );
  }
  return post.partnerPlacements ?? [];
}

function hasPostContent(
  post?: { text?: string; imageUrls?: string[]; mediaItems?: unknown[] } | null,
) {
  return Boolean(
    post?.text?.trim() || post?.imageUrls?.length || post?.mediaItems?.length,
  );
}

export function normalizePlanIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

export async function validatePlanInput(
  prisma: PrismaService,
  workspaceId: string,
  dto: CreateCrossPromotionPlanDto,
) {
  const publisherChannelIds = normalizePlanIds(dto.publisherChannelIds);
  const partnerChannelIds = normalizePlanIds(dto.partnerChannelIds);
  if (!publisherChannelIds.length)
    throw new BadRequestException('Select at least one publishing channel');
  if (partnerChannelIds.length && !dto.targets.length)
    throw new BadRequestException('Select at least one promoted channel');
  if (dto.advertiserId) {
    const advertiser = await prisma.telegramAdvertiser.findFirst({
      where: { id: dto.advertiserId, workspaceId },
      select: { id: true },
    });
    if (!advertiser)
      throw new NotFoundException('Partner CRM client is unavailable');
  }
  const targetChannelIds = normalizePlanIds(
    dto.targets.map((target) => target.telegramChannelId),
  );
  const allChannelIds = normalizePlanIds([
    ...publisherChannelIds,
    ...partnerChannelIds,
    ...targetChannelIds,
  ]);
  const channels = await prisma.telegramChannel.findMany({
    where: { workspaceId, id: { in: allChannelIds } },
    select: { id: true, adminLinks: { take: 1, select: { id: true } } },
  });
  if (channels.length !== allChannelIds.length)
    throw new NotFoundException(
      'One or more Telegram channels are unavailable',
    );
  const ownIds = new Set(
    channels
      .filter((channel) => channel.adminLinks.length)
      .map((channel) => channel.id),
  );
  if (publisherChannelIds.some((id) => !ownIds.has(id)))
    throw new BadRequestException(
      'Publishing channels must be connected workspace channels',
    );
  const [promos, links] = await Promise.all([
    prisma.promo.findMany({
      where: {
        workspaceId,
        id: {
          in: normalizePlanIds(
            dto.targets.flatMap((target) =>
              target.promoId ? [target.promoId] : [],
            ),
          ),
        },
      },
      select: { id: true, telegramChannelId: true },
    }),
    prisma.telegramInviteLink.findMany({
      where: {
        workspaceId,
        id: {
          in: normalizePlanIds(
            dto.targets.map((target) => target.inviteLinkId),
          ),
        },
        isRevoked: false,
      },
      select: {
        id: true,
        telegramChannelId: true,
        joinedCount: true,
        requestedCount: true,
        createdAt: true,
      },
    }),
  ]);
  const promoById = new Map(promos.map((promo) => [promo.id, promo]));
  const linkById = new Map(links.map((link) => [link.id, link]));
  for (const target of dto.targets) {
    if (
      target.promoId &&
      promoById.get(target.promoId)?.telegramChannelId !==
        target.telegramChannelId
    )
      throw new BadRequestException(
        'Every promo must belong to its promoted channel',
      );
    if (!target.promoId && dto.kind === 'OWN_CHANNELS' && dto.publicationPost.partnerPostSource !== 'CUSTOM')
      throw new BadRequestException('Every own-channel target needs a promo or a custom post');
    if (target.publisherChannelId && (dto.kind !== 'OWN_CHANNELS' || !publisherChannelIds.includes(target.publisherChannelId)))
      throw new BadRequestException('Every unique invite link must use a selected publishing channel');
    if (
      linkById.get(target.inviteLinkId)?.telegramChannelId !==
      target.telegramChannelId
    )
      throw new BadRequestException(
        'Every invite link must belong to its promoted channel',
      );
  }
  const publicationPost = dto.publicationPost;
  const publisherPublications = publicationPost.publisherPublications;
  if (
    publisherPublications?.length
      ? publisherPublications.some(
          (publication) =>
            !publication.id ||
            !publication.placements.length ||
            !hasPostContent(publication.post),
        )
      : !hasPostContent(publicationPost)
  )
    throw new BadRequestException('Publication post is empty');
  const configuredPublisherPlacements = publisherPlacements(
    publicationPost,
    publisherChannelIds,
    dto.scheduledAt,
  );
  if (!configuredPublisherPlacements.length)
    throw new BadRequestException('Add at least one publishing slot');
  if (
    configuredPublisherPlacements.some(
      (placement) =>
        !publisherChannelIds.includes(placement.telegramChannelId) ||
        !Number.isFinite(Date.parse(placement.scheduledAt)),
    )
  )
    throw new BadRequestException(
      'Every publisher publication must use a selected channel and valid slot',
    );
  const configuredPost = publicationPost;
  const partnerPost = configuredPost.partnerPublicationPost;
  if (
    dto.kind === 'DIRECT_MUTUAL' &&
    partnerChannelIds.length &&
    dto.targets.some((target) => !target.promoId) &&
    !hasPostContent(partnerPost) &&
    !configuredPost.partnerPublications?.every(
      (publication) =>
        publication.id &&
        publication.placements.length &&
        hasPostContent(publication.post),
    )
  )
    throw new BadRequestException('Partner publication post is empty');
  return { publisherChannelIds, partnerChannelIds, links };
}
