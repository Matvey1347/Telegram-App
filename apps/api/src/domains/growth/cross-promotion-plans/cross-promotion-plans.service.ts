import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CrossPromotionPlacementPost,
  CrossPromotionTargetInput,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import {
  CreateCrossPromotionPlanDto,
  SaveCrossPromotionPlacementsDto,
} from './dto';
import { CrossPromotionPlanReadService } from './cross-promotion-plan-read.service';
import { TelegramInviteLinkRegistrationService } from '../../telegram/telegram-channels/telegram-invite-link-registration.service';
import { TelegramChannelsService } from '../../telegram/telegram-channels/telegram-channels.service';

type CounterBaseline = {
  inviteLinkId: string;
  joinedCount: number;
  requestedCount: number;
};
type SubscriberBaseline = {
  telegramChannelId: string;
  subscribersCount: number | null;
};
type ScheduledPlacement = {
  telegramChannelId: string;
  managedPostId: string;
  postGroupId?: string | null;
  publicationId?: string | null;
};
const json = <T>(value: unknown, fallback: T): T =>
  value && typeof value === 'object' ? (value as T) : fallback;

function nextPublisherDeletionAt(post: CrossPromotionPlacementPost) {
  const placements = post.publisherPublications?.length
    ? post.publisherPublications.flatMap((publication) => publication.placements)
    : (post.publisherPlacements ?? []);
  const timestamps = placements
    .flatMap((placement) => (placement.deleteAt ? [Date.parse(placement.deleteAt)] : []))
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > Date.now());
  return timestamps.length ? new Date(Math.min(...timestamps)) : null;
}

