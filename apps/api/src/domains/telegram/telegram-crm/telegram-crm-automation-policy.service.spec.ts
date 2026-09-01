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
    typeEnabledAt: {
      PRE_PUBLICATION_REMINDER: earlier,
      PUBLISHED_LINKS: earlier,
      FOLLOW_UP: earlier,
    },
  },
  contact: {
    id: 'contact-1',
    workspaceId: 'workspace-1',
    automatedMessagesEnabled: true,
    automatedMessagesEnabledAt: earlier,
    typeOverride: 'INHERIT',
    typeEnabledAt: null,
  },
  deal: {
    workspaceId: 'workspace-1',
    contactId: 'contact-1',
    automationOverride: 'INHERIT' as const,
    automationEligibleAt: earlier,
    typeOverride: 'INHERIT',
    typeEnabledAt: null,
  },
  eventOccurredAt: now,
  historical: false,
  idempotencyKey: 'deal-1:pre-publication',
  idempotencyConfirmed: true,
  conversationValid: true,
  accountCrmSendEnabled: true,
  templateAvailable: true,
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

  it('reports each cutover before evaluating the next scope gate', () => {
    const workspace = eligibleInput();
    workspace.workspace.enabledAt = new Date('2026-09-01T11:00:00.000Z');
    workspace.workspace.typeEnabled.PRE_PUBLICATION_REMINDER = false;
    expect(policy.evaluate(workspace).reason).toBe('BEFORE_CUTOVER');

    const contact = eligibleInput();
    contact.contact.automatedMessagesEnabledAt = new Date(
      '2026-09-01T11:00:00.000Z',
    );
    contact.contact.typeOverride = 'DISABLED';
    expect(policy.evaluate(contact).reason).toBe('BEFORE_CUTOVER');

    const deal = eligibleInput();
    deal.deal.automationEligibleAt = new Date('2026-09-01T11:00:00.000Z');
    deal.deal.typeOverride = 'DISABLED';
    expect(policy.evaluate(deal).reason).toBe('BEFORE_CUTOVER');
  });

  it('rejects cross-workspace Deals and missing idempotency confirmation', () => {
    const crossWorkspace = eligibleInput();
    crossWorkspace.deal.workspaceId = 'workspace-2';
    expect(policy.evaluate(crossWorkspace)).toEqual({
      allowed: false,
      reason: 'INVALID_CONTACT',
    });

    expect(
      policy.evaluate({ ...eligibleInput(), idempotencyConfirmed: false }),
    ).toEqual({ allowed: false, reason: 'MISSING_IDEMPOTENCY_KEY' });
  });

  it('fails closed when an explicit per-type enable has no durable cutover', () => {
    const contact = eligibleInput();
    contact.contact.typeOverride = 'ENABLED';
    expect(policy.evaluate(contact).reason).toBe('CONTACT_TYPE_DISABLED');

    const deal = eligibleInput();
    deal.deal.typeOverride = 'ENABLED';
    expect(policy.evaluate(deal).reason).toBe('DEAL_TYPE_DISABLED');
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
