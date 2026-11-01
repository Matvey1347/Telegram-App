import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  OperationsNotificationDeliveryPolicyService,
  type OperationsNotificationDeliveryFact,
} from '../../operations/notifications/operations-notification-delivery-policy.service';
import { TelegramCrmNotificationRecipientService } from './telegram-crm-notification-recipient.service';
import { eligibleCrmFollowUpNotifications } from './telegram-crm-follow-up-notification-eligibility';

@Injectable()
export class TelegramCrmFollowUpDeliveryPolicy
  implements OnModuleInit, OnModuleDestroy
{
  private unregister?: () => void;
  constructor(
    private readonly policies: OperationsNotificationDeliveryPolicyService,
    private readonly recipients: TelegramCrmNotificationRecipientService,
  ) {}
  onModuleInit() {
    this.unregister = this.policies.register('CRM_FOLLOW_UP_DUE', (tx, facts) =>
      this.allowed(tx, facts),
    );
  }
  onModuleDestroy() {
    this.unregister?.();
  }

  async allowed(
    tx: Prisma.TransactionClient,
    facts: readonly OperationsNotificationDeliveryFact[],
  ) {
    const byWorkspace = new Map<string, OperationsNotificationDeliveryFact[]>();
    for (const fact of facts) {
      const values = byWorkspace.get(fact.workspaceId) ?? [];
      values.push(fact);
      byWorkspace.set(fact.workspaceId, values);
    }
    const allowed: string[] = [];
    for (const [workspaceId, group] of byWorkspace) {
      const eligible = await eligibleCrmFollowUpNotifications(
        tx,
        workspaceId,
        group.map((fact) => ({
          ...fact,
          metadata: fact.metadata ?? undefined,
          visibilityMemberId: fact.visibilityMemberId ?? null,
          visibilityResourceKey: fact.visibilityResourceKey ?? null,
        })),
        this.recipients,
      );
      for (const fact of group)
        if (eligible.get(fact.id)?.recipientMemberId === fact.recipientMemberId)
          allowed.push(fact.id);
    }
    return allowed;
  }
}
