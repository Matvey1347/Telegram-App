import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CrossPromotionPlacementPost,
  CrossPromotionTargetInput,
} from '@telegram-system/shared';
import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import {
  CreateCrossPromotionPlanDto,
  SaveCrossPromotionPlacementsDto,
  UpdateCrossPromotionPlanDetailsDto,
} from './dto';
import { CrossPromotionPlanReadService } from './cross-promotion-plan-read.service';
import { TelegramInviteLinkRegistrationService } from '../../telegram/telegram-channels/telegram-invite-link-registration.service';
import { CrossPromotionPublicationPostResolverService } from './cross-promotion-publication-post-resolver.service';
import {
  publisherPlacements,
  validatePlanInput,
  normalizePlanIds,
  firstLifecycleAt,
  firstPartnerPublicationAt,
  nextPublisherDeletionAt,
} from './cross-promotion-plan-input';
import { crossPromotionTrackingPatch } from './cross-promotion-tracking-patch';
import type { ScheduledPost as ScheduledPlacement } from './cross-promotion-placement-input';
import { CrossPromotionPlanPlacementStore } from './cross-promotion-plan-placement.store';

type CounterBaseline = {
  inviteLinkId: string;
  joinedCount: number;
  requestedCount: number;
};

type SubscriberBaseline = {
  telegramChannelId: string;
  subscribersCount: number | null;
};

const json = <T>(value: unknown, fallback: T): T =>
  value && typeof value === 'object' ? (value as T) : fallback;

