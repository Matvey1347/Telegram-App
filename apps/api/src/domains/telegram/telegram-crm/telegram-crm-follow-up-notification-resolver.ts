import { Prisma } from '@prisma/client';
import type { OperationsNotificationDueFact } from '../../operations/notifications/operations-notification-due-resolution.service';
import { TelegramCrmNotificationRecipientService } from './telegram-crm-notification-recipient.service';
import { eligibleCrmFollowUpNotifications } from './telegram-crm-follow-up-notification-eligibility';

/** Reconcile due recipients using the same rules checked before push dispatch. */
export async function resolveCrmFollowUpNotifications(
  tx: Prisma.TransactionClient,
  facts: readonly OperationsNotificationDueFact[],
  recipients: TelegramCrmNotificationRecipientService,
) {
  const byWorkspace = new Map<string, OperationsNotificationDueFact[]>();
  for (const fact of facts) {
    if (fact.type !== 'CRM_FOLLOW_UP_DUE') continue;
    const values = byWorkspace.get(fact.workspaceId) ?? [];
    values.push(fact);
    byWorkspace.set(fact.workspaceId, values);
  }
  let changed = false;
  for (const [workspaceId, rows] of byWorkspace) {
    const eligible = await eligibleCrmFollowUpNotifications(
      tx,
      workspaceId,
      rows,
      recipients,
    );
    const invalid = rows
      .filter((fact) => !eligible.has(fact.id))
      .map(({ id }) => id);
    const assignments = rows.flatMap((fact) => {
      const assignment = eligible.get(fact.id);
      return assignment &&
        (fact.recipientMemberId !== assignment.recipientMemberId ||
          fact.visibilityMemberId !== assignment.visibilityMemberId)
        ? [{ id: fact.id, ...assignment }]
        : [];
    });
    if (invalid.length) {
      await tx.operationsNotification.deleteMany({
        where: { workspaceId, id: { in: invalid } },
      });
      changed = true;
    }
    if (assignments.length) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "OperationsNotification" AS notification
        SET "recipientMemberId" = incoming."recipientMemberId", "visibilityMemberId" = incoming."visibilityMemberId"
        FROM (VALUES ${Prisma.join(assignments.map((item) => Prisma.sql`(${item.id}::text, ${item.recipientMemberId}::text, ${item.visibilityMemberId}::text)`))})
          AS incoming("id", "recipientMemberId", "visibilityMemberId")
        WHERE notification."workspaceId" = ${workspaceId} AND notification."id" = incoming."id"
      `);
      changed = true;
    }
  }
  return changed;
}
