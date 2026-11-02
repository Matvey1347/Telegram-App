import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { LeadAnalysisResult } from '@telegram-system/shared';
import type { LeadAnalysisClaim } from './lead-analysis-claim';

/** Only bounded public reason codes, never provider output or private source excerpts. */
export function addLeadFailure(
  summary: LeadAnalysisResult,
  observationId: string,
  stage: 'classification' | 'extraction',
  error: unknown,
) {
  let code = error instanceof Error ? error.message : '';
  if (error && typeof error === 'object' && !(error instanceof Error)) {
    const outcome = error as { errorCategory?: unknown; status?: unknown };
    code =
      typeof outcome.errorCategory === 'string'
        ? `AI_${outcome.errorCategory}`
        : outcome.status === 'UNKNOWN'
          ? 'AI_OUTCOME_UNCERTAIN'
          : 'AI_OUTPUT_UNAVAILABLE';
  }
  if (!/^(?:AI|LEAD)_[A-Z_]{1,90}$/.test(code)) code = 'LEAD_ANALYSIS_FAILED';
  summary.failures ??= [];
  if (summary.failures.length < 10)
    summary.failures.push({ observationId, stage, code });
}
export async function recordLeadAnalysisFailure(
  prisma: PrismaService,
  request: {
    workspaceId: string;
    id: string;
    hash: string;
    operationId: string;
    stage: 'classification' | 'extraction';
    userId: string;
  },
  error: unknown,
  gatewayAttempted: boolean,
  updateObservation?: (
    args: Prisma.TelegramLeadObservationUpdateManyArgs,
  ) => Promise<{ count: number }>,
  replaying = false,
  resultApplied = false,
  claim?: LeadAnalysisClaim,
): Promise<'unknown' | 'failed'> {
  const receipt = await prisma.aiOperation.findFirst({
    where: {
      workspaceId: request.workspaceId,
      operationId: request.operationId,
      businessObjectId: request.id,
      actorUserId: request.userId,
    },
    select: { id: true, status: true },
  });
  const code =
    error instanceof Error && /^(?:AI|LEAD)_[A-Z_]+$/.test(error.message)
      ? error.message
      : null;
  const noCall =
    !replaying &&
    (!gatewayAttempted ||
      (!receipt &&
        ((code !== null && code !== 'AI_SETTLEMENT_UNCERTAIN') ||
          error instanceof ForbiddenException)));
  const uncertain =
    (replaying &&
      (!code ||
        code === 'AI_REPLAY_UNAVAILABLE' ||
        error instanceof ForbiddenException)) ||
    code === 'AI_REPLAY_UNAVAILABLE' ||
    (gatewayAttempted &&
      !resultApplied &&
      receipt?.status === 'SUCCEEDED' &&
      (!code || error instanceof ForbiddenException)) ||
    (!noCall && (!receipt || ['UNKNOWN', 'RUNNING'].includes(receipt.status)));
  const update =
    updateObservation ??
    ((args) => prisma.telegramLeadObservation.updateMany(args));
  const args: Prisma.TelegramLeadObservationUpdateManyArgs = {
    where: {
      id: request.id,
      workspaceId: request.workspaceId,
      contentHash: request.hash,
      ...(request.stage === 'classification'
        ? { classificationOperationId: request.operationId }
        : { extractionOperationId: request.operationId }),
    },
    data: {
      processingStatus: uncertain ? 'UNKNOWN' : 'FAILED',
      ...(request.stage === 'classification'
        ? {
            classificationOperationDbId: receipt?.id ?? null,
            ...(noCall ? { classificationOperationId: null } : {}),
          }
        : {
            extractionOperationDbId: receipt?.id ?? null,
            ...(noCall ? { extractionOperationId: null } : {}),
          }),
    },
  };
  try {
    await update(args);
  } catch (error) {
    if (
      !claim ||
      !noCall ||
      (gatewayAttempted && code !== 'LEAD_AUTOMATION_PAUSED')
    )
      throw error;
    // Pause can invalidate the normal business-write fence before admission.
    // Clear only a still-owned stage for which no operation was admitted.
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "TelegramLeadSource" WHERE id=${claim.sourceId} AND "workspaceId"=${claim.workspaceId} FOR UPDATE`,
      );
      const owned = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM "TelegramLeadAnalysisQueue" WHERE id=${claim.id}
          AND "workspaceId"=${claim.workspaceId} AND "sourceId"=${claim.sourceId}
          AND "observationId"=${claim.observationId} AND "claimToken"=${claim.claimToken}
          AND status='RUNNING' AND "claimUntil">clock_timestamp() FOR UPDATE`);
      if (!owned.length) throw error;
      const admitted = await tx.aiOperation.findUnique({
        where: {
          workspaceId_operationId: {
            workspaceId: request.workspaceId,
            operationId: request.operationId,
          },
        },
        select: { id: true },
      });
      if (admitted) throw error;
      await tx.telegramLeadObservation.updateMany(args);
    });
  }
  return uncertain ? 'unknown' : 'failed';
}
