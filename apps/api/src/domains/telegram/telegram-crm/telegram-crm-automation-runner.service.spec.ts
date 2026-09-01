import { TelegramCrmAutomationRunnerService } from './telegram-crm-automation-runner.service';

describe('TelegramCrmAutomationRunnerService', () => {
  function setup() {
    const prisma = {
      telegramCrmCustomerAutomationExecution: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const claims = {
      ownerId: 'worker-1',
      terminalizeExhausted: jest.fn(),
      claim: jest.fn(),
    };
    const authorization = {
      preflight: jest.fn(),
      sourceStillCurrent: jest.fn(),
      authorize: jest.fn(),
    };
    const conversations = { resolve: jest.fn() };
    const runtime = { withAccountHandle: jest.fn() };
    const service = new TelegramCrmAutomationRunnerService(
      prisma as never,
      authorization as never,
      claims as never,
      conversations as never,
      { finalize: jest.fn() } as never,
      runtime as never,
      { emit: jest.fn() } as never,
    );
    return {
      prisma,
      claims,
      authorization,
      conversations,
      runtime,
      service,
    };
  }

  it('drains 1000 equal-due claims in bounded 25-row leases', async () => {
    const { prisma, claims, service } = setup();
    let sequence = 0;
    claims.claim.mockImplementation((limit: number) =>
      Promise.resolve(
        Array.from({ length: limit }, () => `execution-${sequence++}`),
      ),
    );
    prisma.telegramCrmCustomerAutomationExecution.findFirst.mockResolvedValue(
      null,
    );

    await expect(service.processDueBatch(1000)).resolves.toEqual({
      processed: 1000,
      sent: 0,
      skipped: 1000,
      retried: 0,
      failed: 0,
    });
    expect(claims.claim).toHaveBeenCalledTimes(40);
    expect(claims.claim).toHaveBeenCalledWith(25);
  });

  it('checks non-target policy gates before resolving or creating a Conversation', async () => {
    const { prisma, claims, authorization, conversations, service } = setup();
    claims.claim.mockResolvedValueOnce(['execution-1']);
    authorization.preflight.mockReturnValue({
      allowed: false,
      reason: 'WORKSPACE_DISABLED',
    });
    prisma.telegramCrmCustomerAutomationExecution.findFirst.mockResolvedValue({
      id: 'execution-1',
      workspaceId: 'workspace-1',
      automationType: 'PRE_PUBLICATION_REMINDER',
      contactId: 'contact-1',
      telegramAdSaleId: 'deal-1',
      eventKey: 'deal:deal-1:pre-publication',
      eventOccurredAt: new Date('2026-09-01T10:00:00Z'),
      historical: false,
      attempts: 1,
      maxAttempts: 5,
      renderedText: 'Reminder',
      templateKey: 'crm.automation.prePublication.singleTime',
      locale: 'en',
      stableRandomId: null,
      sourceVersion: 'source',
      conversationId: null,
      mtprotoAccountId: null,
      sale: {
        workspaceId: 'workspace-1',
        advertiserId: 'contact-1',
        customerAutomationOverride: 'INHERIT',
        customerAutomationEligibleAt: new Date('2026-09-01T09:00:00Z'),
        prePublicationAutomationOverride: 'INHERIT',
        prePublicationAutomationEnabledAt: null,
        publishedLinksAutomationOverride: 'INHERIT',
        publishedLinksAutomationEnabledAt: null,
        followUpAutomationOverride: 'INHERIT',
        followUpAutomationEnabledAt: null,
        customerFollowUpAt: null,
        customerFollowUpVersion: 0,
        placements: [],
      },
      contact: {
        id: 'contact-1',
        workspaceId: 'workspace-1',
        automatedMessagesEnabled: true,
        automatedMessagesEnabledAt: new Date('2026-09-01T09:00:00Z'),
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
          customerTelegramAutomationsEnabled: false,
          customerTelegramAutomationsEnabledAt: null,
          prePublicationReminderEnabled: true,
          prePublicationReminderEnabledAt: new Date('2026-09-01T09:00:00Z'),
          publishedLinksEnabled: true,
          publishedLinksEnabledAt: new Date('2026-09-01T09:00:00Z'),
          followUpEnabled: true,
          followUpEnabledAt: new Date('2026-09-01T09:00:00Z'),
        },
      },
    });

    await service.processDueBatch(1);

    expect(conversations.resolve).not.toHaveBeenCalled();
    expect(
      prisma.telegramCrmCustomerAutomationExecution.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: 'WORKSPACE_DISABLED' }),
      }),
    );
  });

  it('does not issue a new runtime call when an ambiguous send recovery now fails a gate', async () => {
    const { prisma, claims, authorization, conversations, runtime, service } =
      setup();
    const execution = {
      id: 'execution-1',
      workspaceId: 'workspace-1',
      automationType: 'FOLLOW_UP',
      contactId: 'contact-1',
      telegramAdSaleId: 'deal-1',
      eventKey: 'deal:deal-1:follow-up:1',
      eventOccurredAt: new Date('2026-09-01T10:00:00Z'),
      historical: false,
      attempts: 2,
      maxAttempts: 4,
      renderedText: 'Following up',
      templateKey: 'crm.automation.followUp.configured',
      locale: 'en',
      stableRandomId: '42',
      sourceVersion: '1',
      reason: 'AMBIGUOUS_SEND_RECOVERY',
      conversationId: 'conversation-1',
      mtprotoAccountId: 'account-1',
      sale: {
        workspaceId: 'workspace-1',
        advertiserId: 'contact-1',
        customerAutomationOverride: 'INHERIT',
        customerAutomationEligibleAt: new Date('2026-09-01T09:00:00Z'),
        prePublicationAutomationOverride: 'INHERIT',
        prePublicationAutomationEnabledAt: null,
        publishedLinksAutomationOverride: 'INHERIT',
        publishedLinksAutomationEnabledAt: null,
        followUpAutomationOverride: 'INHERIT',
        followUpAutomationEnabledAt: null,
        customerFollowUpAt: new Date('2026-09-01T11:00:00Z'),
        customerFollowUpVersion: 1,
        placements: [],
      },
      contact: {
        id: 'contact-1',
        workspaceId: 'workspace-1',
        automatedMessagesEnabled: false,
        automatedMessagesEnabledAt: null,
        prePublicationAutomationOverride: 'INHERIT',
        prePublicationAutomationEnabledAt: null,
        publishedLinksAutomationOverride: 'INHERIT',
        publishedLinksAutomationEnabledAt: null,
        followUpAutomationOverride: 'INHERIT',
        followUpAutomationEnabledAt: null,
        ownerMemberId: null,
      },
      workspace: { telegramAdCrmWorkspaceSettings: null },
    };
    claims.claim.mockResolvedValueOnce(['execution-1']);
    prisma.telegramCrmCustomerAutomationExecution.findFirst.mockResolvedValue(
      execution,
    );
    conversations.resolve.mockResolvedValue({
      conversationId: 'conversation-1',
      mtprotoAccountId: 'account-1',
      telegramUserId: '123',
      telegramAccessHash: '456',
      username: null,
    });
    authorization.authorize.mockResolvedValue({
      kind: 'DENIED',
      reason: 'CONTACT_DISABLED',
      execution,
    });

    await expect(service.processDueBatch(1)).resolves.toMatchObject({
      failed: 1,
      sent: 0,
    });
    expect(runtime.withAccountHandle).not.toHaveBeenCalled();
    expect(
      prisma.telegramCrmCustomerAutomationExecution.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          reason: 'AMBIGUOUS_SEND_UNRESOLVED',
        }),
      }),
    );
  });
});
