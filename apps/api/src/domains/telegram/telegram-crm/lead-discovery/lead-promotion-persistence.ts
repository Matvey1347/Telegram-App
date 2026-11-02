import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../../prisma/postgres-advisory-lock';
import { TelegramLeadPolicy } from './lead-policy.service';
import {
  lockLeadAnalysisClaim,
  type LeadAnalysisClaim,
} from './lead-analysis-claim';
import { LEAD_DISCOVERY_VERSION } from './lead-analysis-version';
import { leadHash } from './lead-normalization';
import { reciprocalPromotion } from './lead-reciprocity';
import { leadIdentityUnverified } from './lead-source-reference';

/** Persist only a literal, directed promotion of one currently authorized channel. */
export async function persistLeadPromotion(
  prisma: PrismaService,
  policy: TelegramLeadPolicy,
  claim: LeadAnalysisClaim,
) {
  await policy.recheckAi(claim.actorUserId, claim.sourceId);
  return prisma.$transaction(async (tx) => {
    await acquirePostgresTransactionLock(
      tx,
      `lead-discovery:${claim.workspaceId}`,
    );
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "TelegramLeadSource" WHERE id=${claim.sourceId} AND "workspaceId"=${claim.workspaceId} FOR UPDATE`,
    );
    const source = await tx.telegramLeadSource.findFirst({
      where: { id: claim.sourceId, workspaceId: claim.workspaceId },
    });
    if (
      !source ||
      source.bindingRevision !== claim.bindingRevision ||
      !source.channelId ||
      leadIdentityUnverified(source) ||
      !/^\d{1,20}$/.test(source.channelId)
    )
      return;
    policy.assertProcessing(source, 'ai', true);
    await lockLeadAnalysisClaim(tx, claim);
    const observation = await tx.telegramLeadObservation.findFirstOrThrow({
      where: {
        id: claim.observationId,
        workspaceId: claim.workspaceId,
        sourceId: claim.sourceId,
        contentHash: claim.contentHash,
      },
    });
    const queue = await tx.telegramLeadAnalysisQueue.findUniqueOrThrow({
      where: { id: claim.id },
    });
    const classification = observation.classification as {
      classification?: unknown;
      evidence?: unknown;
    } | null;
    if (
      observation.classificationVersion !== LEAD_DISCOVERY_VERSION ||
      !['ADVERTISEMENT', 'MUTUAL_PROMOTION'].includes(
        String(classification?.classification),
      ) ||
      !['LIKELY_AD', 'LIKELY_VP'].includes(queue.prefilterDecision ?? '') ||
      !observation.metadataComplete
    )
      return;
    // A list or multiple referenced projects is not proof that this post promotes one of them.
    if (
      /(?:подборк[аиу]|каталог|список\s+канал|channel\s+catalog|channel\s+list)/iu.test(
        observation.text,
      )
    )
      return;
    const targets = Array.isArray(queue.prefilterTargets)
      ? (queue.prefilterTargets as unknown[])
      : [];
    const refs = targets.flatMap((item) =>
      item && typeof item === 'object'
        ? [
            item as {
              kind?: unknown;
              value?: unknown;
              confidence?: unknown;
              origin?: unknown;
            },
          ]
        : [],
    );
    if (
      refs.some((item) =>
        ['PUBLIC_URL', 'PRIVATE_INVITE'].includes(String(item.kind)),
      )
    )
      return;
    const ids = [
      ...new Set(
        refs.flatMap((item) =>
          item.kind === 'TELEGRAM_CHANNEL_ID' &&
          item.confidence === 'CANONICAL' &&
          item.origin !== 'FORWARD' &&
          typeof item.value === 'string' &&
          /^\d{1,20}$/.test(item.value)
            ? [item.value]
            : [],
        ),
      ),
    ];
    if (ids.length !== 1 || ids[0] === source.channelId) return;
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "TelegramLeadSource" WHERE "workspaceId"=${claim.workspaceId} AND "channelId"=${ids[0]} FOR SHARE`,
    );
    const target = await tx.telegramLeadSource.findFirst({
      where: {
        workspaceId: claim.workspaceId,
        channelId: ids[0],
        accessType: 'SUBSCRIBED_CHANNEL',
        monitoringState: 'ACTIVE',
        monitoringActorUserId: claim.actorUserId,
      },
    });
    if (
      !target?.username ||
      leadIdentityUnverified(target) ||
      !/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(target.username) ||
      !policy.granted(target, 'ingest')
    )
      return;
    if (
      refs.some(
        (item) =>
          item.kind === 'TELEGRAM_USERNAME' &&
          item.value !== target.username!.toLowerCase(),
      )
    )
      return;
    const targetPattern = new RegExp(
      `(^|[^A-Za-z0-9_])(?:@|(?:https?:\\/\\/)?(?:t\\.me|telegram\\.me)\\/)${target.username}(?![A-Za-z0-9_])`,
      'iu',
    );
    const evidence = Array.isArray(classification?.evidence)
      ? classification.evidence.filter(
          (value): value is string =>
            typeof value === 'string' && observation.text.includes(value),
        )
      : [];
    const supporting = evidence.filter(
      (value) =>
        targetPattern.test(value) &&
        /(?:реклам|спонсор|промокод|взаимопиар|взаємопіар|взаимный\s+пиар|взаємний\s+піар|advertis|sponsor|mutual\s+promotion)/iu.test(
          value,
        ) &&
        /(?:підписуйт|подписывайт|переходьте|переходите|subscribe|follow|join)/iu.test(
          value,
        ),
    );
    if (!supporting.length || !targetPattern.test(observation.text)) return;
    const key = {
      workspaceId_observationId: {
        workspaceId: claim.workspaceId,
        observationId: observation.id,
      },
    };
    const old = await tx.telegramLeadPromotion.findUnique({ where: key });
    const base = {
      workspaceId: claim.workspaceId,
      sourceId: source.id,
      targetSourceId: target.id,
      sourceChannelId: source.channelId,
      targetChannelId: target.channelId!,
      sourceBindingRevision: source.bindingRevision,
      targetBindingRevision: target.bindingRevision,
      observationId: observation.id,
      observationHash: observation.contentHash,
      publishedAt: observation.publishedAt,
      evidence: supporting,
      verificationStatus: 'PROMOTION_VERIFIED',
      classificationVersion: LEAD_DISCOVERY_VERSION,
    };
    const same =
      old &&
      old.observationHash === base.observationHash &&
      old.sourceBindingRevision === base.sourceBindingRevision &&
      old.targetBindingRevision === base.targetBindingRevision &&
      old.targetChannelId === base.targetChannelId &&
      old.classificationVersion === base.classificationVersion;
    let forward = same
      ? old
      : await tx.telegramLeadPromotion.upsert({
          where: key,
          create: base,
          update: {
            ...base,
            pairedObservationId: null,
            pairedPublishedAt: null,
          },
        });
    const start = new Date(observation.publishedAt.getTime() - 7 * 86400000),
      end = new Date(observation.publishedAt.getTime() + 7 * 86400000);
    const reverseRows = await tx.telegramLeadPromotion.findMany({
      where: {
        workspaceId: claim.workspaceId,
        sourceChannelId: target.channelId!,
        targetChannelId: source.channelId,
        sourceId: target.id,
        targetSourceId: source.id,
        sourceBindingRevision: target.bindingRevision,
        targetBindingRevision: source.bindingRevision,
        verificationStatus: {
          in: ['PROMOTION_VERIFIED', 'RECIPROCAL_PROMOTION_EVIDENCED'],
        },
        classificationVersion: LEAD_DISCOVERY_VERSION,
        publishedAt: { gte: start, lte: end },
      },
      include: {
        observation: {
          select: {
            contentHash: true,
            classificationVersion: true,
            originalStatus: true,
            reviewStatus: true,
            expiresAt: true,
          },
        },
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
      take: 100,
    });
    if (forward.pairedObservationId) {
      const previous = reverseRows.find(
        (item) => item.observationId === forward.pairedObservationId,
      );
      if (
        !previous ||
        previous.pairedObservationId !== forward.observationId ||
        previous.observation.contentHash !== previous.observationHash ||
        previous.observation.classificationVersion !==
          previous.classificationVersion ||
        previous.observation.originalStatus !== 'OBSERVED' ||
        previous.observation.reviewStatus === 'REJECTED' ||
        previous.observation.expiresAt <= new Date() ||
        !policy.granted(target, 'ai')
      ) {
        forward = await tx.telegramLeadPromotion.update({
          where: { id: forward.id },
          data: {
            pairedObservationId: null,
            pairedPublishedAt: null,
            verificationStatus: 'PROMOTION_VERIFIED',
          },
        });
      }
    }
    for (const reverse of reverseRows) {
      if (
        reverse.observation.contentHash !== reverse.observationHash ||
        reverse.observation.classificationVersion !==
          reverse.classificationVersion ||
        reverse.observation.originalStatus !== 'OBSERVED' ||
        reverse.observation.reviewStatus === 'REJECTED' ||
        reverse.observation.expiresAt <= new Date() ||
        !policy.granted(target, 'ai')
      )
        continue;
      const toEvidence = (row: typeof forward) => ({
        postId: row.observationId,
        sourceChannelId: row.sourceChannelId,
        targetChannelId: row.targetChannelId,
        publishedAt: row.publishedAt.toISOString(),
        creativeHash: leadHash(row.evidence),
        promotionVerified: true,
        catalog: false,
      });
      if (!reciprocalPromotion(toEvidence(forward), toEvidence(reverse)))
        continue;
      if (
        forward.pairedObservationId === reverse.observationId &&
        reverse.pairedObservationId === forward.observationId
      )
        return;
      if (forward.pairedObservationId || reverse.pairedObservationId) continue;
      await tx.telegramLeadPromotion.update({
        where: { id: forward.id },
        data: {
          pairedObservationId: reverse.observationId,
          pairedPublishedAt: reverse.publishedAt,
          verificationStatus: 'RECIPROCAL_PROMOTION_EVIDENCED',
        },
      });
      await tx.telegramLeadPromotion.update({
        where: { id: reverse.id },
        data: {
          pairedObservationId: forward.observationId,
          pairedPublishedAt: forward.publishedAt,
          verificationStatus: 'RECIPROCAL_PROMOTION_EVIDENCED',
        },
      });
      return;
    }
  });
}
