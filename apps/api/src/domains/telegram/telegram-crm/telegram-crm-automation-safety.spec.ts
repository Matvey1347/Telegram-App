import fs from 'node:fs';
import path from 'node:path';
import { TelegramCrmAutomationFinalizerService } from './telegram-crm-automation-finalizer.service';
import {
  CrmAutomationPolicyInput,
  TelegramCrmAutomationPolicyService,
} from './telegram-crm-automation-policy.service';
import { TelegramCrmAutomationRunnerService } from './telegram-crm-automation-runner.service';
import { crmPublishedPlacementSource } from './telegram-crm-automation-source';

const enabledAt = new Date('2026-09-01T09:00:00Z');
const eventOccurredAt = new Date('2026-09-01T10:00:00Z');

function policyInput(): CrmAutomationPolicyInput {
  return {
    workspaceId: 'workspace-1',
    automationType: 'FOLLOW_UP',
    workspace: {
      id: 'workspace-1',
      enabled: true,
      enabledAt,
      typeEnabled: {
        PRE_PUBLICATION_REMINDER: true,
        PUBLISHED_LINKS: true,
        FOLLOW_UP: true,
      },
      typeEnabledAt: {
        PRE_PUBLICATION_REMINDER: enabledAt,
        PUBLISHED_LINKS: enabledAt,
        FOLLOW_UP: enabledAt,
      },
    },
    contact: {
      id: 'contact-1',
      workspaceId: 'workspace-1',
      automatedMessagesEnabled: true,
      automatedMessagesEnabledAt: enabledAt,
      typeOverride: 'INHERIT',
      typeEnabledAt: null,
    },
    deal: {
      workspaceId: 'workspace-1',
      contactId: 'contact-1',
      automationOverride: 'INHERIT',
      automationEligibleAt: enabledAt,
      typeOverride: 'INHERIT',
      typeEnabledAt: null,
    },
    eventOccurredAt,
    historical: false,
    idempotencyKey: 'deal:deal-1:follow-up:1',
    idempotencyConfirmed: true,
    conversationValid: true,
    accountCrmSendEnabled: true,
    templateAvailable: true,
  };
}

