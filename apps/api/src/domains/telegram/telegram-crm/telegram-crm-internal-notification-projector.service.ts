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
import { resolveCrmFollowUpNotifications } from './telegram-crm-follow-up-notification-resolver';
import { crmContactNotificationVisibilityKey } from './telegram-crm-notification-visibility';
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
  metadata?: Prisma.JsonValue | null;
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
    const reminderEmoji =
      task.metadata &&
      typeof task.metadata === 'object' &&
      !Array.isArray(task.metadata) &&
      typeof (task.metadata as Record<string, unknown>).emoji === 'string'
        ? (task.metadata as Record<string, string>).emoji.slice(0, 16)
        : '';
    const metadata = task.metadata;
    const requestedConversation =
      metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      typeof metadata.conversationId === 'string'
        ? metadata.conversationId
        : null;
    const conversation = requestedConversation
      ? await tx.telegramCrmConversation.findFirst({
          where: {
            id: requestedConversation,
            workspaceId: task.workspaceId,
            contactId: task.advertiserId,
            state: 'ACTIVE',
          },
          select: { id: true },
        })
      : null;
    const targetUrl = conversation
      ? `/ad-sales/inbox?${new URLSearchParams({ conversationId: conversation.id, workspaceId: task.workspaceId }).toString()}`
      : `/ad-sales/clients/${encodeURIComponent(contact.id)}?workspaceId=${encodeURIComponent(task.workspaceId)}`;
    return this.notifications.insertMany(tx, [
      {
        workspaceId: task.workspaceId,
        recipientMemberId: recipient.id,
        type: OperationsNotificationType.CRM_FOLLOW_UP_DUE,
        priority: task.dueAt <= new Date() ? 'HIGH' : 'NORMAL',
        sourceKey: `${prefix}${deliverAt.toISOString()}`,
        copyKey: 'crm.notification.followUpDue',
        title: `Reminder · ${contact.displayName}`.slice(0, 160),
        body: `${reminderEmoji ? `${reminderEmoji} ` : ''}${task.title} · Due ${deliverAt.toISOString()}`.slice(
          0,
          240,
        ),
        metadata: {
          taskId: task.id,
          contactId: contact.id,
          reminderEmoji: reminderEmoji || null,
          conversationId: requestedConversation,
        },
        targetUrl,
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

  async dismissPublishedTask(
    tx: Prisma.TransactionClient,
    task: { id: string; workspaceId: string },
  ) {
    const rows = await tx.$queryRaw<
      Array<{ recipientMemberId: string }>
    >(Prisma.sql`
      WITH dismissed AS (
        DELETE FROM "OperationsNotification"
        WHERE "workspaceId" = ${task.workspaceId}
          AND "type" = 'CRM_FOLLOW_UP_DUE'::"OperationsNotificationType"
          AND starts_with("sourceKey", ${`task:${task.id}:due:`})
          AND "publishedAt" IS NOT NULL
        RETURNING "recipientMemberId"
      ) SELECT DISTINCT "recipientMemberId" FROM dismissed
    `);
    return rows.map((row) => row.recipientMemberId);
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

  private resolveDueRecipients(
    tx: Prisma.TransactionClient,
    facts: readonly OperationsNotificationDueFact[],
  ) {
    return resolveCrmFollowUpNotifications(tx, facts, this.recipients);
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
      type: 'CRM_PLACEMENT_FAILURE';
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
