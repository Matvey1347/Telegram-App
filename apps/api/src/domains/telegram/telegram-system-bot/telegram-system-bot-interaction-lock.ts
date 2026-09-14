import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

type LockScope = { connectionId: string; workspaceId: string };

export function withSystemBotInteractionLock<T>(
  prisma: PrismaService,
  scope: LockScope,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    const scopeKey = `${scope.connectionId}:${scope.workspaceId}`;
    await tx.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${scopeKey}, 0))`,
    );
    return work(tx);
  });
}
