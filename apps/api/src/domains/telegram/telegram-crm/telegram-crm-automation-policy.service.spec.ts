import {
  type CrmAutomationPolicyInput,
  TelegramCrmAutomationPolicyService,
} from './telegram-crm-automation-policy.service';
import { TelegramCrmManualMessagePolicyService } from './telegram-crm-manual-message-policy.service';

const now = new Date('2026-09-01T10:00:00.000Z');
const earlier = new Date('2026-09-01T09:00:00.000Z');

const eligibleInput = (): CrmAutomationPolicyInput => ({
  workspaceId: 'workspace-1',
  automationType: 'PRE_PUBLICATION_REMINDER' as const,
  workspace: {
    id: 'workspace-1',
    enabled: true,
    enabledAt: earlier,
    typeEnabled: {
      PRE_PUBLICATION_REMINDER: true,
      PUBLISHED_LINKS: true,
      FOLLOW_UP: true,
    },
  },
  contact: {
    id: 'contact-1',
    workspaceId: 'workspace-1',
    automatedMessagesEnabled: true,
    automatedMessagesEnabledAt: earlier,
  },
  deal: {
    workspaceId: 'workspace-1',
    contactId: 'contact-1',
    automationOverride: 'INHERIT' as const,
    automationEligibleAt: earlier,
  },
  eventOccurredAt: now,
  historical: false,
  idempotencyKey: 'deal-1:pre-publication',
  idempotencyConfirmed: true,
});

describe('TelegramCrmAutomationPolicyService', () => {
  const policy = new TelegramCrmAutomationPolicyService();

  it.each(['PRE_PUBLICATION_REMINDER', 'PUBLISHED_LINKS'] as const)(
    'rejects %s for a migration-protected existing Deal',
    (automationType) => {
      const input = eligibleInput();
      input.automationType = automationType;
      input.deal.automationOverride = 'DISABLED';
      input.deal.automationEligibleAt = null;

      expect(policy.evaluate(input)).toEqual({
        allowed: false,
        reason: 'DEAL_DISABLED',
      });
    },
  );

  it('rejects historical publication events', () => {
    expect(policy.evaluate({ ...eligibleInput(), historical: true })).toEqual({
      allowed: false,
      reason: 'HISTORICAL_EVENT',
    });
  });

  it('fails closed when only the workspace is enabled', () => {
    const input = eligibleInput();
    input.contact.automatedMessagesEnabled = false;
    input.contact.automatedMessagesEnabledAt = null;

    expect(policy.evaluate(input)).toEqual({
      allowed: false,
      reason: 'CONTACT_DISABLED',
    });
  });

  it('rejects cross-workspace Deals and missing idempotency confirmation', () => {
    const crossWorkspace = eligibleInput();
    crossWorkspace.deal.workspaceId = 'workspace-2';
    expect(policy.evaluate(crossWorkspace)).toEqual({
      allowed: false,
      reason: 'DEAL_NOT_ELIGIBLE',
    });

    expect(
      policy.evaluate({ ...eligibleInput(), idempotencyConfirmed: false }),
    ).toEqual({ allowed: false, reason: 'MISSING_IDEMPOTENCY_KEY' });
  });
});

describe('TelegramCrmManualMessagePolicyService', () => {
  it('allows manual messaging without consulting automation flags', () => {
    const policy = new TelegramCrmManualMessagePolicyService();

    expect(
      policy.evaluate({
        hasSendManualMessagesPermission: true,
        accountCrmSendEnabled: true,
      }),
    ).toEqual({ allowed: true, reason: 'ELIGIBLE' });
  });
});
