import { BadRequestException } from '@nestjs/common';
import { CrossPromotionPlan, Prisma } from '@prisma/client';
import type {
  CrossPromotionPlacementPost,
  CrossPromotionTargetInput,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { validatePlanInput } from './cross-promotion-plan-input';

type CounterBaseline = {
  inviteLinkId: string;
  joinedCount: number;
  requestedCount: number;
};

export async function crossPromotionTrackingPatch(
  prisma: PrismaService,
  plan: CrossPromotionPlan,
  targets?: CrossPromotionTargetInput[],
): Promise<
  Pick<
    Prisma.CrossPromotionPlanUpdateInput,
    'targets' | 'baselineTargetCounters'
  >
> {
  if (!targets) return {};
  if (
    plan.kind !== 'DIRECT_MUTUAL' ||
    !['SCHEDULED', 'ACTIVE', 'COMPLETED'].includes(plan.status)
  ) {
    throw new BadRequestException(
      'Tracking details can be updated on an existing direct exchange',
    );
  }
  const publicationPost = plan.publicationPost as CrossPromotionPlacementPost;
  const { links } = await validatePlanInput(prisma, plan.workspaceId, {
    kind: plan.kind,
    title: plan.title,
    publisherChannelIds: plan.publisherChannelIds,
    partnerChannelIds: plan.partnerChannelIds,
    scheduledAt: plan.scheduledAt.toISOString(),
    publicationPost,
    targets,
  });
  const baselines = new Map(
    ((plan.baselineTargetCounters ?? []) as CounterBaseline[]).map((row) => [
      row.inviteLinkId,
      row,
    ]),
  );
  const earlierLinkIds = links.filter(
    (link) => !baselines.has(link.id) && link.createdAt < plan.scheduledAt,
  );
  const observations = earlierLinkIds.length
    ? await prisma.telegramInviteLinkSnapshot.findMany({
        where: {
          workspaceId: plan.workspaceId,
          inviteLinkId: { in: earlierLinkIds.map(({ id }) => id) },
          syncedAt: { lte: plan.scheduledAt },
          joinedCount: { not: null },
          requestedCount: { not: null },
        },
        distinct: ['inviteLinkId'],
        orderBy: [{ inviteLinkId: 'asc' }, { syncedAt: 'desc' }],
        select: { inviteLinkId: true, joinedCount: true, requestedCount: true },
      })
    : [];
  for (const observation of observations) {
    if (observation.joinedCount != null && observation.requestedCount != null) {
      baselines.set(observation.inviteLinkId, {
        ...observation,
        joinedCount: observation.joinedCount,
        requestedCount: observation.requestedCount,
      });
    }
  }
  return {
    targets: targets as unknown as Prisma.InputJsonValue,
    baselineTargetCounters: links.map(
      (link) =>
        baselines.get(link.id) ?? {
          inviteLinkId: link.id,
          joinedCount:
            link.createdAt >= plan.scheduledAt ? 0 : link.joinedCount,
          requestedCount:
            link.createdAt >= plan.scheduledAt ? 0 : link.requestedCount,
        },
    ),
  };
}
