import { MutualPromotionWorkKind, Prisma } from '@prisma/client';
import type { MutualPromotionLifecycleLane } from './mutual-promotion-lifecycle.service';
export class MutualPromotionFinishDeferredError extends Error {
  constructor(
    readonly retryAt: Date,
    pendingCount: number,
  ) {
    super(
      `${pendingCount} publication work item(s) must finish before folder cleanup`,
    );
  }
}

export function mutualPromotionRetryAt(now: Date, attempt: number) {
  const delayMs = Math.min(
    6 * 60 * 60_000,
    30_000 * 2 ** Math.min(attempt - 1, 10),
  );
  return new Date(now.getTime() + delayMs);
}

export async function runMutualPromotionBounded<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
) {
  for (let index = 0; index < items.length; index += concurrency) {
    await Promise.all(items.slice(index, index + concurrency).map(task));
  }
}

export async function refreshMutualPromotionFolderDueTimes(
  prisma: PrismaService,
  folderIds: string[],
) {
  for (const folderId of folderIds) {
    const next = await prisma.mutualPromotionWorkItem.findFirst({
      where: { folderId, status: { in: ['PENDING', 'RETRY', 'PROCESSING'] } },
      orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
      select: { nextAttemptAt: true },
    });
    await prisma.mutualPromotionFolder.updateMany({
      where: { id: folderId, nextDueAt: { not: next?.nextAttemptAt ?? null } },
      data: { nextDueAt: next?.nextAttemptAt ?? null },
    });
  }
}
import type { PrismaService } from '../../../prisma/prisma.service';

/** Pending confirmations arm a real retry deadline; no pending row means no wake. */
export async function pendingMutualPromotionConfirmationAt(
  prisma: PrismaService,
) {
  const pending = await prisma.mutualPromotionFolderPost.findFirst({
    where: {
      publishedBotConfirmationSentAt: null,
      deliveries: { some: {}, every: { status: 'PUBLISHED' } },
    },
    orderBy: { updatedAt: 'asc' },
    select: { updatedAt: true },
  });
  return pending ? new Date(pending.updatedAt.getTime() + 60_000) : null;
}

export async function attemptMutualPromotionConfirmation(
  prisma: PrismaService,
  folderPostId: string,
  now: Date,
  send: () => Promise<unknown>,
) {
  try {
    await send();
  } finally {
    // Persist only a real attempt, keeping failed notification retries bounded.
    await prisma.mutualPromotionFolderPost.updateMany({
      where: { id: folderPostId, publishedBotConfirmationSentAt: null },
      data: { updatedAt: now },
    });
  }
}

export function mutualPromotionLaneWhere(
  lane?: MutualPromotionLifecycleLane,
): Prisma.MutualPromotionWorkItemWhereInput {
  if (!lane) return {};
  return {
    kind:
      lane === 'publication'
        ? MutualPromotionWorkKind.PUBLISH_POST
        : { not: MutualPromotionWorkKind.PUBLISH_POST },
  };
}
