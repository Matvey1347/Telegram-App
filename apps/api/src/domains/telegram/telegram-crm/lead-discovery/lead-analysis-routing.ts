import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../../prisma/postgres-advisory-lock';
import { TelegramLeadPolicy } from './lead-policy.service';
import { leadHash } from './lead-normalization';
import {
  lockLeadAnalysisClaim,
  type LeadAnalysisClaim,
} from './lead-analysis-claim';
import { LEAD_DISCOVERY_VERSION } from './lead-analysis-version';
import { leadTransportSnapshot } from './lead-transport-snapshot';
import { prefilterLeadPost } from './lead-prefilter';
import {
  extractLiteralSalesContacts,
  resolveTextContact,
} from './lead-text-contact-resolver';
import { leadIdentityUnverified } from './lead-source-reference';
import {
  resolveLeadTargets,
  type LeadTargetEvidence,
} from './lead-advertised-targets';

/** Evaluate and persist a decision under the same claim fence as result writes. */
export async function routeLeadAnalysis(
  prisma: PrismaService,
  policy: TelegramLeadPolicy,
  claim: LeadAnalysisClaim,
) {
  const authorized = await policy.recheckAi(claim.actorUserId, claim.sourceId);
  if (
    authorized.workspaceId !== claim.workspaceId ||
    authorized.bindingRevision !== claim.bindingRevision
  )
    throw new ConflictException('LEAD_SOURCE_CHANGED');
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
      leadIdentityUnverified(source) ||
      source.bindingRevision !== claim.bindingRevision
    )
      throw new ConflictException('LEAD_SOURCE_CHANGED');
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
    // Exact, plain-text duplicates only. No reuse across sources, permissions or versions.
    const prior =
      observation.metadataComplete &&
      observation.metadataTextOnly &&
      Array.isArray(observation.targetEvidence) &&
      observation.targetEvidence.length === 0
        ? await tx.telegramLeadObservation.findFirst({
            where: {
              workspaceId: claim.workspaceId,
              sourceId: claim.sourceId,
              id: { not: claim.observationId },
              text: observation.text,
              metadataComplete: true,
              metadataTextOnly: true,
              targetEvidence: { equals: [] },
              originalStatus: 'OBSERVED',
              reviewStatus: { not: 'REJECTED' },
              expiresAt: { gt: new Date() },
              classificationVersion: LEAD_DISCOVERY_VERSION,
              classification: { not: Prisma.DbNull },
              processingStatus: { in: ['CLASSIFIED', 'EXTRACTED'] },
              analysisQueue: {
                some: {
                  status: 'COMPLETED',
                  bindingRevision: claim.bindingRevision,
                },
              },
            },
            orderBy: { observedAt: 'desc' },
          })
        : null;
    const classification = prior?.classification as
      | { classification?: string }
      | null
      | undefined;
    const reusable = Boolean(
      prior &&
      (classification?.classification === 'ORGANIC_CONTENT' ||
        (prior.extraction &&
          prior.candidateId &&
          (await tx.telegramLeadCandidate.findFirst({
            where: {
              id: prior.candidateId,
              workspaceId: claim.workspaceId,
              expiresAt: { gt: new Date() },
            },
            select: { id: true },
          })))),
    );
    const evidence = Array.isArray(observation.targetEvidence)
      ? (observation.targetEvidence as unknown[])
          .flatMap((value): LeadTargetEvidence[] => {
            if (!value || typeof value !== 'object') return [];
            const item = value as Partial<LeadTargetEvidence>;
            return typeof item.value === 'string' &&
              item.value.length <= 500 &&
              [
                'TELEGRAM_USERNAME',
                'TELEGRAM_CHANNEL_ID',
                'PUBLIC_URL',
                'PRIVATE_INVITE',
              ].includes(item.kind ?? '') &&
              [
                'TEXT',
                'ENTITY',
                'TEXT_URL',
                'INLINE_BUTTON',
                'MENTION',
                'FORWARD',
              ].includes(item.origin ?? '') &&
              ['UNVERIFIED', 'CANONICAL'].includes(item.confidence ?? '')
              ? [item as LeadTargetEvidence]
              : [];
          })
          .slice(0, 60)
      : [];
    const usernames = evidence
      .filter((item) => item.kind === 'TELEGRAM_USERNAME')
      .map((item) => item.value);
    const ids = evidence
      .filter(
        (item) =>
          item.kind === 'TELEGRAM_CHANNEL_ID' && item.origin === 'FORWARD',
      )
      .map((item) => item.value);
    const matches =
      usernames.length || ids.length
        ? await tx.telegramLeadSource.findMany({
            where: {
              workspaceId: claim.workspaceId,
              id: { not: source.id },
              type: 'TELEGRAM_CHANNEL',
              accessType: 'SUBSCRIBED_CHANNEL',
              monitoringState: 'ACTIVE',
              monitoringActorUserId: claim.actorUserId,
              OR: [
                { username: { in: usernames, mode: 'insensitive' } },
                { channelId: { in: ids } },
              ],
            },
            orderBy: { id: 'asc' },
            take: 60,
          })
        : [];
    if (matches.length)
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "TelegramLeadSource" WHERE "workspaceId"=${claim.workspaceId} AND id IN (${Prisma.join(matches.map((item) => item.id))}) ORDER BY id FOR SHARE`,
      );
    const refreshed = matches.length
      ? await tx.telegramLeadSource.findMany({
          where: {
            workspaceId: claim.workspaceId,
            id: { in: matches.map((item) => item.id) },
            accessType: 'SUBSCRIBED_CHANNEL',
            monitoringState: 'ACTIVE',
            monitoringActorUserId: claim.actorUserId,
          },
        })
      : [];
    const allowed = refreshed.filter(
      (item) => !leadIdentityUnverified(item) && policy.granted(item, 'ingest'),
    );
    const resolved = resolveLeadTargets(evidence, source, allowed);
    const allowedIds = new Set(
      allowed.flatMap((item) => (item.channelId ? [item.channelId] : [])),
    );
    const advertisedTargets = [
      ...new Set(
        resolved
          .filter(
            (item) =>
              item.kind === 'TELEGRAM_CHANNEL_ID' &&
              item.confidence === 'CANONICAL' &&
              item.origin !== 'FORWARD' &&
              allowedIds.has(item.value),
          )
          .map((item) => item.value),
      ),
    ];
    const hash = leadHash(observation.text);
    const decision = prefilterLeadPost({
      text: observation.text,
      metadataComplete: observation.metadataComplete,
      textMetadataComplete: observation.textMetadataComplete,
      mediaPresent: observation.mediaPresent,
      advertisedTargets,
      externalEvidence: resolved,
      sourceChannelId: source.channelId,
      contentHash: hash,
      verifiedDuplicate: reusable
        ? {
            contentHash: hash,
            resultId: prior!.id,
            current: true,
            successful: true,
          }
        : null,
    });
    // Only an explicit advertising label and a single literal, allowed channel
    // are sufficient to create a provisional candidate without AI.
    const selected =
      advertisedTargets.length === 1
        ? allowed.find((item) => item.channelId === advertisedTargets[0])
        : undefined;
    const literal =
      selected?.username &&
      /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(selected.username)
        ? `@${selected.username}`
        : null;
    const oneTarget = Boolean(
      selected &&
      resolved.every(
        (item) =>
          (item.kind === 'TELEGRAM_CHANNEL_ID' &&
            item.value === selected.channelId) ||
          (item.kind === 'TELEGRAM_USERNAME' &&
            item.value === selected.username?.toLowerCase()),
      ),
    );
    const deterministicTitle =
      decision.decision === 'LIKELY_AD' &&
      (observation.textMetadataComplete ?? observation.metadataComplete) &&
      oneTarget &&
      literal &&
      /(?:^|\s)#(?:реклама|advertisement)(?=\s|$)/iu.test(observation.text) &&
      new RegExp(
        `(^|[^A-Za-z0-9_])@${selected!.username}(?![A-Za-z0-9_])`,
        'i',
      ).test(observation.text)
        ? (observation.text.match(
            new RegExp(`@${selected!.username}`, 'i'),
          )?.[0] ?? null)
        : null;
    if (deterministicTitle) {
      await tx.telegramLeadObservation.update({
        where: { id: observation.id },
        data: {
          classification: {
            classification: 'ADVERTISEMENT',
            commercialIntent: true,
            niche: '',
            offerType: '',
            hasContact: false,
            relevance: 'POSSIBLE',
            confidence: 0.8,
            risks: ['UNVERIFIED_IDENTITY'],
            evidence: [observation.text],
          },
          classificationVersion: LEAD_DISCOVERY_VERSION,
          extraction: {
            projectName: deterministicTitle,
            productName: '',
            contacts: [],
            warnings: ['MANUAL_REVIEW_REQUIRED'],
          },
          extractionVersion: LEAD_DISCOVERY_VERSION,
          processingStatus: 'EXTRACTED',
        },
      });
    }
    await tx.telegramLeadAnalysisQueue.update({
      where: { id: claim.id },
      data: {
        prefilterDecision: decision.decision,
        prefilterVersion: decision.ruleVersion,
        prefilterReason: decision.reason,
        prefilterSignals: decision.matchedSignals,
        prefilterTargets: resolved,
      },
    });
    if (decision.decision === 'NEEDS_METADATA') {
      await tx.telegramLeadObservation.update({
        where: { id: observation.id },
        data: { processingStatus: 'MANUAL_REVIEW_METADATA' },
      });
    }
    const mediaUnanalyzed =
      observation.mediaPresent === true ||
      (observation.mediaPresent == null && !observation.metadataComplete);
    const textCandidate =
      decision.decision === 'LIKELY_AD'
        ? resolveTextContact(observation.text, resolved)
        : null;
    if (decision.decision === 'NEEDS_MEDIA_ANALYSIS') {
      await tx.telegramLeadObservation.update({
        where: { id: observation.id },
        data: { processingStatus: 'MANUAL_REVIEW_MEDIA' },
      });
    }
    if (
      !deterministicTitle &&
      ['LIKELY_AD', 'LIKELY_VP'].includes(decision.decision)
    ) {
      const contacts = (
        textCandidate?.contacts ?? extractLiteralSalesContacts(observation.text)
      ).map((contact) => ({
        ...contact,
        ...(observation.messageUrl
          ? { evidenceUrl: observation.messageUrl }
          : {}),
      }));
      await tx.telegramLeadObservation.update({
        where: { id: observation.id },
        data: {
          processingStatus: 'MANUAL_REVIEW_TEXT',
          ...(observation.extraction === null &&
          !observation.extractionOperationId
            ? {
                extraction: {
                  projectName: textCandidate?.title ?? '',
                  productName: '',
                  contacts,
                  warnings: [
                    textCandidate ? 'UNVERIFIED_PROJECT' : 'UNRESOLVED_PROJECT',
                    'MANUAL_REVIEW_REQUIRED',
                  ],
                },
                extractionVersion: 'lead-text-contact-v1',
              }
            : {}),
        },
      });
    }
    if (decision.decision === 'SAFE_SKIP' && prior) {
      await tx.telegramLeadObservation.update({
        where: { id: observation.id },
        data: {
          classification: prior.classification as Prisma.InputJsonValue,
          classificationVersion: prior.classificationVersion,
          extraction:
            prior.extraction === null
              ? Prisma.DbNull
              : (prior.extraction as Prisma.InputJsonValue),
          extractionVersion: prior.extractionVersion,
          candidateId: prior.candidateId,
          processingStatus: prior.processingStatus,
        },
      });
    }
    return {
      ...decision,
      deterministicTitle,
      textCandidate,
      directContacts: extractLiteralSalesContacts(observation.text),
      mediaUnanalyzed,
      sourceSnapshot: leadTransportSnapshot(source),
    };
  });
}
