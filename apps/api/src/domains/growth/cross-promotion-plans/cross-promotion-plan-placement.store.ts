import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CrossPromotionPlacementPost,
  CrossPromotionTargetInput,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import {
  CreateCrossPromotionPlanDto,
  SaveCrossPromotionPlacementsDto,
} from './dto';
import { CrossPromotionPlanReadService } from './cross-promotion-plan-read.service';
import { CrossPromotionPublicationPostResolverService } from './cross-promotion-publication-post-resolver.service';
import { publisherPlacements } from './cross-promotion-plan-input';
import type { ScheduledPost as ScheduledPlacement } from './cross-promotion-placement-input';

const acceptedStatuses = new Set(['SCHEDULED', 'PUBLISHING', 'PUBLISHED']);

const json = <T>(value: unknown, fallback: T): T =>
  value && typeof value === 'object' ? (value as T) : fallback;

export class CrossPromotionPlanPlacementStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readService: CrossPromotionPlanReadService,
    private readonly publicationPostResolver: CrossPromotionPublicationPostResolverService,
  ) {}

  async savePlacements(
    workspaceId: string,
    id: string,
    dto: SaveCrossPromotionPlacementsDto,
  ) {
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
      ? await this.prisma.telegramManagedPost.findMany({
          where: {
            workspaceId,
            OR: dto.placements.map((placement) => ({
              id: placement.managedPostId,
              telegramChannelId: placement.telegramChannelId,
            })),
          },
          select: { status: true },
        })
      : [];
    if (managedPosts.length !== dto.placements.length)
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
          expectedPlacements > 0 && managedPosts.length === expectedPlacements &&
          managedPosts.every(({ status }) => acceptedStatuses.has(status)) ? 'SCHEDULED' : 'DRAFT',
        lastError: dto.lastError ?? null,
      },
    });
    notifyScheduledTaskDueWorkChanged('mutual_promotion.lifecycle');
    return this.readService.shape(workspaceId, updated);
  }

  async placementsForReschedule(
    workspaceId: string,
    id: string,
    expectedStatus?: 'ACTIVE',
  ) {
    const row = await this.prisma.crossPromotionPlan.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        scheduledAt: true,
        placementPostIds: true,
      },
    });
    if (!row) throw new NotFoundException('Cross-promotion plan not found');
    if (row.status === 'CANCELLED') {
      throw new BadRequestException('Cancelled promotions cannot be edited');
    }
    if (row.status === 'RESCHEDULING') {
      const interruptedBefore = new Date(Date.now() - 5 * 60_000);
      if (row.updatedAt >= interruptedBefore) {
        throw new BadRequestException(
          'This promotion is already being rescheduled',
        );
      }
    }
    if (expectedStatus && row.status !== expectedStatus) {
      throw new BadRequestException(
        'Only an active promotion can be replaced and published now',
      );
    }
    const placements = json<ScheduledPlacement[]>(row.placementPostIds, []);
    if (!placements.length) return placements;
    const existingPosts = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId,
        id: { in: placements.map((placement) => placement.managedPostId) },
      },
      select: { id: true },
    });
    const existingIds = new Set(existingPosts.map((post) => post.id));
    return placements.filter((placement) =>
      existingIds.has(placement.managedPostId),
    );
  }

  async claimRescheduling(workspaceId: string, id: string) {
    const interruptedBefore = new Date(Date.now() - 5 * 60_000);
    const claimed = await this.prisma.crossPromotionPlan.updateMany({
      where: {
        id,
        workspaceId,
        OR: [
          { status: { in: ['DRAFT', 'SCHEDULED', 'ACTIVE'] } },
          { status: 'RESCHEDULING', updatedAt: { lt: interruptedBefore } },
        ],
      },
      data: { status: 'RESCHEDULING', lastError: null },
    });
    if (!claimed.count) {
      throw new BadRequestException(
        'This promotion is already being changed or can no longer be rescheduled',
      );
    }
  }

  async appendReschedulingPlacement(
    workspaceId: string,
    id: string,
    placement: ScheduledPlacement,
  ) {
    const row = await this.prisma.crossPromotionPlan.findFirst({
      where: { id, workspaceId, status: 'RESCHEDULING' },
      select: { placementPostIds: true },
    });
    if (!row)
      throw new BadRequestException('Promotion reschedule was interrupted');
    const placements = json<ScheduledPlacement[]>(row.placementPostIds, []);
    if (
      placements.some((item) => item.managedPostId === placement.managedPostId)
    )
      return;
    await this.prisma.crossPromotionPlan.updateMany({
      where: { id, workspaceId, status: 'RESCHEDULING' },
      data: {
        placementPostIds: [
          ...placements,
          placement,
        ] as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async publicationScheduleForUpdate(
    workspaceId: string,
    id: string,
    publicationId: string,
  ) {
    const row = await this.prisma.crossPromotionPlan.findFirst({
      where: { id, workspaceId, status: { not: 'CANCELLED' } },
      select: { publicationPost: true },
    });
    if (!row) throw new NotFoundException('Cross-promotion plan not found');
    const post = json<CrossPromotionPlacementPost>(row.publicationPost, {
      title: '',
      text: '',
      imageUrls: [],
      buttonRows: [],
    });
    const publication = post.publisherPublications?.find(
      (item) => item.id === publicationId,
    );
    if (!publication)
      throw new NotFoundException('Partner post publication not found');
    return publication.placements.map((placement) => ({
      telegramChannelId: placement.telegramChannelId,
      scheduledAt: placement.scheduledAt,
    }));
  }

  async managedPostsForPublicationUpdate(
    workspaceId: string,
    id: string,
    publicationId: string,
  ) {
    const row = await this.prisma.crossPromotionPlan.findFirst({
      where: { id, workspaceId, status: { not: 'CANCELLED' } },
      select: { placementPostIds: true, publicationPost: true },
    });
    if (!row) throw new NotFoundException('Cross-promotion plan not found');
    return this.publicationPostResolver.resolve({
      workspaceId,
      placementPostIds: row.placementPostIds,
      publicationPost: row.publicationPost,
      publicationId,
    });
  }

  async replacePublicationPlacements(
    workspaceId: string,
    id: string,
    publicationId: string,
    dto: CreateCrossPromotionPlanDto,
    replacements: ScheduledPlacement[],
    status: 'SCHEDULED' | 'ACTIVE',
  ) {
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
        ],
        status,
        lastError: null,
      },
    });
    notifyScheduledTaskDueWorkChanged('mutual_promotion.lifecycle');
    return this.readService.shape(workspaceId, updated);
  }

  async replacePublicationChannelPlacement(
    workspaceId: string,
    id: string,
    publicationId: string,
    channelId: string,
    dto: CreateCrossPromotionPlanDto,
    replacement: ScheduledPlacement,
    status: 'SCHEDULED' | 'ACTIVE',
  ) {
    const row = await this.prisma.crossPromotionPlan.findFirst({
      where: { id, workspaceId, status: { not: 'CANCELLED' } },
      select: { placementPostIds: true, publicationPost: true },
    });
    if (!row) throw new NotFoundException('Cross-promotion plan not found');
    const currentPost = json<CrossPromotionPlacementPost>(row.publicationPost, {
      title: '',
      text: '',
      imageUrls: [],
      buttonRows: [],
    });
    const nextPublication = dto.publicationPost.publisherPublications?.find(
      (publication) => publication.id === publicationId,
    );
    const nextPlacement = nextPublication?.placements.find(
      (placement) => placement.telegramChannelId === channelId,
    );
    if (!nextPublication || !nextPlacement)
      throw new BadRequestException('Partner-post channel placement not found');
    const currentPublication = currentPost.publisherPublications?.find(
      (publication) => publication.id === publicationId,
    );
    if (!currentPublication)
      throw new NotFoundException('Partner post publication not found');
    const publicationPost = {
      ...currentPost,
      publisherPublications: currentPost.publisherPublications?.map(
        (publication) =>
          publication.id !== publicationId
            ? publication
            : {
                ...publication,
                placements: publication.placements.map((placement) =>
                  placement.telegramChannelId === channelId
                    ? nextPlacement
                    : placement,
                ),
              },
      ),
    };
    const placements = json<ScheduledPlacement[]>(row.placementPostIds, []);
    const updated = await this.prisma.crossPromotionPlan.update({
      where: { id },
      data: {
        publicationPost,
        placementPostIds: [
          ...placements.filter(
            (placement) =>
              placement.publicationId !== publicationId ||
              placement.telegramChannelId !== channelId,
          ),
          replacement,
        ],
        status,
        lastError: null,
      },
    });
    notifyScheduledTaskDueWorkChanged('mutual_promotion.lifecycle');
    return this.readService.shape(workspaceId, updated);
  }

  async resumeSchedulingContext(workspaceId: string, id: string) {
    const row = await this.prisma.crossPromotionPlan.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        status: true,
        kind: true,
        advertiserId: true,
        partnerTelegramUsername: true,
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
    const placements = json<ScheduledPlacement[]>(row.placementPostIds, []);
    const existing = placements.length ? await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId,
        OR: placements.map(({ managedPostId, telegramChannelId }) => ({ id: managedPostId, telegramChannelId })),
      },
      select: { id: true, status: true },
    }) : [];
    const statusById = new Map(existing.map((post) => [post.id, post.status]));
    const pending = placements.filter(({ managedPostId }) => statusById.get(managedPostId) === 'DRAFT');
    if (existing.some(({ status }) => status !== 'DRAFT' && !acceptedStatuses.has(status))) {
      throw new BadRequestException('Check the failed Telegram publication before resuming this promotion');
    }
    return {
      dto: {
        kind: row.kind,
        advertiserId: row.advertiserId,
        partnerTelegramUsername: row.partnerTelegramUsername,
        title: row.title,
        publisherChannelIds: row.publisherChannelIds,
        partnerChannelIds: row.partnerChannelIds,
        targets: json<CrossPromotionTargetInput[]>(row.targets, []),
        publicationPost:
          row.publicationPost as CreateCrossPromotionPlanDto['publicationPost'],
        scheduledAt: row.scheduledAt.toISOString(),
        trackingEndsAt: row.trackingEndsAt?.toISOString() ?? null,
      } satisfies CreateCrossPromotionPlanDto,
      placements: placements.filter(({ managedPostId }) => statusById.has(managedPostId)),
      pendingPostIds: new Set(pending.map(({ managedPostId }) => managedPostId)),
    };
  }
}
