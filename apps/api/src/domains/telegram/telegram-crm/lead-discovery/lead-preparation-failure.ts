import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../../../prisma/prisma.service';
/** Admission denial is retryable only by a new explicit operation; paid uncertainty is held. */
export async function leadPreparationFailure(
  prisma: PrismaService,
  request: { workspaceId: string; operationId: string; userId: string },
  error: unknown,
  attempted: boolean,
) {
  const receipt = await prisma.aiOperation.findFirst({
    where: {
      workspaceId: request.workspaceId,
      operationId: request.operationId,
      actorUserId: request.userId,
    },
    select: { id: true, status: true },
  });
  const code =
    error instanceof Error && /^(?:AI|LEAD)_[A-Z_]+$/.test(error.message)
      ? error.message
      : null;
  const noCall =
    !attempted ||
    (!receipt &&
      ((code !== null && code !== 'AI_SETTLEMENT_UNCERTAIN') ||
        error instanceof ForbiddenException));
  return {
    status: noCall || receipt?.status === 'FAILED' ? 'FAILED' : 'UNKNOWN',
    operationDbId: receipt?.id ?? null,
  };
}