describe('CRM customer automation mandatory safety matrix', () => {
  const policy = new TelegramCrmAutomationPolicyService();

  it.each([
    [
      'workspace OFF',
      (input: CrmAutomationPolicyInput) => {
        input.workspace.enabled = false;
        input.workspace.enabledAt = null;
      },
    ],
    [
      'Contact OFF',
      (input: CrmAutomationPolicyInput) => {
        input.contact.automatedMessagesEnabled = false;
        input.contact.automatedMessagesEnabledAt = null;
      },
    ],
    [
      'Contact type OFF',
      (input: CrmAutomationPolicyInput) => {
        input.contact.typeOverride = 'DISABLED';
      },
    ],
    [
      'Deal OFF',
      (input: CrmAutomationPolicyInput) => {
        input.deal.automationOverride = 'DISABLED';
      },
    ],
    [
      'Deal type OFF',
      (input: CrmAutomationPolicyInput) => {
        input.deal.typeOverride = 'DISABLED';
      },
    ],
  ])('%s produces zero runtime sends', (_label, disable) => {
    const runtimeSend = jest.fn();
    const input = policyInput();
    disable(input);
    if (policy.evaluate(input).allowed) runtimeSend();
    expect(runtimeSend).not.toHaveBeenCalled();
  });

  it('rejects historical and pre-workspace/contact-cutover events', () => {
    const historical = policyInput();
    historical.historical = true;
    expect(policy.evaluate(historical).reason).toBe('HISTORICAL_EVENT');

    const beforeWorkspace = policyInput();
    beforeWorkspace.workspace.enabledAt = new Date('2026-09-01T11:00:00Z');
    expect(policy.evaluate(beforeWorkspace).reason).toBe('BEFORE_CUTOVER');

    const beforeContact = policyInput();
    beforeContact.contact.automatedMessagesEnabledAt = new Date(
      '2026-09-01T11:00:00Z',
    );
    expect(policy.evaluate(beforeContact).reason).toBe('BEFORE_CUTOVER');
  });

  it.each([
    [
      'partial',
      'SCHEDULED',
      new Date(),
      { telegramMessageId: '42' },
      '-100123',
    ],
    ['failed', 'MISSED', new Date(), { telegramMessageId: '42' }, '-100123'],
    [
      'missing actual time',
      'PUBLISHED',
      null,
      { telegramMessageId: '42' },
      '-100123',
    ],
    [
      'missing URL identity',
      'COMPLETED',
      new Date(),
      { telegramMessageId: '42' },
      null,
    ],
  ])(
    '%s publication cannot become a published-links source',
    (_label, status, publishedAt, telegramPost, telegramChatId) => {
      expect(
        crmPublishedPlacementSource({
          placements: [
            {
              id: 'placement-1',
              status,
              scheduledAt: new Date(),
              timezone: 'UTC',
              publishedAt,
              telegramPost,
              telegramChannel: {
                title: 'Channel',
                username: null,
                telegramChatId,
              },
            },
          ],
        } as never),
      ).toBeNull();
    },
  );

  it('retries an ambiguous Telegram send with one pinned randomId and finalizes one logical Message', async () => {
    const execution = {
      id: 'execution-1',
      workspaceId: 'workspace-1',
      automationType: 'FOLLOW_UP',
      contactId: 'contact-1',
      telegramAdSaleId: 'deal-1',
      eventKey: 'deal:deal-1:follow-up:1',
      eventOccurredAt,
      historical: false,
      attempts: 1,
      maxAttempts: 4,
      renderedText: 'Following up',
      templateKey: 'crm.automation.followUp.configured',
      locale: 'en',
      stableRandomId: null as string | null,
      sourceVersion: '1',
      reason: null as string | null,
      conversationId: null as string | null,
      mtprotoAccountId: null as string | null,
      sale: {
        workspaceId: 'workspace-1',
        advertiserId: 'contact-1',
        customerAutomationOverride: 'INHERIT',
        customerAutomationEligibleAt: enabledAt,
        prePublicationAutomationOverride: 'INHERIT',
        prePublicationAutomationEnabledAt: null,
        publishedLinksAutomationOverride: 'INHERIT',
        publishedLinksAutomationEnabledAt: null,
        followUpAutomationOverride: 'INHERIT',
        followUpAutomationEnabledAt: null,
        customerFollowUpAt: new Date('2026-09-01T12:00:00Z'),
        customerFollowUpVersion: 1,
        placements: [],
      },
      contact: {
        id: 'contact-1',
        workspaceId: 'workspace-1',
        automatedMessagesEnabled: true,
        automatedMessagesEnabledAt: enabledAt,
        prePublicationAutomationOverride: 'INHERIT',
        prePublicationAutomationEnabledAt: null,
        publishedLinksAutomationOverride: 'INHERIT',
        publishedLinksAutomationEnabledAt: null,
        followUpAutomationOverride: 'INHERIT',
        followUpAutomationEnabledAt: null,
        ownerMemberId: null,
      },
      workspace: {
        telegramAdCrmWorkspaceSettings: {
          customerTelegramAutomationsEnabled: true,
          customerTelegramAutomationsEnabledAt: enabledAt,
          prePublicationReminderEnabled: true,
          prePublicationReminderEnabledAt: enabledAt,
          publishedLinksEnabled: true,
          publishedLinksEnabledAt: enabledAt,
          followUpEnabled: true,
          followUpEnabledAt: enabledAt,
        },
      },
    };
    const createdMessages: unknown[] = [];
    const tx = {
      telegramCrmMessage: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn(({ data }) => {
          createdMessages.push(data);
          return Promise.resolve({
            id: 'message-1',
            ...data,
            contentMetadata: null,
            editedAt: null,
            readState: 'UNREAD',
            createdAt: new Date(),
          });
        }),
      },
      telegramCrmConversation: { update: jest.fn() },
      telegramAdvertiser: { update: jest.fn() },
      telegramCrmCustomerAutomationExecution: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    let transactionAttempt = 0;
    const prisma = {
      telegramCrmCustomerAutomationExecution: {
        findFirst: jest
          .fn()
          .mockImplementation(() => Promise.resolve(execution)),
        updateMany: jest.fn(({ data }) => {
          Object.assign(execution, data);
          return Promise.resolve({ count: 1 });
        }),
      },
      telegramCrmConversation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'conversation-1' }),
        updateMany: jest.fn(),
      },
      telegramUserAccountIntegration: {
        findFirst: jest.fn().mockResolvedValue({ id: 'account-1' }),
      },
      $transaction: jest.fn((operation) => {
        transactionAttempt += 1;
        return transactionAttempt === 1
          ? Promise.reject(new Error('uncertain commit'))
          : operation(tx);
      }),
    };
    const sendText = jest.fn().mockResolvedValue({
      telegramMessageId: 42,
      sentAt: new Date('2026-09-01T12:00:00Z'),
    });
    const runtime = {
      withAccountHandle: jest.fn((_workspace, _account, _mode, operation) =>
        operation({ sendText }),
      ),
    };
    const claims = {
      ownerId: 'worker-1',
      terminalizeExhausted: jest.fn(),
      claim: jest.fn().mockResolvedValue(['execution-1']),
    };
    const authorization = {
      preflight: jest
        .fn()
        .mockReturnValue({ allowed: true, reason: 'ELIGIBLE' }),
      sourceStillCurrent: jest.fn().mockReturnValue(true),
      authorize: jest
        .fn()
        .mockResolvedValueOnce({ kind: 'LOST' })
        .mockImplementation(() =>
          Promise.resolve({ kind: 'READY', execution }),
        ),
    };
    const runner = new TelegramCrmAutomationRunnerService(
      prisma as never,
      authorization as never,
      claims as never,
      {
        resolve: jest.fn().mockResolvedValue({
          conversationId: 'conversation-1',
          mtprotoAccountId: 'account-1',
          telegramUserId: '123',
          telegramAccessHash: '456',
          username: null,
        }),
      } as never,
      new TelegramCrmAutomationFinalizerService(prisma as never),
      runtime as never,
      { emit: jest.fn() } as never,
    );

    expect((await runner.processDueBatch(1)).failed).toBe(1);
    expect(sendText).not.toHaveBeenCalled();
    expect((await runner.processDueBatch(1)).retried).toBe(1);
    expect((await runner.processDueBatch(1)).sent).toBe(1);
    expect(sendText).toHaveBeenCalledTimes(2);
    expect(sendText.mock.calls[0]![0].randomId).toBe(
      sendText.mock.calls[1]![0].randomId,
    );
    expect(createdMessages).toHaveLength(1);
  });

  it('has no startup/sync/history subscription path into occurrence materialization', () => {
    const initialSync = fs.readFileSync(
      path.resolve(__dirname, 'telegram-crm-initial-sync.service.ts'),
      'utf8',
    );
    expect(initialSync).not.toMatch(
      /AutomationOccurrence|recordDeal|recordVerified/,
    );
  });

  it('uses only the explicit dedicated follow-up fields, never nextContactAt', () => {
    const occurrences = fs.readFileSync(
      path.resolve(__dirname, 'telegram-crm-automation-occurrence.service.ts'),
      'utf8',
    );
    expect(occurrences).toContain('customerFollowUpAt');
    expect(occurrences).toContain('customerFollowUpVersion');
    expect(occurrences).not.toContain('nextContactAt');
  });
});
