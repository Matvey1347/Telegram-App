import { ConflictException } from '@nestjs/common';
import { Prisma, type TelegramLeadObservation } from '@prisma/client';
import type { LeadAnalysisResult } from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramLeadPolicy } from './lead-policy.service';
import {
  lockLeadAnalysisClaim,
  type LeadAnalysisClaim,
} from './lead-analysis-claim';
import { addLeadFailure } from './lead-analysis-failure';
import {
  leadTransportMatches,
  type LeadTransportSnapshot,
} from './lead-transport-snapshot';

export function recordUncertainClaim(
  summary: LeadAnalysisResult,
  id: string,
  stage: 'classification' | 'extraction',
) {
  summary.skipped++;
  summary.unknown++;
  addLeadFailure(
    summary,
    id,
    stage,
    new ConflictException('AI_OUTCOME_UNCERTAIN'),
  );
}

/** One unresolved claim stalls automatic work for the entire batch. */
export function unresolvedAutomaticOperation(rows: TelegramLeadObservation[]) {
  const pending = rows.find((row) => {
    if (
      row.reviewStatus === 'REJECTED' ||
      row.originalStatus !== 'OBSERVED' ||
      row.expiresAt <= new Date()
    )
      return false;
    return Boolean(
      (['CLASSIFYING', 'EXTRACTING', 'UNKNOWN'].includes(
        row.processingStatus,
      ) &&
        (row.classificationOperationId || row.extractionOperationId)) ||
      (row.processingStatus === 'FAILED' &&
        ((row.classificationOperationId && !row.classification) ||
          (row.extractionOperationId && !row.extraction))),
    );
  });
  if (!pending) return null;
  return {
    id: pending.id,
    failed: pending.processingStatus === 'FAILED',
    stage:
      pending.processingStatus === 'EXTRACTING' ||
      (pending.extractionOperationId &&
        (pending.processingStatus === 'UNKNOWN' || !pending.extraction))
        ? ('extraction' as const)
        : ('classification' as const),
  };
}

/** Source lock fences result writes; no transaction is held during provider work. */
export async function persistLeadResult(
  prisma: PrismaService,
  policy: TelegramLeadPolicy,
  mode: 'MANUAL' | 'AUTOMATIC',
  workspaceId: string,
  sourceId: string,
  snapshot: LeadTransportSnapshot,
  args: Prisma.TelegramLeadObservationUpdateManyArgs,
  claim?: LeadAnalysisClaim,
) {
  if (mode === 'MANUAL') return prisma.telegramLeadObservation.updateMany(args);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "TelegramLeadSource" WHERE "workspaceId"=${workspaceId} AND id=${sourceId} FOR UPDATE`,
    );
    const current = await tx.telegramLeadSource.findFirst({
      where: { id: sourceId, workspaceId },
    });
    if (!current || !leadTransportMatches(current, snapshot))
      throw new ConflictException('LEAD_SOURCE_CHANGED');
    policy.assertProcessing(current, 'ai', true);
    if (claim) await lockLeadAnalysisClaim(tx, claim);
    return tx.telegramLeadObservation.updateMany(args);
  });
}
