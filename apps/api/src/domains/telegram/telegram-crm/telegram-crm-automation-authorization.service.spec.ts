import { TelegramCrmAutomationAuthorizationService } from './telegram-crm-automation-authorization.service';
import { TelegramCrmAutomationPolicyService } from './telegram-crm-automation-policy.service';
import { crmAutomationSourceFingerprint } from './telegram-crm-automation-source';

describe('TelegramCrmAutomationAuthorizationService', () => {
  const scheduledAt = new Date('2030-09-01T12:00:00Z');
  const enabledAt = new Date('2026-09-01T09:00:00Z');

  function execution() {
    const placements = [
      {
        id: 'placement-1',
        status: 'SCHEDULED',
        scheduledAt,
        timezone: 'Europe/Warsaw',
        publishedAt: null,
        telegramPost: null,
        telegramChannel: {
          title: 'Channel',
          username: 'channel_name',
          telegramChatId: '-100123',
        },
      },
    ];
    return {
      id: 'execution-1',
      workspaceId: 'workspace-1',
      automationType: 'PRE_PUBLICATION_REMINDER',
      contactId: 'contact-1',
      telegramAdSaleId: 'deal-1',
      eventKey: 'deal:deal-1:pre-publication',
      eventOccurredAt: new Date('2026-09-01T10:00:00Z'),
      historical: false,
      attempts: 1,
      maxAttempts: 4,
      renderedText: 'Reminder',
      templateKey: 'crm.automation.prePublication.singleTime',
      locale: 'en',
      stableRandomId: '42',
      sourceVersion: crmAutomationSourceFingerprint(
        placements.map((placement) => ({
          id: placement.id,
          status: placement.status,
          scheduledAt: placement.scheduledAt.toISOString(),
          timezone: placement.timezone,
          channelTitle: placement.telegramChannel.title,
        })),
      ),
      reason: null,
      conversationId: 'conversation-1',
      mtprotoAccountId: 'account-1',
      sale: {
        status: 'CONFIRMED',
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
        customerFollowUpAt: null,
        customerFollowUpVersion: 0,
        placements,
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
    } as const;
  }

  function setup(fresh = execution()) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'execution-1' }]),
      telegramCrmCustomerAutomationExecution: {
        findFirst: jest.fn().mockResolvedValue(fresh),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      telegramCrmConversation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'conversation-1' }),
      },
      telegramUserAccountIntegration: {
        findFirst: jest.fn().mockResolvedValue({ id: 'account-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation) => operation(tx)),
    };
    return {
      tx,
      prisma,
      service: new TelegramCrmAutomationAuthorizationService(
        prisma as never,
        new TelegramCrmAutomationPolicyService(),
      ),
    };
  }

  it('observes a Contact OFF commit before the atomic SENDING transition', async () => {
    const stale = execution();
    const fresh = {
      ...stale,
      contact: {
        ...stale.contact,
        automatedMessagesEnabled: false,
        automatedMessagesEnabledAt: null,
      },
    };
    const { tx, service } = setup(fresh as never);

    await expect(
      service.authorize(stale as never, 'worker-1', {
        conversationId: 'conversation-1',
        mtprotoAccountId: 'account-1',
      }),
    ).resolves.toMatchObject({ kind: 'DENIED', reason: 'CONTACT_DISABLED' });
    expect(
      tx.telegramCrmCustomerAutomationExecution.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('observes a schedule mutation before the atomic SENDING transition', async () => {
    const stale = execution();
    const fresh = {
      ...stale,
      sale: {
        ...stale.sale,
        placements: stale.sale.placements.map((placement) => ({
          ...placement,
          scheduledAt: new Date('2030-09-02T12:00:00Z'),
        })),
      },
    };
    const { tx, service } = setup(fresh as never);

    await expect(
      service.authorize(stale as never, 'worker-1', {
        conversationId: 'conversation-1',
        mtprotoAccountId: 'account-1',
      }),
    ).resolves.toMatchObject({
      kind: 'DENIED',
      reason: 'SOURCE_FACT_CHANGED',
    });
    expect(
      tx.telegramCrmCustomerAutomationExecution.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('denies a cancelled Deal at the final locked barrier', async () => {
    const stale = execution();
    const fresh = {
      ...stale,
      sale: { ...stale.sale, status: 'CANCELLED' },
    };
    const { tx, service } = setup(fresh as never);

    expect(service.preflight(fresh as never)).toEqual({
      allowed: false,
      reason: 'DEAL_CANCELLED',
    });
    await expect(
      service.authorize(stale as never, 'worker-1', {
        conversationId: 'conversation-1',
        mtprotoAccountId: 'account-1',
      }),
    ).resolves.toMatchObject({ kind: 'DENIED', reason: 'DEAL_CANCELLED' });
    expect(
      tx.telegramCrmCustomerAutomationExecution.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('commits SENDING only with the pinned workspace-scoped envelope and source', async () => {
    const current = execution();
    const { tx, service } = setup(current);

    await expect(
      service.authorize(current as never, 'worker-1', {
        conversationId: 'conversation-1',
        mtprotoAccountId: 'account-1',
      }),
    ).resolves.toMatchObject({ kind: 'READY' });
    expect(
      tx.telegramCrmCustomerAutomationExecution.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          telegramAdSaleId: 'deal-1',
          conversationId: 'conversation-1',
          mtprotoAccountId: 'account-1',
          sourceVersion: current.sourceVersion,
        }),
        data: { status: 'SENDING' },
      }),
    );
  });
});