function firstLifecycleAt(dto: CreateCrossPromotionPlanDto) {
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

function firstPartnerPublicationAt(dto: CreateCrossPromotionPlanDto) {
  const timestamps = partnerPlacements(dto.publicationPost)
    .map((placement) => Date.parse(placement.scheduledAt))
    .filter(Number.isFinite);
  return timestamps.length ? new Date(Math.min(...timestamps)) : null;
}

function publisherPlacements(
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

function partnerPlacements(
  post: CrossPromotionPlacementPost,
): Array<{
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

@Injectable()
export class CrossPromotionPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly readService: CrossPromotionPlanReadService,
    private readonly inviteLinkRegistration: TelegramInviteLinkRegistrationService,
    private readonly telegramChannels: TelegramChannelsService,
  ) {}

  async refreshInviteLinkData(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const plan = await this.prisma.crossPromotionPlan.findFirst({
      where: { id, workspaceId },
    });
    if (!plan) throw new NotFoundException('Cross-promotion plan not found');
    const targets = json<CrossPromotionTargetInput[]>(plan.targets, []);
    const inviteLinkIds = this.unique(
      targets.map((target) => target.inviteLinkId),
    );
    const links = await this.prisma.telegramInviteLink.findMany({
      where: { workspaceId, id: { in: inviteLinkIds } },
      select: { telegramChannelId: true, url: true },
    });
    for (const link of links) {
      await this.inviteLinkRegistration.register(
        userId,
        link.telegramChannelId,
        link.url,
      );
    }
    const refreshed = await this.prisma.crossPromotionPlan.findFirstOrThrow({
      where: { id, workspaceId },
    });
    return this.readService.shape(workspaceId, refreshed);
  }

  private async workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private unique(ids: string[]) {
    return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  }

  private async validateInput(
    workspaceId: string,
    dto: CreateCrossPromotionPlanDto,
  ) {
    const publisherChannelIds = this.unique(dto.publisherChannelIds);
    const partnerChannelIds = this.unique(dto.partnerChannelIds);
    if (!publisherChannelIds.length)
      throw new BadRequestException('Select at least one publishing channel');
    if (partnerChannelIds.length && !dto.targets.length)
      throw new BadRequestException('Select at least one promoted channel');
    if (dto.advertiserId) {
      const advertiser = await this.prisma.telegramAdvertiser.findFirst({
        where: { id: dto.advertiserId, workspaceId },
        select: { id: true },
      });
      if (!advertiser)
        throw new NotFoundException('Partner CRM client is unavailable');
    }
    const targetChannelIds = this.unique(
      dto.targets.map((target) => target.telegramChannelId),
    );
    const allChannelIds = this.unique([
      ...publisherChannelIds,
      ...partnerChannelIds,
      ...targetChannelIds,
    ]);
    const channels = await this.prisma.telegramChannel.findMany({
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
      this.prisma.promo.findMany({
        where: {
          workspaceId,
          id: {
            in: this.unique(
              dto.targets.flatMap((target) =>
                target.promoId ? [target.promoId] : [],
              ),
            ),
          },
        },
        select: { id: true, telegramChannelId: true },
      }),
      this.prisma.telegramInviteLink.findMany({
        where: {
          workspaceId,
          id: {
            in: this.unique(dto.targets.map((target) => target.inviteLinkId)),
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
      if (!target.promoId && dto.kind !== 'DIRECT_MUTUAL')
        throw new BadRequestException('Every own-channel target needs a promo');
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

  async validateForScheduling(
    userId: string,
    dto: CreateCrossPromotionPlanDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.validateInput(workspaceId, dto);
  }

  async create(userId: string, dto: CreateCrossPromotionPlanDto) {
    const workspaceId = await this.workspace(userId);
    const normalized = await this.validateInput(workspaceId, dto);
    const publishers = await this.prisma.telegramChannel.findMany({
      where: { workspaceId, id: { in: normalized.publisherChannelIds } },
      select: { id: true, currentSubscribersCount: true },
    });
    const baselineTargetCounters: CounterBaseline[] = normalized.links.map(
      (link) => ({
        inviteLinkId: link.id,
        joinedCount: link.joinedCount,
        requestedCount: link.requestedCount,
      }),
    );
    const baselinePublisherSubscribers: SubscriberBaseline[] = publishers.map(
      (channel) => ({
        telegramChannelId: channel.id,
        subscribersCount: channel.currentSubscribersCount,
      }),
    );
    const scheduledAt = new Date(dto.scheduledAt);
    const openEarlierPlans = await this.prisma.crossPromotionPlan.findMany({
      where: {
        workspaceId,
        kind: dto.kind,
        trackingEndsAt: null,
        scheduledAt: { lt: scheduledAt },
      },
      select: { id: true, targets: true },
      take: 100,
    });
    const nextTargetIds = new Set(
      dto.targets.map((target) => target.telegramChannelId),
    );
    const closingIds = openEarlierPlans
      .filter((plan) =>
        json<CrossPromotionTargetInput[]>(plan.targets, []).some((target) =>
          nextTargetIds.has(target.telegramChannelId),
        ),
      )
      .map((plan) => plan.id);
    if (closingIds.length) {
      await this.prisma.crossPromotionPlan.updateMany({
        where: { workspaceId, id: { in: closingIds } },
        data: { trackingEndsAt: scheduledAt, status: 'COMPLETED' },
      });
    }
    const row = await this.prisma.crossPromotionPlan.create({
      data: {
        workspaceId,
        advertiserId: dto.advertiserId || null,
        createdByUserId: userId,
        kind: dto.kind,
        title: dto.title.trim(),
        publisherChannelIds: normalized.publisherChannelIds,
        partnerChannelIds: normalized.partnerChannelIds,
        targets: dto.targets as unknown as Prisma.InputJsonValue,
        publicationPost: dto.publicationPost,
        scheduledAt,
        trackingEndsAt: dto.trackingEndsAt
          ? new Date(dto.trackingEndsAt)
          : null,
        nextDueAt: firstLifecycleAt(dto),
        baselineTargetCounters,
        baselinePublisherSubscribers,
      },
    });
    return this.readService.shape(workspaceId, row);
  }

  async list(userId: string, kind?: string) {
    const workspaceId = await this.workspace(userId);
    const rows = await this.prisma.crossPromotionPlan.findMany({
      where: {
        workspaceId,
        kind:
          kind === 'DIRECT_MUTUAL' || kind === 'OWN_CHANNELS'
            ? kind
            : undefined,
      },
      orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return this.readService.shapeMany(workspaceId, rows);
  }

  async savePlacements(
    userId: string,
    id: string,
    dto: SaveCrossPromotionPlacementsDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const row = await this.prisma.crossPromotionPlan.findFirst({
      where: { id, workspaceId },
    });
    if (!row) throw new NotFoundException('Cross-promotion plan not found');
    const publisherIds = new Set(row.publisherChannelIds);
    if (
      dto.placements.some(
        (placement) => !publisherIds.has(placement.telegramChannelId),
      )
    )
      throw new BadRequestException(
        'Placement channel is not part of this plan',
      );
    const managedPosts = dto.placements.length
      ? await this.prisma.telegramManagedPost.count({
          where: {
            workspaceId,
            OR: dto.placements.map((placement) => ({
              id: placement.managedPostId,
              telegramChannelId: placement.telegramChannelId,
            })),
          },
        })
      : 0;
    if (managedPosts !== dto.placements.length)
      throw new BadRequestException(
        'One or more scheduled posts are unavailable',
      );
    const configuredPost = row.publicationPost as CrossPromotionPlacementPost;
    const expectedPlacements = publisherPlacements(
      configuredPost,
      row.publisherChannelIds,
      row.scheduledAt.toISOString(),
    ).length;
    const updated = await this.prisma.crossPromotionPlan.update({
      where: { id },
      data: {
        placementPostIds: dto.placements as unknown as Prisma.InputJsonValue,
        status:
          dto.placements.length === expectedPlacements ? 'SCHEDULED' : 'DRAFT',
        lastError: dto.lastError ?? null,
      },
    });
    notifyScheduledTaskDueWorkChanged('mutual_promotion.lifecycle');
    return this.readService.shape(workspaceId, updated);
  }

  async placementsForReschedule(
    userId: string,
    id: string,
    expectedStatus?: 'ACTIVE',
  ) {
    const workspaceId = await this.workspace(userId);
    const row = await this.prisma.crossPromotionPlan.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        placementPostIds: true,
      },
    });
    if (!row) throw new NotFoundException('Cross-promotion plan not found');
    if (row.status === 'CANCELLED') {
      throw new BadRequestException('Cancelled promotions cannot be edited');
    }
    if (expectedStatus && row.status !== expectedStatus) {
      throw new BadRequestException(
        'Only an active promotion can be replaced and published now',
      );
    }
    return json<ScheduledPlacement[]>(row.placementPostIds, []);
  }

  async replacePublicationPlacements(
    userId: string,
    id: string,
    publicationId: string,
    dto: CreateCrossPromotionPlanDto,
    replacements: ScheduledPlacement[],
    status: 'SCHEDULED' | 'ACTIVE',
  ) {
    const workspaceId = await this.workspace(userId);
    const row = await this.prisma.crossPromotionPlan.findFirst({
      where: { id, workspaceId, status: { not: 'CANCELLED' } },
      select: { placementPostIds: true },
    });
    if (!row) throw new NotFoundException('Cross-promotion plan not found');
    const placements = json<ScheduledPlacement[]>(row.placementPostIds, []);
    const updated = await this.prisma.crossPromotionPlan.update({
      where: { id },
      data: {
        publicationPost: dto.publicationPost,
        placementPostIds: [
          ...placements.filter((item) => item.publicationId !== publicationId),
          ...replacements,
        ] as unknown as Prisma.InputJsonValue,
        status,
        lastError: null,
      },
    });
    notifyScheduledTaskDueWorkChanged('mutual_promotion.lifecycle');
    return this.readService.shape(workspaceId, updated);
  }

  async resumeSchedulingContext(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const row = await this.prisma.crossPromotionPlan.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        status: true,
        kind: true,
        advertiserId: true,
        title: true,
        publisherChannelIds: true,
        partnerChannelIds: true,
        targets: true,
        publicationPost: true,
        scheduledAt: true,
        trackingEndsAt: true,
        placementPostIds: true,
      },
    });
    if (!row) throw new NotFoundException('Cross-promotion plan not found');
    if (row.status !== 'DRAFT') {
      throw new BadRequestException('Only an incomplete promotion can resume');
    }
    return {
      dto: {
        kind: row.kind,
        advertiserId: row.advertiserId,
        title: row.title,
        publisherChannelIds: row.publisherChannelIds,
        partnerChannelIds: row.partnerChannelIds,
        targets: json<CrossPromotionTargetInput[]>(row.targets, []),
        publicationPost:
          row.publicationPost as CreateCrossPromotionPlanDto['publicationPost'],
        scheduledAt: row.scheduledAt.toISOString(),
        trackingEndsAt: row.trackingEndsAt?.toISOString() ?? null,
      } satisfies CreateCrossPromotionPlanDto,
      placements: json<ScheduledPlacement[]>(row.placementPostIds, []),
    };
  }

  /**
   * Historical placements are attribution records, not scheduling jobs. Their
   * format can be corrected after the fact without recreating Telegram posts.
   */
  async updateCompleted(
    userId: string,
    id: string,
    dto: CreateCrossPromotionPlanDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.crossPromotionPlan.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        baselineTargetCounters: true,
        placementPostIds: true,
        publicationPost: true,
      },
    });
    if (!existing)
      throw new NotFoundException('Cross-promotion plan not found');
    if (
      existing.status === 'CANCELLED' ||
      existing.scheduledAt.getTime() > Date.now()
    ) {
      throw new BadRequestException(
        'Only historical promotions can be updated without rescheduling',
      );
    }
    const normalized = await this.validateInput(workspaceId, dto);
    const updatedPublisherPublications =
      dto.publicationPost.publisherPublications?.length
        ? dto.publicationPost.publisherPublications
        : [
            {
              id: 'legacy-publisher-publication',
              post: dto.publicationPost,
              placements: dto.publicationPost.publisherPlacements ?? [],
            },
          ];
    const storedPlacements = json<ScheduledPlacement[]>(
      existing.placementPostIds,
      [],
    );
    // Active direct exchanges already have real Telegram messages. Update
    // every linked message in place instead of treating the edit as metadata.
    // Completed history has no live publication to alter.
    if (existing.status === 'ACTIVE') {
      for (const placement of storedPlacements) {
        const publication =
          updatedPublisherPublications.find(
            (item) => item.id === placement.publicationId,
          ) ?? updatedPublisherPublications[0];
        if (!publication) continue;
        await this.telegramChannels.updateManagedPost(
          userId,
          placement.telegramChannelId,
          placement.managedPostId,
          {
            title: publication.post.title?.trim() || dto.title.trim(),
            text: publication.post.text ?? '',
            imageUrls: publication.post.imageUrls ?? [],
            mediaItems: publication.post.mediaItems ?? [],
            buttonRows: publication.post.buttonRows as never,
          },
        );
      }
    }
    const nextDeletionAt = nextPublisherDeletionAt(dto.publicationPost);
    const managedPosts = storedPlacements.length
      ? await this.prisma.telegramManagedPost.findMany({
          where: {
            workspaceId,
            id: { in: storedPlacements.map((placement) => placement.managedPostId) },
          },
          select: { id: true, telegramRemoteStatus: true },
        })
      : [];
    const hasLiveManagedPost = managedPosts.some(
      (post) => post.telegramRemoteStatus !== 'AUTO_DELETED',
    );
    const remainsActive = Boolean(nextDeletionAt || hasLiveManagedPost);
    const previousBaselines = new Map(
      json<CounterBaseline[]>(existing.baselineTargetCounters, []).map(
        (baseline) => [baseline.inviteLinkId, baseline],
      ),
    );
    const partnerPublicationAt = firstPartnerPublicationAt(dto);
    const baselineTargetCounters: CounterBaseline[] = normalized.links.map(
      (link) => {
        // If a dedicated link did not exist before the corrected partner
        // placement began, none of its counters can predate that placement.
        // The original baseline may have been captured later during a failed
        // historical re-schedule and must not erase genuine arrivals.
        if (
          partnerPublicationAt &&
          link.createdAt.getTime() >= partnerPublicationAt.getTime()
        ) {
          return { inviteLinkId: link.id, joinedCount: 0, requestedCount: 0 };
        }
        const previous = previousBaselines.get(link.id);
        return (
          previous ?? {
            inviteLinkId: link.id,
            joinedCount: link.joinedCount,
            requestedCount: link.requestedCount,
          }
        );
      },
    );
    const updated = await this.prisma.crossPromotionPlan.update({
      where: { id },
      data: {
        advertiserId: dto.advertiserId || null,
        kind: dto.kind,
        title: dto.title.trim(),
        publisherChannelIds: normalized.publisherChannelIds,
        partnerChannelIds: normalized.partnerChannelIds,
        targets: dto.targets as unknown as Prisma.InputJsonValue,
        publicationPost: dto.publicationPost,
        baselineTargetCounters,
        trackingEndsAt: dto.trackingEndsAt
          ? new Date(dto.trackingEndsAt)
          : null,
        status: remainsActive ? 'ACTIVE' : 'COMPLETED',
        nextDueAt: nextDeletionAt,
        lastError: null,
      },
    });
    return this.readService.shape(workspaceId, updated);
  }

  /**
   * A direct exchange is one commercial agreement even when its two sides
   * publish a different number of posts.  Older records represented every
   * extra post as another plan.  Merge their immutable history rather than
   * scheduling, deleting, or re-sending anything to Telegram.
   */
  async mergeHistorical(userId: string, id: string, sourcePlanId: string) {
    const workspaceId = await this.workspace(userId);
    if (!sourcePlanId || sourcePlanId === id) {
      throw new BadRequestException('Choose a different promotion to combine');
    }
    const [target, source] = await Promise.all(
      [id, sourcePlanId].map((planId) =>
        this.prisma.crossPromotionPlan.findFirst({
          where: { id: planId, workspaceId },
        }),
      ),
    );
    if (!target || !source) {
      throw new NotFoundException('Cross-promotion plan not found');
    }
    const now = Date.now();
    if (
      target.kind !== 'DIRECT_MUTUAL' ||
      source.kind !== 'DIRECT_MUTUAL' ||
      target.status === 'CANCELLED' ||
      source.status === 'CANCELLED' ||
      target.scheduledAt.getTime() > now ||
      source.scheduledAt.getTime() > now ||
      !target.advertiserId ||
      target.advertiserId !== source.advertiserId
    ) {
      throw new BadRequestException(
        'Only historical direct exchanges with the same CRM partner can be combined',
      );
    }

    const targetPost = target.publicationPost as CrossPromotionPlacementPost;
    const sourcePost = source.publicationPost as CrossPromotionPlacementPost;
    const publicationItems = (
      planId: string,
      post: CrossPromotionPlacementPost,
      side: 'publisherPublications' | 'partnerPublications',
      placements: 'publisherPlacements' | 'partnerPlacements',
    ) => {
      const items = post[side];
      if (items?.length) {
        return items.map((item, index) => ({
          ...item,
          id: `${planId}:${item.id || index + 1}`,
        }));
      }
      const fallbackPost =
        side === 'publisherPublications' ? post : post.partnerPublicationPost;
      const fallbackPlacements = post[placements] ?? [];
      return fallbackPost && fallbackPlacements.length
        ? [
            {
              id: `${planId}:${side}:1`,
              post: fallbackPost,
              placements: fallbackPlacements,
            },
          ]
        : [];
    };
    const targetPublisher = publicationItems(
      target.id,
      targetPost,
      'publisherPublications',
      'publisherPlacements',
    );
    const sourcePublisher = publicationItems(
      source.id,
      sourcePost,
      'publisherPublications',
      'publisherPlacements',
    );
    const targetPartner = publicationItems(
      target.id,
      targetPost,
      'partnerPublications',
      'partnerPlacements',
    );
    const sourcePartner = publicationItems(
      source.id,
      sourcePost,
      'partnerPublications',
      'partnerPlacements',
    );
    const targetPlacements = json<ScheduledPlacement[]>(
      target.placementPostIds,
      [],
    );
    const sourcePlacements = json<ScheduledPlacement[]>(
      source.placementPostIds,
      [],
    );
    const uniqueBy = <T>(items: T[], key: (item: T) => string) =>
      [...new Map(items.map((item) => [key(item), item])).values()];
    const combinedPost: CrossPromotionPlacementPost = {
      ...targetPost,
      publisherPublications: [...targetPublisher, ...sourcePublisher],
      partnerPublications: [...targetPartner, ...sourcePartner],
      publisherPlacements: [...targetPublisher, ...sourcePublisher].flatMap(
        (item) => item.placements,
      ),
      partnerPlacements: [...targetPartner, ...sourcePartner].flatMap(
        (item) => item.placements,
      ),
    };
    const combinedTargets = uniqueBy(
      [
        ...json<CrossPromotionTargetInput[]>(target.targets, []),
        ...json<CrossPromotionTargetInput[]>(source.targets, []),
      ],
      (item) => `${item.telegramChannelId}:${item.promoId ?? ''}:${item.inviteLinkId}`,
    );
    const combinedPlacements = uniqueBy(
      [...targetPlacements, ...sourcePlacements],
      (item) => item.managedPostId,
    );
    const combinedBaselines = uniqueBy(
      [
        ...json<CounterBaseline[]>(target.baselineTargetCounters, []),
        ...json<CounterBaseline[]>(source.baselineTargetCounters, []),
      ],
      (item) => item.inviteLinkId,
    );
    const combinedSubscribers = uniqueBy(
      [
        ...json<SubscriberBaseline[]>(target.baselinePublisherSubscribers, []),
        ...json<SubscriberBaseline[]>(source.baselinePublisherSubscribers, []),
      ],
      (item) => item.telegramChannelId,
    );
    const ends = [target.trackingEndsAt, source.trackingEndsAt].filter(
      (value): value is Date => Boolean(value),
    );
    const merged = await this.prisma.$transaction(async (tx) => {
      const row = await tx.crossPromotionPlan.update({
        where: { id: target.id },
        data: {
          publisherChannelIds: this.unique([
            ...target.publisherChannelIds,
            ...source.publisherChannelIds,
          ]),
          partnerChannelIds: this.unique([
            ...target.partnerChannelIds,
            ...source.partnerChannelIds,
          ]),
          targets: combinedTargets as unknown as Prisma.InputJsonValue,
          publicationPost: combinedPost as unknown as Prisma.InputJsonValue,
          placementPostIds: combinedPlacements as unknown as Prisma.InputJsonValue,
          baselineTargetCounters: combinedBaselines as unknown as Prisma.InputJsonValue,
          baselinePublisherSubscribers:
            combinedSubscribers as unknown as Prisma.InputJsonValue,
          scheduledAt: new Date(
            Math.min(target.scheduledAt.getTime(), source.scheduledAt.getTime()),
          ),
          trackingEndsAt: ends.length
            ? new Date(Math.max(...ends.map((value) => value.getTime())))
            : null,
          status: 'COMPLETED',
          nextDueAt: null,
          lastError: null,
        },
      });
      // No managed post is deleted: its id is now owned by the merged plan.
      await tx.crossPromotionPlan.delete({ where: { id: source.id } });
      return row;
    });
    return this.readService.shape(workspaceId, merged);
  }

  async rename(userId: string, id: string, title: string) {
    const workspaceId = await this.workspace(userId);
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      throw new BadRequestException('Promotion title is required');
    }
    const updated = await this.prisma.crossPromotionPlan.updateMany({
      where: { id, workspaceId, status: { not: 'CANCELLED' } },
      data: { title: normalizedTitle },
    });
    if (!updated.count) {
      throw new NotFoundException('Cross-promotion plan not found');
    }
    const row = await this.prisma.crossPromotionPlan.findFirst({
      where: { id, workspaceId },
    });
    if (!row) throw new NotFoundException('Cross-promotion plan not found');
    return this.readService.shape(workspaceId, row);
  }

  async markRescheduling(userId: string, id: string, lastError: string | null) {
    const workspaceId = await this.workspace(userId);
    const updated = await this.prisma.crossPromotionPlan.updateMany({
      where: { id, workspaceId },
      data: {
        status: 'DRAFT',
        placementPostIds: [],
        lastError,
      },
    });
    if (!updated.count)
      throw new NotFoundException('Cross-promotion plan not found');
  }

  async replaceScheduled(
    userId: string,
    id: string,
    dto: CreateCrossPromotionPlanDto,
    placements: ScheduledPlacement[],
    status: 'SCHEDULED' | 'ACTIVE' = 'SCHEDULED',
  ) {
    const workspaceId = await this.workspace(userId);
    const normalized = await this.validateInput(workspaceId, dto);
    const publishers = await this.prisma.telegramChannel.findMany({
      where: { workspaceId, id: { in: normalized.publisherChannelIds } },
      select: { id: true, currentSubscribersCount: true },
    });
    const row = await this.prisma.crossPromotionPlan.update({
      where: { id, workspaceId },
      data: {
        advertiserId: dto.advertiserId || null,
        kind: dto.kind,
        title: dto.title.trim(),
        publisherChannelIds: normalized.publisherChannelIds,
        partnerChannelIds: normalized.partnerChannelIds,
        targets: dto.targets as unknown as Prisma.InputJsonValue,
        publicationPost: dto.publicationPost,
        scheduledAt: new Date(dto.scheduledAt),
        trackingEndsAt: dto.trackingEndsAt
          ? new Date(dto.trackingEndsAt)
          : null,
        nextDueAt: firstLifecycleAt(dto),
        baselineTargetCounters: normalized.links.map((link) => ({
          inviteLinkId: link.id,
          joinedCount: link.joinedCount,
          requestedCount: link.requestedCount,
        })),
        baselinePublisherSubscribers: publishers.map((channel) => ({
          telegramChannelId: channel.id,
          subscribersCount: channel.currentSubscribersCount,
        })),
        placementPostIds: placements,
        status,
        lastError: null,
      },
    });
    notifyScheduledTaskDueWorkChanged('mutual_promotion.lifecycle');
    return this.readService.shape(workspaceId, row);
  }

  async remove(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const row = await this.prisma.crossPromotionPlan.findFirst({
      where: { id, workspaceId },
      select: { id: true, workspaceId: true, placementPostIds: true },
    });
    if (!row) throw new NotFoundException('Cross-promotion plan not found');
    const placements = json<
      Array<{ telegramChannelId: string; managedPostId: string }>
    >(row.placementPostIds, []);
    await this.prisma.$transaction(async (tx) => {
      await tx.telegramManagedPost.deleteMany({
        where: {
          workspaceId,
          id: { in: placements.map((placement) => placement.managedPostId) },
        },
      });
      await tx.crossPromotionPlan.delete({ where: { id: row.id } });
    });
    return { id: row.id };
  }

  async removalContext(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const row = await this.prisma.crossPromotionPlan.findFirst({
      where: { id, workspaceId },
      select: { id: true, placementPostIds: true },
    });
    if (!row) throw new NotFoundException('Cross-promotion plan not found');
    const placements = json<ScheduledPlacement[]>(row.placementPostIds, []);
    const remotePosts = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId,
        id: { in: placements.map((placement) => placement.managedPostId) },
        OR: [
          { status: 'PUBLISHED' },
          { telegramMessageIds: { isEmpty: false } },
          { telegramScheduledMessageIds: { isEmpty: false } },
          { telegramRemoteStatus: 'AUTO_DELETED' },
        ],
      },
      select: { id: true },
    });
    return { workspaceId, remotePostIds: remotePosts.map((post) => post.id) };
  }
}
