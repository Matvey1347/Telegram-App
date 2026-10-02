import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { CrossPromotionPlanReadService } from './cross-promotion-plan-read.service';
import { SaveCrossPromotionPlanDraftDto } from './dto';

const postFallback = {
  title: '',
  text: '',
  imageUrls: [],
  buttonRows: [],
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const stringIds = (value: unknown) =>
  Array.isArray(value)
    ? [...new Set(value.map(asString).filter(Boolean))]
    : [];

const draftObject = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

@Injectable()
export class CrossPromotionPlanDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly readService: CrossPromotionPlanReadService,
  ) {}

  async save(
    userId: string,
    dto: SaveCrossPromotionPlanDraftDto,
    id?: string,
  ) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(
      userId,
    );
    const draft = draftObject(dto.draft);
    const post = draftObject(draft.post);
    const date = asString(draft.date);
    const time = asString(draft.time) || '10:00';
    const parsedAt = date ? new Date(`${date}T${time}:00`) : null;
    const scheduledAt =
      parsedAt && Number.isFinite(parsedAt.getTime())
        ? parsedAt
        : new Date(Date.now() + 86_400_000);
    const publicationPost = {
      ...postFallback,
      ...post,
      // A draft preserves the form shape, not merely the schedule payload, so
      // it can be reopened identically from another device.
      formDraft: dto.draft,
    } as Prisma.InputJsonValue;
    const data = {
      kind: dto.kind,
      title: asString(draft.title) || 'Untitled mutual promotion',
      publisherChannelIds: stringIds(draft.publisherIds),
      partnerChannelIds: stringIds(draft.partnerIds),
      targets: (Array.isArray(draft.targets) ? draft.targets : []) as Prisma.InputJsonValue,
      publicationPost,
      scheduledAt,
      trackingEndsAt: null,
      nextDueAt: null,
      baselineTargetCounters: [] as Prisma.InputJsonValue,
      baselinePublisherSubscribers: [] as Prisma.InputJsonValue,
      placementPostIds: [] as Prisma.InputJsonValue,
      status: 'DRAFT' as const,
      lastError: null,
    };

    if (id) {
      const existing = await this.prisma.crossPromotionPlan.findFirst({
        where: { id, workspaceId, status: 'DRAFT' },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Saved draft is unavailable');
      const row = await this.prisma.crossPromotionPlan.update({
        where: { id: existing.id },
        data,
      });
      return this.readService.shape(workspaceId, row);
    }

    const row = await this.prisma.crossPromotionPlan.create({
      data: { ...data, workspaceId, createdByUserId: userId },
    });
    return this.readService.shape(workspaceId, row);
  }
}
