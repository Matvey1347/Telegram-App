import { Injectable } from '@nestjs/common';
import type {
  CrmAutomationEligibility,
  CrmAutomationOverride,
  CrmCustomerAutomationType,
} from '@telegram-system/shared';

export type CrmAutomationPolicyInput = {
  workspaceId: string;
  automationType: CrmCustomerAutomationType;
  workspace: {
    id: string;
    enabled: boolean;
    enabledAt: Date | null;
    typeEnabled: Record<CrmCustomerAutomationType, boolean>;
  };
  contact: {
    id: string;
    workspaceId: string;
    automatedMessagesEnabled: boolean;
    automatedMessagesEnabledAt: Date | null;
  };
  deal: {
    workspaceId: string;
    contactId: string | null;
    automationOverride: CrmAutomationOverride;
    automationEligibleAt: Date | null;
  };
  eventOccurredAt: Date;
  historical: boolean;
  idempotencyKey: string | null;
  idempotencyConfirmed: boolean;
};

@Injectable()
export class TelegramCrmAutomationPolicyService {
  evaluate(input: CrmAutomationPolicyInput): CrmAutomationEligibility {
    if (
      input.workspace.id !== input.workspaceId ||
      input.contact.workspaceId !== input.workspaceId ||
      input.deal.workspaceId !== input.workspaceId ||
      input.deal.contactId !== input.contact.id
    ) {
      return this.denied('DEAL_NOT_ELIGIBLE');
    }
    if (!input.workspace.enabled || !input.workspace.enabledAt) {
      return this.denied('WORKSPACE_DISABLED');
    }
    if (
      !input.contact.automatedMessagesEnabled ||
      !input.contact.automatedMessagesEnabledAt
    ) {
      return this.denied('CONTACT_DISABLED');
    }
    if (!input.workspace.typeEnabled[input.automationType]) {
      return this.denied('TYPE_DISABLED');
    }
    if (input.deal.automationOverride === 'DISABLED') {
      return this.denied('DEAL_DISABLED');
    }
    if (!input.deal.automationEligibleAt) {
      return this.denied('DEAL_NOT_ELIGIBLE');
    }
    const cutover = Math.max(
      input.workspace.enabledAt.getTime(),
      input.contact.automatedMessagesEnabledAt.getTime(),
      input.deal.automationEligibleAt.getTime(),
    );
    if (input.eventOccurredAt.getTime() < cutover) {
      return this.denied('BEFORE_CUTOVER');
    }
    if (input.historical) return this.denied('HISTORICAL_EVENT');
    if (!input.idempotencyKey?.trim() || !input.idempotencyConfirmed) {
      return this.denied('MISSING_IDEMPOTENCY_KEY');
    }
    return { allowed: true, reason: 'ELIGIBLE' };
  }

  private denied(
    reason: Exclude<CrmAutomationEligibility['reason'], 'ELIGIBLE'>,
  ): CrmAutomationEligibility {
    return { allowed: false, reason };
  }
}
