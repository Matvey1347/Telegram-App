import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  OperationsNotificationType,
  Prisma,
  TelegramAdvertiserTaskStatus,
} from '@prisma/client';
import { OperationsNotificationStoreService } from '../../operations/notifications/operations-notification-store.service';
import { OperationsNotificationPublisherService } from '../../operations/notifications/operations-notification-publisher.service';
import type { OperationsNotificationInsert } from '../../operations/notifications/operations-notification-store.service';
import { TelegramCrmNotificationRecipientService } from './telegram-crm-notification-recipient.service';
import {
  crmContactIdFromNotificationVisibilityKey,
  crmContactNotificationVisibilityKey,
} from './telegram-crm-notification-visibility';
import {
  OperationsNotificationDueFact,
  OperationsNotificationDueResolutionService,
} from '../../operations/notifications/operations-notification-due-resolution.service';

type TaskFact = {
  id: string;
  workspaceId: string;
  advertiserId: string;
  title: string;
  status: TelegramAdvertiserTaskStatus;
  dueAt: Date;
  remindAt: Date | null;
  snoozedUntil: Date | null;
};

@Injectable()
export class TelegramCrmInternalNotificationProjector
  implements OnModuleInit, OnModuleDestroy
{
  private unregisterDueResolver: (() => void) | null = null;

  constructor(
    private readonly recipients: TelegramCrmNotificationRecipientService,
    private readonly notifications: OperationsNotificationStoreService,
    private readonly publisher: OperationsNotificationPublisherService,
    private readonly dueResolution: OperationsNotificationDueResolutionService,
  ) {}

  onModuleInit() {
    this.unregisterDueResolver = this.dueResolution.register((tx, facts) =>
      this.resolveDueRecipients(tx, facts),
    );
  }

  onModuleDestroy() {
    this.unregisterDueResolver?.();
  }

  async refreshTask(tx: Prisma.TransactionClient, task: TaskFact) {
    const prefix = `task:${task.id}:due:`;
    await this.notifications.cancelPending(tx, {
      workspaceId: task.workspaceId,
      type: OperationsNotificationType.CRM_FOLLOW_UP_DUE,
      sourceKeyPrefix: prefix,
    });
    if (
      task.status !== TelegramAdvertiserTaskStatus.OPEN &&
      task.status !== TelegramAdvertiserTaskStatus.IN_PROGRESS
    ) {
      return [];
    }
    const deliverAt = task.snoozedUntil ?? task.remindAt ?? task.dueAt;
    const snapshot = await this.recipients.load(tx, task.workspaceId, [
      task.advertiserId,
    ]);
    const contact = snapshot.contact(task.advertiserId);
    const recipient = snapshot.recipient(contact);
    if (!contact || !recipient) return [];
    return this.notifications.insertMany(tx, [
      {
        workspaceId: task.workspaceId,
        recipientMemberId: recipient.id,
        type: OperationsNotificationType.CRM_FOLLOW_UP_DUE,
        priority: task.dueAt <= new Date() ? 'HIGH' : 'NORMAL',
        sourceKey: `${prefix}${deliverAt.toISOString()}`,
        copyKey: 'crm.notification.followUpDue',
        title: 'CRM follow-up due',
        body: task.title.slice(0, 240),
        metadata: { taskId: task.id, contactId: contact.id },
        targetUrl: `/ad-sales/contacts/${encodeURIComponent(contact.id)}?workspaceId=${encodeURIComponent(task.workspaceId)}`,
        deliverAt,
        publishedAt: null,
        requiredPermissionKey: 'adSales.crm.view',
        ownPermissionKey: 'adSales.crm.viewOwn',
        anyPermissionKey: 'adSales.crm.viewAny',
        visibilityMemberId: contact.ownerMemberId,
        visibilityResourceKey: crmContactNotificationVisibilityKey(contact.id),
      },
    ]);
  }

  dueWorkChanged() {
    this.notifications.notifyDueWorkChanged();
  }

  async contactVisibilityChanged(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    contactId: string,
  ) {
    const snapshot = await this.recipients.load(tx, workspaceId, [contactId]);
    const contact = snapshot.contact(contactId);
    const recipient = snapshot.recipient(contact);
    return this.notifications.reassignVisibility(tx, {
      workspaceId,
      visibilityResourceKey: crmContactNotificationVisibilityKey(contactId),
      recipientMemberId: recipient?.id ?? null,
      visibilityMemberId: contact?.ownerMemberId ?? null,
    });
  }

  invalidateVisibility(
    workspaceId: string,
    recipientMemberIds: readonly string[],
  ) {
    this.publisher.invalidate(workspaceId, recipientMemberIds);
  }

  private async resolveDueRecipients(
    tx: Prisma.TransactionClient,
    facts: readonly OperationsNotificationDueFact[],
  ) {
    const due = facts.flatMap((fact) => {
      if (fact.type !== OperationsNotificationType.CRM_FOLLOW_UP_DUE) {
        return [];
      }
      const contactId = crmContactIdFromNotificationVisibilityKey(
        fact.visibilityResourceKey,
      );
      return contactId ? [{ fact, contactId }] : [];
    });
    if (!due.length) return false;
    const byWorkspace = new Map<string, typeof due>();
    for (const item of due) {
      const rows = byWorkspace.get(item.fact.workspaceId) ?? [];
      byWorkspace.set(item.fact.workspaceId, [...rows, item]);
    }
    for (const [workspaceId, rows] of byWorkspace) {
      const snapshot = await this.recipients.load(
        tx,
        workspaceId,
        rows.map((item) => item.contactId),
      );
      for (const { fact, contactId } of rows) {
        const contact = snapshot.contact(contactId);
        const recipient = snapshot.recipient(contact);
        if (!contact || !recipient) {
          await tx.operationsNotification.deleteMany({
            where: { id: fact.id, workspaceId, publishedAt: { not: null } },
          });
          continue;
        }
        if (
          fact.recipientMemberId !== recipient.id ||
          fact.visibilityMemberId !== contact.ownerMemberId
        ) {
          await tx.operationsNotification.updateMany({
            where: { id: fact.id, workspaceId, publishedAt: { not: null } },
            data: {
              recipientMemberId: recipient.id,
              visibilityMemberId: contact.ownerMemberId,
            },
          });
        }
      }
    }
    return true;
  }

  async automationBlocked(
    tx: Prisma.TransactionClient,
    facts: readonly {
      id: string;
      workspaceId: string;
      contactId: string;
      telegramAdSaleId: string | null;
      reason: string | null;
    }[],
  ) {
    return this.immediate(
      tx,
      facts.map((fact) => ({
        workspaceId: fact.workspaceId,
        contactId: fact.contactId,
        type: OperationsNotificationType.CRM_AUTOMATION_BLOCKED,
        priority: 'HIGH' as const,
        sourceKey: `automation:${fact.id}`,
        copyKey: 'crm.notification.automationBlocked',
        title: 'CRM automation needs attention',
        body: 'A customer automation could not be delivered.',
        metadata: {
          automationExecutionId: fact.id,
          dealId: fact.telegramAdSaleId,
          reason: fact.reason,
        },
      })),
    );
  }

  async placementMissed(
    tx: Prisma.TransactionClient,
    fact: {
      id: string;
      workspaceId: string;
      advertiserId: string | null;
      telegramAdSaleId: string;
    },
  ) {
    if (!fact.advertiserId) return [];
    return this.immediate(tx, [
      {
        workspaceId: fact.workspaceId,
        contactId: fact.advertiserId,
        type: OperationsNotificationType.CRM_PLACEMENT_FAILURE,
        priority: 'HIGH',
        sourceKey: `placement:${fact.id}:missed`,
        copyKey: 'crm.notification.placementFailure',
        title: 'CRM placement needs attention',
        body: 'An advertising placement was missed.',
        metadata: {
          placementId: fact.id,
          dealId: fact.telegramAdSaleId,
        },
      },
    ]);
  }

  async publish(ids: readonly string[]) {
    try {
      await this.publisher.publish(ids);
    } catch {
      // The business transition is already committed; notification delivery is
      // deliberately best-effort and its source key remains idempotent.
    }
  }

  private async immediate(
    tx: Prisma.TransactionClient,
    facts: readonly {
      workspaceId: string;
      contactId: string;
      type: 'CRM_AUTOMATION_BLOCKED' | 'CRM_PLACEMENT_FAILURE';
      priority: 'HIGH';
      sourceKey: string;
      copyKey: string;
      title: string;
      body: string;
      metadata: Record<string, string | number | boolean | null>;
    }[],
  ) {
    if (!facts.length) return [];
    const byWorkspace = new Map<string, typeof facts>();
    for (const fact of facts) {
      const values = byWorkspace.get(fact.workspaceId) ?? [];
      byWorkspace.set(fact.workspaceId, [...values, fact]);
    }
    const rows: OperationsNotificationInsert[] = [];
    for (const [workspaceId, workspaceFacts] of byWorkspace) {
      const snapshot = await this.recipients.load(
        tx,
        workspaceId,
        workspaceFacts.map((fact) => fact.contactId),
      );
      for (const fact of workspaceFacts) {
        const contact = snapshot.contact(fact.contactId);
        const recipient = snapshot.recipient(contact);
        if (!contact || !recipient) continue;
        rows.push({
          workspaceId,
          recipientMemberId: recipient.id,
          type: fact.type,
          priority: fact.priority,
          sourceKey: fact.sourceKey,
          copyKey: fact.copyKey,
          title: fact.title,
          body: fact.body,
          metadata: fact.metadata,
          targetUrl: `/ad-sales/contacts/${encodeURIComponent(contact.id)}?workspaceId=${encodeURIComponent(workspaceId)}`,
          publishedAt: new Date(),
          requiredPermissionKey: 'adSales.crm.view',
          ownPermissionKey: 'adSales.crm.viewOwn',
          anyPermissionKey: 'adSales.crm.viewAny',
          visibilityMemberId: contact.ownerMemberId,
          visibilityResourceKey: crmContactNotificationVisibilityKey(
            contact.id,
          ),
        });
      }
    }
    return this.notifications.insertMany(tx, rows);
  }
}
