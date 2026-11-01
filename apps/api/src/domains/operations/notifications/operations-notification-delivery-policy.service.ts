import { Injectable } from '@nestjs/common';
import type { OperationsNotificationType, Prisma } from '@prisma/client';

export type OperationsNotificationDeliveryFact = {
  id: string;
  workspaceId: string;
  recipientMemberId: string;
  type: OperationsNotificationType;
  metadata: Prisma.JsonValue | null;
  sourceKey?: string;
  deliverAt?: Date;
  visibilityMemberId?: string | null;
  visibilityResourceKey?: string | null;
};

type DeliveryPolicy = (
  tx: Prisma.TransactionClient,
  facts: readonly OperationsNotificationDeliveryFact[],
) => Promise<readonly string[]>;

/** Domains own eligibility; delivery infrastructure only coordinates batches. */
@Injectable()
export class OperationsNotificationDeliveryPolicyService {
  private readonly policies = new Map<
    OperationsNotificationType,
    DeliveryPolicy
  >();

  register(type: OperationsNotificationType, policy: DeliveryPolicy) {
    if (this.policies.has(type))
      throw new Error(`Delivery policy already registered for ${type}`);
    this.policies.set(type, policy);
    return () => {
      if (this.policies.get(type) === policy) this.policies.delete(type);
    };
  }

  async filter(
    tx: Prisma.TransactionClient,
    facts: readonly OperationsNotificationDeliveryFact[],
  ) {
    const groups = new Map<
      OperationsNotificationType,
      OperationsNotificationDeliveryFact[]
    >();
    const allowed = new Set<string>();
    for (const fact of facts) {
      if (!this.policies.has(fact.type)) allowed.add(fact.id);
      else {
        const group = groups.get(fact.type) ?? [];
        group.push(fact);
        groups.set(fact.type, group);
      }
    }
    for (const [type, group] of groups) {
      const approved = new Set(await this.policies.get(type)!(tx, group));
      for (const fact of group) if (approved.has(fact.id)) allowed.add(fact.id);
    }
    return allowed;
  }
}