@Injectable()
export class CrossPromotionPlansService {
  private readonly placements: CrossPromotionPlanPlacementStore;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly readService: CrossPromotionPlanReadService,
    private readonly inviteLinkRegistration: TelegramInviteLinkRegistrationService,
    publicationPostResolver: CrossPromotionPublicationPostResolverService,
  ) {
    this.placements = new CrossPromotionPlanPlacementStore(
      prisma,
      readService,
      publicationPostResolver,
    );
  }

  async refreshInviteLinkData(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const plan = await this.prisma.crossPromotionPlan.findFirst({
      where: { id, workspaceId },
    });
    if (!plan) throw new NotFoundException('Cross-promotion plan not found');
    const targets = json<CrossPromotionTargetInput[]>(plan.targets, []);
    const inviteLinkIds = normalizePlanIds(
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

  async validateForScheduling(
    userId: string,
    dto: CreateCrossPromotionPlanDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await validatePlanInput(this.prisma, workspaceId, dto);
  }

  async create(userId: string, dto: CreateCrossPromotionPlanDto) {
    const workspaceId = await this.workspace(userId);
    const normalized = await validatePlanInput(this.prisma, workspaceId, dto);
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
    const row = await this.prisma.$transaction(async (tx) => {
      const title = dto.title.trim();
      await acquirePostgresTransactionLock(tx, `cross-promotion:${workspaceId}:${dto.kind}:${scheduledAt.toISOString()}`);
      const duplicate = await tx.crossPromotionPlan.findFirst({
        where: {
          workspaceId,
          kind: dto.kind,
          scheduledAt,
          title: { equals: title, mode: 'insensitive' },
          publisherChannelIds: { hasSome: normalized.publisherChannelIds },
          status: { not: 'CANCELLED' },
        },
        select: { status: true },
      });
      if (duplicate) {
        throw new ConflictException(duplicate.status === 'DRAFT'
          ? 'This promotion already exists. Continue scheduling from its draft.'
          : 'This promotion already exists for the selected time and channels.');
      }
      if (closingIds.length) {
        await tx.crossPromotionPlan.updateMany({
          where: { workspaceId, id: { in: closingIds } },
          data: { trackingEndsAt: scheduledAt, status: 'COMPLETED' },
        });
      }
      return tx.crossPromotionPlan.create({
        data: {
          workspaceId,
          advertiserId: dto.advertiserId || null,
          partnerTelegramUsername: dto.partnerTelegramUsername?.trim() || null,
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
    });
    notifyScheduledTaskDueWorkChanged('mutual_promotion.lifecycle');
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
    return this.placements.savePlacements(workspaceId, id, dto);
  }

  async placementsForReschedule(
    userId: string,
    id: string,
    expectedStatus?: 'ACTIVE',
  ) {
    const workspaceId = await this.workspace(userId);
    return this.placements.placementsForReschedule(
      workspaceId,
      id,
      expectedStatus,
    );
  }

  async claimRescheduling(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    return this.placements.claimRescheduling(workspaceId, id);
  }

  async appendReschedulingPlacement(
    userId: string,
    id: string,
    placement: ScheduledPlacement,
  ) {
    const workspaceId = await this.workspace(userId);
    return this.placements.appendReschedulingPlacement(
      workspaceId,
      id,
      placement,
    );
  }

  async publicationScheduleForUpdate(
    userId: string,
    id: string,
    publicationId: string,
  ) {
    const workspaceId = await this.workspace(userId);
    return this.placements.publicationScheduleForUpdate(
      workspaceId,
      id,
      publicationId,
    );
  }

  async managedPostsForPublicationUpdate(
    userId: string,
    id: string,
    publicationId: string,
  ) {
    const workspaceId = await this.workspace(userId);
    return this.placements.managedPostsForPublicationUpdate(
      workspaceId,
      id,
      publicationId,
    );
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
    return this.placements.replacePublicationPlacements(
      workspaceId,
      id,
      publicationId,
      dto,
      replacements,
      status,
    );
  }

  async replacePublicationChannelPlacement(
    userId: string,
    id: string,
    publicationId: string,
    channelId: string,
    dto: CreateCrossPromotionPlanDto,
    replacement: ScheduledPlacement,
    status: 'SCHEDULED' | 'ACTIVE',
  ) {
    const workspaceId = await this.workspace(userId);
    return this.placements.replacePublicationChannelPlacement(
      workspaceId,
      id,
      publicationId,
      channelId,
      dto,
      replacement,
      status,
    );
  }

  async resumeSchedulingContext(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    return this.placements.resumeSchedulingContext(workspaceId, id);
  }

  async updateDetails(
    userId: string,
    id: string,
    details: UpdateCrossPromotionPlanDetailsDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.crossPromotionPlan.findFirst({
      where: { id, workspaceId, status: { not: 'CANCELLED' } },
    });
    if (!existing)
      throw new NotFoundException('Cross-promotion plan not found');
    if (details.advertiserId) {
      const advertiser = await this.prisma.telegramAdvertiser.findFirst({
        where: { id: details.advertiserId, workspaceId },
        select: { id: true },
      });
      if (!advertiser)
        throw new NotFoundException('Partner CRM client is unavailable');
    }
    const updated = await this.prisma.crossPromotionPlan.update({
      where: { id, workspaceId },
      data: {
        ...await crossPromotionTrackingPatch(this.prisma, existing, details.targets),
        title: details.title.trim(),
        advertiserId: details.advertiserId || null,
        partnerTelegramUsername:
          details.partnerTelegramUsername?.trim() || null,
      },
    });
    return this.readService.shape(workspaceId, updated);
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
    const storedPlacements = json<ScheduledPlacement[]>(
      existing.placementPostIds,
      [],
    );
    if (
      existing.status === 'DRAFT' ||
      (existing.status === 'ACTIVE' && !storedPlacements.length)
    ) {
      throw new BadRequestException(
        'This promotion has no scheduled posts. Activate it to create the publications first',
      );
    }
    const normalized = await validatePlanInput(this.prisma, workspaceId, dto);
    const nextDeletionAt = nextPublisherDeletionAt(dto.publicationPost);
    const managedPosts = storedPlacements.length
      ? await this.prisma.telegramManagedPost.findMany({
          where: {
            workspaceId,
            id: {
              in: storedPlacements.map((placement) => placement.managedPostId),
            },
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
        partnerTelegramUsername: dto.partnerTelegramUsername?.trim() || null,
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
    const uniqueBy = <T>(items: T[], key: (item: T) => string) => [
      ...new Map(items.map((item) => [key(item), item])).values(),
    ];
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
      (item) =>
        `${item.telegramChannelId}:${item.promoId ?? ''}:${item.inviteLinkId}`,
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
          publisherChannelIds: normalizePlanIds([
            ...target.publisherChannelIds,
            ...source.publisherChannelIds,
          ]),
          partnerChannelIds: normalizePlanIds([
            ...target.partnerChannelIds,
            ...source.partnerChannelIds,
          ]),
          targets: combinedTargets,
          publicationPost: combinedPost,
          placementPostIds: combinedPlacements,
          baselineTargetCounters: combinedBaselines,
          baselinePublisherSubscribers: combinedSubscribers,
          scheduledAt: new Date(
            Math.min(
              target.scheduledAt.getTime(),
              source.scheduledAt.getTime(),
            ),
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
    const normalized = await validatePlanInput(this.prisma, workspaceId, dto);
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
