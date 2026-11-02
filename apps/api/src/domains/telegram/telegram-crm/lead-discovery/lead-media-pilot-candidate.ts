import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { acquirePostgresTransactionLock } from '../../../../prisma/postgres-advisory-lock';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { TelegramLeadPolicy } from './lead-policy.service';
import type { PilotPost, PilotResult } from './lead-media-pilot';

/** Provisional only: image-derived identities are never used to merge candidates. */
export async function saveMediaPilotCandidate(
  prisma: PrismaService,
  policy: TelegramLeadPolicy,
  userId: string,
  post: PilotPost,
  result: PilotResult,
  operationId: string,
) {
  if (result.decision !== 'REVIEW_CANDIDATE' || !result.vision)
    throw new ConflictException('LEAD_MEDIA_CANDIDATE_INVALID');
  const vision = result.vision;
  await policy.refresh(userId);
  const access = await policy.access(userId, 'analyze');
  if (access.workspaceId !== post.workspaceId)
    throw new ConflictException('LEAD_SOURCE_CHANGED');
  return prisma.$transaction(async (tx) => {
    await acquirePostgresTransactionLock(
      tx,
      `lead-discovery:${post.workspaceId}`,
    );
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "TelegramLeadSource" WHERE id=${post.sourceId} AND "workspaceId"=${post.workspaceId} FOR UPDATE`,
    );
    const source = await tx.telegramLeadSource.findFirst({
      where: { id: post.sourceId, workspaceId: post.workspaceId },
    });
    if (!source || source.bindingRevision !== post.bindingRevision)
      throw new ConflictException('LEAD_SOURCE_CHANGED');
    policy.assertProcessing(source, 'ingest', true);
    policy.assertProcessing(source, 'ai', true);
    const config = await tx.telegramLeadAutoConfig.findUnique({
      where: {
        sourceId_workspaceId: {
          sourceId: post.sourceId,
          workspaceId: post.workspaceId,
        },
      },
    });
    if (!config?.enabled) throw new ConflictException('LEAD_AUTOMATION_PAUSED');
    const observation = await tx.telegramLeadObservation.findFirst({
      where: {
        id: post.observationId,
        workspaceId: post.workspaceId,
        sourceId: post.sourceId,
        contentHash: post.contentHash,
        classificationOperationId: operationId,
        originalStatus: 'OBSERVED',
        reviewStatus: { not: 'REJECTED' },
        expiresAt: { gt: new Date() },
      },
    });
    if (!observation)
      throw new ConflictException('LEAD_MEDIA_OBSERVATION_CHANGED');
    const operation = await tx.aiOperation.findUnique({
      where: {
        workspaceId_operationId: { workspaceId: post.workspaceId, operationId },
      },
      include: { durableResult: true },
    });
    if (
      !operation ||
      operation.actorUserId !== userId ||
      operation.businessObjectId !== post.observationId ||
      operation.status !== 'SUCCEEDED' ||
      operation.durableResult?.version !== 'lead-media-vision-v1' ||
      !isDeepStrictEqual(operation.durableResult.output, vision)
    )
      throw new ConflictException('LEAD_MEDIA_RESULT_UNAVAILABLE');
    if (observation.candidateId) return observation.candidateId;
    const identityKey = `vision-observation:${observation.id}`;
    let candidate = await tx.telegramLeadCandidate.findUnique({
      where: {
        workspaceId_identityKey: { workspaceId: post.workspaceId, identityKey },
      },
    });
    if (!candidate)
      candidate = await tx.telegramLeadCandidate.create({
        data: {
          workspaceId: post.workspaceId,
          identityKey,
          title: vision.projectName.trim(),
          sourceIds: [post.sourceId],
          contacts: [],
          risks: ['UNVERIFIED_BUSINESS_IDENTITY', 'IMAGE_EVIDENCE_UNVERIFIED'],
          riskStatus: 'NEEDS_REVIEW',
          reviewStatus: 'PENDING',
          reviewHistory: [],
          expiresAt: observation.expiresAt,
        },
      });
    await tx.telegramLeadObservation.update({
      where: { id: observation.id },
      data: {
        candidateId: candidate.id,
        processingStatus: 'EXTRACTED',
        classificationVersion: 'lead-media-vision-v1',
        classification: {
          classification: 'ADVERTISEMENT',
          commercialIntent: true,
          niche: '',
          offerType: '',
          hasContact: false,
          relevance: 'POSSIBLE',
          confidence: vision.confidence,
          risks: ['IMAGE_EVIDENCE_UNVERIFIED'],
          evidence: [vision.evidence],
        },
        extractionVersion: 'lead-media-vision-v1',
        extraction: {
          projectName: vision.projectName,
          productName: '',
          contacts: [],
          warnings: [
            'IMAGE_EVIDENCE_UNVERIFIED',
            ...vision.contacts.map((c) => `UNVERIFIED_IMAGE_CONTACT: ${c}`),
          ],
        },
      },
    });
    await tx.telegramLeadAnalysisQueue.updateMany({
      where: {
        workspaceId: post.workspaceId,
        sourceId: post.sourceId,
        observationId: post.observationId,
        contentHash: post.contentHash,
        bindingRevision: post.bindingRevision,
        status: 'NEEDS_MEDIA_ANALYSIS',
      },
      data: { status: 'COMPLETED' },
    });
    return candidate.id;
  });
}
