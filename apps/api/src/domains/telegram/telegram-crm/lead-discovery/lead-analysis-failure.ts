import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
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
    !gatewayAttempted ||
    (!receipt &&
      ((code !== null && code !== 'AI_SETTLEMENT_UNCERTAIN') ||
        error instanceof ForbiddenException));
  const uncertain =
    !noCall && (!receipt || ['UNKNOWN', 'RUNNING'].includes(receipt.status));
  await prisma.telegramLeadObservation.updateMany({
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
  });
  return uncertain ? 'unknown' : 'failed';
}
