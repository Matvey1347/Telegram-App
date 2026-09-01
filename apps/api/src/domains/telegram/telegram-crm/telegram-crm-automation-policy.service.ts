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
    typeEnabledAt: Record<CrmCustomerAutomationType, Date | null>;
  };
  contact: {
    id: string;
    workspaceId: string;
    automatedMessagesEnabled: boolean;
    automatedMessagesEnabledAt: Date | null;
    typeOverride: CrmAutomationOverride;
    typeEnabledAt: Date | null;
  };
  deal: {
    workspaceId: string;
    contactId: string | null;
    automationOverride: CrmAutomationOverride;
    automationEligibleAt: Date | null;
    typeOverride: CrmAutomationOverride;
    typeEnabledAt: Date | null;
  };
  eventOccurredAt: Date;
  historical: boolean;
  idempotencyKey: string | null;
  idempotencyConfirmed: boolean;
  conversationValid: boolean;
  accountCrmSendEnabled: boolean;
  templateAvailable: boolean;
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
      return this.denied('INVALID_CONTACT');
    }
    if (!input.workspace.enabled || !input.workspace.enabledAt) {
      return this.denied('WORKSPACE_DISABLED');
    }
    if (this.before(input.eventOccurredAt, input.workspace.enabledAt)) {
      return this.denied('BEFORE_CUTOVER');
    }
    if (
      !input.workspace.typeEnabled[input.automationType] ||
      !input.workspace.typeEnabledAt[input.automationType]
    ) {
      return this.denied('WORKSPACE_TYPE_DISABLED');
    }
    if (
      this.before(
        input.eventOccurredAt,
        input.workspace.typeEnabledAt[input.automationType],
      )
    ) {
      return this.denied('BEFORE_CUTOVER');
    }
    if (
      !input.contact.automatedMessagesEnabled ||
      !input.contact.automatedMessagesEnabledAt
    ) {
      return this.denied('CONTACT_DISABLED');
    }
    if (
      this.before(
        input.eventOccurredAt,
        input.contact.automatedMessagesEnabledAt,
      )
    ) {
      return this.denied('BEFORE_CUTOVER');
    }
    if (
      input.contact.typeOverride === 'DISABLED' ||
      (input.contact.typeOverride === 'ENABLED' && !input.contact.typeEnabledAt)
    ) {
      return this.denied('CONTACT_TYPE_DISABLED');
    }
    if (this.before(input.eventOccurredAt, input.contact.typeEnabledAt)) {
      return this.denied('BEFORE_CUTOVER');
    }
    if (input.deal.automationOverride === 'DISABLED') {
      return this.denied('DEAL_DISABLED');
    }
    if (!input.deal.automationEligibleAt) {
      return this.denied('DEAL_NOT_ELIGIBLE');
    }
    if (this.before(input.eventOccurredAt, input.deal.automationEligibleAt)) {
      return this.denied('BEFORE_CUTOVER');
    }
    if (
      input.deal.typeOverride === 'DISABLED' ||
      (input.deal.typeOverride === 'ENABLED' && !input.deal.typeEnabledAt)
    ) {
      return this.denied('DEAL_TYPE_DISABLED');
    }
    if (this.before(input.eventOccurredAt, input.deal.typeEnabledAt)) {
      return this.denied('BEFORE_CUTOVER');
    }
    if (input.historical) return this.denied('HISTORICAL_EVENT');
    if (!input.conversationValid) return this.denied('INVALID_CONVERSATION');
    if (!input.accountCrmSendEnabled) return this.denied('ACCOUNT_DISABLED');
    if (!input.templateAvailable) return this.denied('TEMPLATE_UNAVAILABLE');
    if (!input.idempotencyKey?.trim() || !input.idempotencyConfirmed) {
      return this.denied('MISSING_IDEMPOTENCY_KEY');
    }
    return { allowed: true, reason: 'ELIGIBLE' };
  }

  private before(eventOccurredAt: Date, cutover: Date | null) {
    return Boolean(cutover && eventOccurredAt.getTime() < cutover.getTime());
  }

  private denied(
    reason: Exclude<CrmAutomationEligibility['reason'], 'ELIGIBLE'>,
  ): CrmAutomationEligibility {
    return { allowed: false, reason };
  }
}
