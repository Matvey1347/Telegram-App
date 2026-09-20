import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CrossPromotionTargetInput } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import {
  CreateCrossPromotionPlanDto,
  SaveCrossPromotionPlacementsDto,
} from './dto';
import { CrossPromotionPlanReadService } from './cross-promotion-plan-read.service';

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
};
const json = <T>(value: unknown, fallback: T): T =>
  value && typeof value === 'object' ? (value as T) : fallback;

function firstLifecycleAt(dto: CreateCrossPromotionPlanDto) {
  const timestamps = [
    ...(dto.publicationPost.publisherPlacements ?? []),
    ...(dto.publicationPost.partnerPlacements ?? []),
  ]
    .flatMap((placement) => [placement.scheduledAt, placement.deleteAt])
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  return timestamps.length ? new Date(Math.min(...timestamps)) : null;
}

function firstPartnerPublicationAt(dto: CreateCrossPromotionPlanDto) {
  const timestamps = (dto.publicationPost.partnerPlacements ?? [])
    .map((placement) => Date.parse(placement.scheduledAt))
    .filter(Number.isFinite);
  return timestamps.length ? new Date(Math.min(...timestamps)) : null;
}

@Injectable()
export class CrossPromotionPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly readService: CrossPromotionPlanReadService,
  ) {}

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
    if (!dto.targets.length)
      throw new BadRequestException('Select at least one promoted channel');
    if (dto.kind === 'DIRECT_MUTUAL' && !partnerChannelIds.length)
      throw new BadRequestException('Select at least one partner channel');
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
    if (
      !publicationPost?.text?.trim() &&
      !publicationPost?.imageUrls?.length &&
      !publicationPost?.mediaItems?.length
    )
      throw new BadRequestException('Publication post is empty');
    const configuredPost = publicationPost;
    const partnerPost = configuredPost.partnerPublicationPost;
    if (
      dto.kind === 'DIRECT_MUTUAL' &&
      dto.targets.some((target) => !target.promoId) &&
      !partnerPost?.text?.trim() &&
      !partnerPost?.imageUrls?.length &&
      !partnerPost?.mediaItems?.length
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
    const updated = await this.prisma.crossPromotionPlan.update({
      where: { id },
      data: {
        placementPostIds: dto.placements as unknown as Prisma.InputJsonValue,
        status:
          dto.placements.length === row.publisherChannelIds.length
            ? 'SCHEDULED'
            : 'DRAFT',
        lastError: dto.lastError ?? null,
      },
    });
    notifyScheduledTaskDueWorkChanged('mutual_promotion.lifecycle');
    return this.readService.shape(workspaceId, updated);
  }

  async placementsForReschedule(userId: string, id: string) {
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
    return json<ScheduledPlacement[]>(row.placementPostIds, []);
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
        status: 'COMPLETED',
        nextDueAt: null,
        lastError: null,
      },
    });
    return this.readService.shape(workspaceId, updated);
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
        status: 'SCHEDULED',
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
