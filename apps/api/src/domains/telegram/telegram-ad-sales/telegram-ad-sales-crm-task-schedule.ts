import { Prisma, type TelegramAdvertiserTask } from '@prisma/client';

/** Exact effective occurrence used by reminders and the Inbox current-task read. */
export async function loadNextCrmFollowUp(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  contactId: string,
): Promise<TelegramAdvertiserTask | null> {
  const rows = await tx.$queryRaw<TelegramAdvertiserTask[]>(Prisma.sql`
    SELECT task.* FROM "TelegramAdvertiserTask" AS task
    WHERE task."workspaceId" = ${workspaceId} AND task."advertiserId" = ${contactId}
      AND task."status" IN ('OPEN'::"TelegramAdvertiserTaskStatus", 'IN_PROGRESS'::"TelegramAdvertiserTaskStatus")
    ORDER BY COALESCE(task."snoozedUntil", task."remindAt", task."dueAt"), task."id"
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function syncCrmContactReminder(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  contactId: string,
) {
  const task = await loadNextCrmFollowUp(tx, workspaceId, contactId);
  const nextAt = task?.snoozedUntil ?? task?.remindAt ?? task?.dueAt ?? null;
  await tx.$executeRaw(Prisma.sql`
    UPDATE "TelegramAdvertiser" SET "nextContactAt" = ${nextAt}, "updatedAt" = NOW()
    WHERE "id" = ${contactId} AND "workspaceId" = ${workspaceId}
      AND "nextContactAt" IS DISTINCT FROM ${nextAt}
  `);
}

export function mapCrmTask(task: TelegramAdvertiserTask) {
  return {
    ...task,
    dueAt: task.dueAt.toISOString(),
    remindAt: task.remindAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    skippedAt: task.skippedAt?.toISOString() ?? null,
    snoozedUntil: task.snoozedUntil?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
