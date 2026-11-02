import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramLeadPolicy } from './lead-policy.service';
import { reciprocalPromotion } from './lead-reciprocity';
import { leadIdentityUnverified } from './lead-source-reference';
import { LEAD_DISCOVERY_VERSION } from './lead-analysis-version';
import type { LeadPromotionView } from '@telegram-system/shared';

/** Batch-read current evidence; revoked, edited or rebound evidence is never presented as current. */
export async function loadLeadPromotionViews(
  prisma: PrismaService,
  policy: TelegramLeadPolicy,
  workspaceId: string,
  observationIds: string[],
) {
  const select = {
    id: true,
    workspaceId: true,
    sourceId: true,
    targetSourceId: true,
    sourceChannelId: true,
    targetChannelId: true,
    sourceBindingRevision: true,
    targetBindingRevision: true,
    observationId: true,
    observationHash: true,
    publishedAt: true,
    evidence: true,
    verificationStatus: true,
    classificationVersion: true,
    pairedObservationId: true,
    pairedPublishedAt: true,
    observation: {
      select: {
        contentHash: true,
        classificationVersion: true,
        originalStatus: true,
        reviewStatus: true,
        expiresAt: true,
        messageUrl: true,
        classification: true,
      },
    },
  } as const;
  const rows = await prisma.telegramLeadPromotion.findMany({
    where: { workspaceId, observationId: { in: observationIds } },
    select,
  });
  if (!rows.length) return new Map<string, LeadPromotionView>();
  const pairIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.pairedObservationId ? [row.pairedObservationId] : [],
      ),
    ),
  ];
  const pairs = pairIds.length
    ? await prisma.telegramLeadPromotion.findMany({
        where: { workspaceId, observationId: { in: pairIds } },
        select,
      })
    : [];
  const all = [...rows, ...pairs];
  const sourceIds = [
    ...new Set(all.flatMap((row) => [row.sourceId, row.targetSourceId])),
  ];
  const sources = await prisma.telegramLeadSource.findMany({
    where: { workspaceId, id: { in: sourceIds } },
  });
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const valid = (row: (typeof rows)[number]) => {
    const source = sourceMap.get(row.sourceId),
      target = sourceMap.get(row.targetSourceId);
    return Boolean(
      source &&
      target &&
      source.channelId === row.sourceChannelId &&
      target.channelId === row.targetChannelId &&
      source.bindingRevision === row.sourceBindingRevision &&
      target.bindingRevision === row.targetBindingRevision &&
      source.monitoringState === 'ACTIVE' &&
      target.monitoringState === 'ACTIVE' &&
      !leadIdentityUnverified(source) &&
      !leadIdentityUnverified(target) &&
      source.monitoringActorUserId === target.monitoringActorUserId &&
      policy.granted(source, 'ai') &&
      policy.granted(target, 'ingest') &&
      row.observation.contentHash === row.observationHash &&
      row.observation.classificationVersion === row.classificationVersion &&
      row.classificationVersion === LEAD_DISCOVERY_VERSION &&
      row.observation.originalStatus === 'OBSERVED' &&
      row.observation.reviewStatus !== 'REJECTED' &&
      row.observation.expiresAt > new Date(),
    );
  };
  const result = new Map<string, LeadPromotionView>();
  for (const row of rows) {
    if (!valid(row)) continue;
    const reverse = pairs.find(
      (item) => item.observationId === row.pairedObservationId,
    );
    const paired =
      reverse &&
      valid(reverse) &&
      reverse.pairedObservationId === row.observationId &&
      row.verificationStatus === 'RECIPROCAL_PROMOTION_EVIDENCED' &&
      reverse.verificationStatus === 'RECIPROCAL_PROMOTION_EVIDENCED' &&
      reciprocalPromotion(
        {
          postId: row.observationId,
          sourceChannelId: row.sourceChannelId,
          targetChannelId: row.targetChannelId,
          publishedAt: row.publishedAt.toISOString(),
          creativeHash: row.observationHash,
          promotionVerified: true,
          catalog: false,
        },
        {
          postId: reverse.observationId,
          sourceChannelId: reverse.sourceChannelId,
          targetChannelId: reverse.targetChannelId,
          publishedAt: reverse.publishedAt.toISOString(),
          creativeHash: reverse.observationHash,
          promotionVerified: true,
          catalog: false,
        },
      );
    const classification = row.observation.classification as {
      classification?: string;
    } | null;
    result.set(row.observationId, {
      status: paired
        ? 'RECIPROCAL_PROMOTION_EVIDENCED'
        : classification?.classification === 'MUTUAL_PROMOTION'
          ? 'POSSIBLE_VP'
          : 'AD',
      sourceChannelId: row.sourceChannelId,
      targetChannelId: row.targetChannelId,
      publishedAt: row.publishedAt.toISOString(),
      verificationStatus: paired
        ? 'RECIPROCAL_PROMOTION_EVIDENCED'
        : 'PROMOTION_VERIFIED',
      classificationVersion: row.classificationVersion,
      evidence: Array.isArray(row.evidence)
        ? row.evidence.filter(
            (item): item is string => typeof item === 'string',
          )
        : [],
      reciprocal:
        paired && reverse
          ? {
              observationId: reverse.observationId,
              publishedAt: reverse.publishedAt.toISOString(),
              messageUrl: reverse.observation.messageUrl,
            }
          : null,
    });
  }
  return result;
}
