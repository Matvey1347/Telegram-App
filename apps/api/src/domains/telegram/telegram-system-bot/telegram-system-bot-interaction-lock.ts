import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';

type LockScope = { connectionId: string; workspaceId: string };

export function withSystemBotInteractionLock<T>(
  prisma: PrismaService,
  scope: LockScope,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    const scopeKey = `${scope.connectionId}:${scope.workspaceId}`;
    await acquirePostgresTransactionLock(tx, scopeKey);
    return work(tx);
  });
}
