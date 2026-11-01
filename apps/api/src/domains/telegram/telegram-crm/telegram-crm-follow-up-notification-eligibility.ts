import type { Prisma } from '@prisma/client';
import type { OperationsNotificationDueFact } from '../../operations/notifications/operations-notification-due-resolution.service';
import type { TelegramCrmNotificationRecipientService } from './telegram-crm-notification-recipient.service';
import { crmContactIdFromNotificationVisibilityKey } from './telegram-crm-notification-visibility';

function taskId(fact: OperationsNotificationDueFact) {
  const metadata = fact.metadata;
  if (
    metadata &&
    typeof metadata === 'object' &&
    !Array.isArray(metadata) &&
    typeof metadata.taskId === 'string'
  )
    return metadata.taskId;
  return fact.sourceKey?.match(/^task:([^:]+):due:/)?.[1] ?? null;
}

/** Shared read-only occurrence rules for due publication and ready push cohorts. */
export async function eligibleCrmFollowUpNotifications(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  rows: readonly OperationsNotificationDueFact[],
  recipients: TelegramCrmNotificationRecipientService,
) {
  const taskIds = [
    ...new Set(rows.flatMap((fact) => (taskId(fact) ? [taskId(fact)!] : []))),
  ];
  const tasks = taskIds.length
    ? await tx.telegramAdvertiserTask.findMany({
        where: {
          workspaceId,
          id: { in: taskIds },
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          advertiser: {
            workspaceId,
            archivedAt: null,
            OR: [
              { manualSalesStatus: null },
              { manualSalesStatus: { notIn: ['CLOSED', 'DO_NOT_CONTACT'] } },
            ],
          },
        },
        select: {
          id: true,
          advertiserId: true,
          dueAt: true,
          remindAt: true,
          snoozedUntil: true,
        },
      })
    : [];
  const conversationId = (fact: OperationsNotificationDueFact) => {
    const metadata = fact.metadata;
    return metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      typeof metadata.conversationId === 'string'
      ? metadata.conversationId
      : null;
  };
  const scopes = rows.flatMap((fact) => {
    const id = conversationId(fact);
    const contactId = crmContactIdFromNotificationVisibilityKey(
      fact.visibilityResourceKey,
    );
    return id && contactId ? [{ id, contactId }] : [];
  });
  const activeConversations = scopes.length
    ? await tx.telegramCrmConversation.findMany({
        where: {
          workspaceId,
          state: 'ACTIVE',
          OR: scopes,
          mtprotoAccount: {
            workspaceId,
            isActive: true,
            status: 'connected',
            crmSyncEnabled: true,
          },
        },
        select: { id: true, contactId: true },
      })
    : [];
  const activeConversationContacts = new Map(
    activeConversations.map((conversation) => [
      conversation.id,
      conversation.contactId,
    ]),
  );
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const snapshot = tasks.length
    ? await recipients.load(
        tx,
        workspaceId,
        tasks.map((task) => task.advertiserId),
      )
    : null;
  const eligible = new Map<
    string,
    { recipientMemberId: string; visibilityMemberId: string | null }
  >();
  const now = new Date();
  for (const fact of rows) {
    const task = taskById.get(taskId(fact) ?? '');
    const contactId = crmContactIdFromNotificationVisibilityKey(
      fact.visibilityResourceKey,
    );
    const occurrence =
      task && (task.snoozedUntil ?? task.remindAt ?? task.dueAt);
    const contact = snapshot?.contact(contactId);
    const recipient = snapshot?.recipient(contact ?? null);
    const preferences = recipient && snapshot?.preferences(recipient);
    if (
      (conversationId(fact) !== null &&
        activeConversationContacts.get(conversationId(fact)!) !== contactId) ||
      !task ||
      task.advertiserId !== contactId ||
      !contact ||
      !recipient ||
      !preferences?.crmNotificationsEnabled ||
      !preferences.crmFollowUpEnabled ||
      !occurrence ||
      occurrence > now ||
      fact.sourceKey !== `task:${task.id}:due:${occurrence.toISOString()}` ||
      (fact.deliverAt && fact.deliverAt.getTime() !== occurrence.getTime())
    )
      continue;
    eligible.set(fact.id, {
      recipientMemberId: recipient.id,
      visibilityMemberId: contact.ownerMemberId,
    });
  }
  return eligible;
}
