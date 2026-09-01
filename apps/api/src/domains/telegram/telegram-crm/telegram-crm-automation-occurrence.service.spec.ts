import { TelegramCrmAutomationOccurrenceService } from './telegram-crm-automation-occurrence.service';
import { CrmAutomationSaleRow } from './telegram-crm-automation-sale';

describe('TelegramCrmAutomationOccurrenceService', () => {
  const occurredAt = new Date('2026-09-01T10:00:00.000Z');

  function sale(id = 'deal-1'): CrmAutomationSaleRow {
    const enabledAt = new Date('2026-09-01T09:00:00.000Z');
    return {
      id,
      workspaceId: 'workspace-1',
      advertiserId: 'contact-1',
      title: 'Launch',
      advertiserName: 'Customer',
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
      advertiser: {
        id: 'contact-1',
        workspaceId: 'workspace-1',
        displayName: 'Customer',
        automationLocale: null,
        automatedMessagesEnabled: true,
        automatedMessagesEnabledAt: enabledAt,
        prePublicationAutomationOverride: 'INHERIT',
        prePublicationAutomationEnabledAt: null,
        publishedLinksAutomationOverride: 'INHERIT',
        publishedLinksAutomationEnabledAt: null,
        followUpAutomationOverride: 'INHERIT',
        followUpAutomationEnabledAt: null,
      },
      workspace: {
        telegramAdCrmWorkspaceSettings: {
          customerTelegramAutomationsEnabled: true,
          customerTelegramAutomationsEnabledAt: enabledAt,
          automationLocale: 'en',
          prePublicationReminderEnabled: true,
          prePublicationReminderEnabledAt: enabledAt,
          publishedLinksEnabled: true,
          publishedLinksEnabledAt: enabledAt,
          followUpEnabled: true,
          followUpEnabledAt: enabledAt,
        },
      },
      placements: [
        {
          id: `placement-${id}`,
          status: 'SCHEDULED',
          scheduledAt: new Date('2026-09-02T12:00:00.000Z'),
          timezone: 'Europe/Warsaw',
          publishedAt: null,
          telegramPost: null,
          telegramChannel: {
            title: 'Channel',
            username: 'channel_name',
            telegramChatId: '-1001234567890',
          },
        },
      ],
    } as CrmAutomationSaleRow;
  }

  function setup() {
    const prisma = {
      telegramAdSale: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      telegramCrmCustomerAutomationExecution: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'execution-1' }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const policy = {
      evaluate: jest
        .fn()
        .mockReturnValue({ allowed: true, reason: 'ELIGIBLE' }),
    };
    return {
      prisma,
      service: new TelegramCrmAutomationOccurrenceService(
        prisma as never,
        policy as never,
      ),
    };
  }

  it('materializes 500 freshly-created Deals with one read and one insert batch', async () => {
    const { prisma, service } = setup();
    const sales = Array.from({ length: 500 }, (_, index) =>
      sale(`deal-${index}`),
    );
    prisma.telegramAdSale.findMany.mockResolvedValue(sales);
    prisma.telegramCrmCustomerAutomationExecution.createMany.mockResolvedValue({
      count: 500,
    });

    await service.recordDealsCreated(
      'workspace-1',
      sales.map((item) => item.id),
      occurredAt,
    );

    expect(prisma.telegramAdSale.findMany).toHaveBeenCalledTimes(1);
    expect(
      prisma.telegramCrmCustomerAutomationExecution.createMany,
    ).toHaveBeenCalledTimes(1);
    expect(
      prisma.telegramCrmCustomerAutomationExecution.findUnique,
    ).not.toHaveBeenCalled();
  });

  it('materializes 100 verified publications without per-Deal reads or writes', async () => {
    const { prisma, service } = setup();
    const sales = Array.from({ length: 100 }, (_, index) => {
      const item = sale(`deal-${index}`);
      item.placements[0] = {
        ...item.placements[0],
        status: 'PUBLISHED',
        publishedAt: new Date('2026-09-01T12:00:00Z'),
        telegramPost: { telegramMessageId: String(index + 1) },
      };
      return item;
    });
    prisma.telegramAdSale.findMany.mockResolvedValue(sales);
    prisma.telegramCrmCustomerAutomationExecution.createMany.mockResolvedValue({
      count: 100,
    });

    await service.recordVerifiedPublications(
      sales.map((item) => ({ workspaceId: item.workspaceId, dealId: item.id })),
    );

    expect(prisma.telegramAdSale.findMany).toHaveBeenCalledTimes(1);
    expect(
      prisma.telegramCrmCustomerAutomationExecution.createMany,
    ).toHaveBeenCalledTimes(1);
    expect(prisma.telegramAdSale.findFirst).not.toHaveBeenCalled();
    expect(
      prisma.telegramCrmCustomerAutomationExecution.create,
    ).not.toHaveBeenCalled();
  });

  it('invalidates a claimed stale reminder with a status-and-source CAS', async () => {
    const { prisma, service } = setup();
    prisma.telegramAdSale.findFirst.mockResolvedValue(sale());
    prisma.telegramCrmCustomerAutomationExecution.findUnique.mockResolvedValue({
      id: 'execution-1',
      status: 'PROCESSING',
      sourceVersion: 'old-source',
    });
    prisma.telegramCrmCustomerAutomationExecution.updateMany.mockResolvedValue({
      count: 1,
    });

    await service.recordScheduleChanged('workspace-1', 'deal-1', occurredAt);

    expect(
      prisma.telegramCrmCustomerAutomationExecution.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'execution-1',
          status: 'PROCESSING',
          sourceVersion: 'old-source',
        },
        data: expect.objectContaining({
          status: 'PENDING',
          leaseOwner: null,
          leaseExpiresAt: null,
        }),
      }),
    );
  });

  it('does not mutate an execution when the runner wins the CAS to SENDING', async () => {
    const { prisma, service } = setup();
    prisma.telegramAdSale.findFirst.mockResolvedValue(sale());
    prisma.telegramCrmCustomerAutomationExecution.findUnique.mockResolvedValue({
      id: 'execution-1',
      status: 'PROCESSING',
      sourceVersion: 'old-source',
    });
    prisma.telegramCrmCustomerAutomationExecution.updateMany.mockResolvedValue({
      count: 0,
    });

    await service.recordScheduleChanged('workspace-1', 'deal-1', occurredAt);

    expect(
      prisma.telegramCrmCustomerAutomationExecution.create,
    ).not.toHaveBeenCalled();
    expect(
      prisma.telegramCrmCustomerAutomationExecution.updateMany,
    ).toHaveBeenCalledTimes(1);
  });

  it('keeps ambiguous FAILED delivery terminal on later schedule refresh', async () => {
    const { prisma, service } = setup();
    prisma.telegramAdSale.findFirst.mockResolvedValue(sale());
    prisma.telegramCrmCustomerAutomationExecution.findUnique.mockResolvedValue({
      id: 'execution-1',
      status: 'FAILED',
      sourceVersion: 'old-source',
    });

    await service.recordScheduleChanged('workspace-1', 'deal-1', occurredAt);

    expect(
      prisma.telegramCrmCustomerAutomationExecution.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('fails closed for a completed placement without a buildable post URL', async () => {
    const { prisma, service } = setup();
    const published = sale();
    published.placements[0] = {
      ...published.placements[0],
      status: 'COMPLETED',
      publishedAt: new Date('2026-09-01T11:00:00.000Z'),
      telegramPost: { telegramMessageId: '42' },
      telegramChannel: {
        title: 'Private',
        username: null,
        telegramChatId: null,
      },
    };
    prisma.telegramAdSale.findFirst.mockResolvedValue(published);

    await service.recordVerifiedPublication('workspace-1', 'deal-1');

    expect(
      prisma.telegramCrmCustomerAutomationExecution.create,
    ).not.toHaveBeenCalled();
    expect(
      prisma.telegramCrmCustomerAutomationExecution.findUnique,
    ).not.toHaveBeenCalled();
  });

  it('uses max actual publication time and a full SHA-256 source fingerprint', async () => {
    const { prisma, service } = setup();
    const published = sale();
    published.placements = [
      {
        ...published.placements[0],
        status: 'PUBLISHED',
        publishedAt: new Date('2026-09-01T11:00:00.000Z'),
        telegramPost: { telegramMessageId: '41' },
      },
      {
        ...published.placements[0],
        id: 'placement-2',
        status: 'COMPLETED',
        publishedAt: new Date('2026-09-01T12:00:00.000Z'),
        telegramPost: { telegramMessageId: '42' },
      },
    ];
    prisma.telegramAdSale.findFirst.mockResolvedValue(published);

    await service.recordVerifiedPublication('workspace-1', 'deal-1');

    const data =
      prisma.telegramCrmCustomerAutomationExecution.create.mock.calls[0]![0]
        .data;
    expect(data.eventOccurredAt).toEqual(new Date('2026-09-01T12:00:00.000Z'));
    expect(data.sourceVersion).toMatch(/^[a-f0-9]{64}$/);
  });
});
