import { Prisma } from '@prisma/client';
import { TelegramCrmContactReadService } from './telegram-crm-contact-read.service';

const date = new Date('2026-08-31T12:00:00.000Z');

const contactRow = () => ({
  id: 'contact-1',
  workspaceId: 'workspace-1',
  displayName: 'Ada Client',
  companyName: null,
  telegramUsername: 'ada',
  phone: null,
  email: null,
  website: null,
  description: null,
  source: null,
  stage: 'LEAD',
  ownerMemberId: 'member-1',
  automatedMessagesEnabled: false,
  automatedMessagesEnabledAt: null,
  lastContactAt: date,
  lastInboundAt: date,
  lastOutboundAt: date,
  lastPurchaseAt: null,
  nextContactAt: null,
  archivedAt: null,
  createdAt: date,
  updatedAt: date,
  ownerMember: {
    id: 'member-1',
    user: { name: 'Owner', email: 'owner@example.com' },
  },
  crmPeers: [
    {
      id: 'peer-1',
      telegramUserId: '42',
      username: 'ada',
      firstName: 'Ada',
      lastName: null,
      photoUrl: 'https://cdn.example/ada.jpg',
    },
  ],
  crmConversations: [
    {
      mtprotoAccount: {
        id: 'account-1',
        label: 'Manager one',
        username: 'manager_one',
        photoUrl: null,
      },
      messages: [
        {
          id: 'message-1',
          conversationId: 'conversation-1',
          direction: 'INBOUND',
          origin: 'TELEGRAM_SYNC',
          text: 'Hello',
          sentAt: date,
          readState: 'UNREAD',
        },
      ],
    },
    {
      mtprotoAccount: {
        id: 'account-2',
        label: 'Manager two',
        username: 'manager_two',
        photoUrl: null,
      },
      messages: [],
    },
  ],
  tasks: [],
  sales: [
    {
      id: 'deal-1',
      title: 'September placement',
      status: 'CONFIRMED',
      settlementCurrency: 'USD',
      _count: { placements: 2 },
      placements: [{ scheduledAt: date }],
    },
  ],
  _count: { sales: 1, crmConversations: 101 },
});

describe('TelegramCrmContactReadService', () => {
  const captureReadNoReplySql = async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }]);
    const service = new TelegramCrmContactReadService(
      {
        $queryRaw: queryRaw,
        telegramAdvertiser: {
          fields: { lastInboundAt: 'lastInboundAt-field-reference' },
          findMany: jest.fn(),
        },
      } as never,
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
        scope: jest.fn().mockResolvedValue({}),
      } as never,
    );

    await service.list('user-1', {
      page: 1,
      pageSize: 25,
      followUpView: 'READ_NO_REPLY',
    });

    const pageQuery = queryRaw.mock.calls[0]?.[0] as Prisma.Sql;
    return {
      text: pageQuery.strings.join(' '),
      values: pageQuery.values,
    };
  };

  it('combines workspace isolation with view-own ownership scope', async () => {
    const prisma = {
      $transaction: jest.fn().mockResolvedValue([[], 0]),
      telegramAdvertiser: {
        findMany: jest.fn().mockReturnValue('rows'),
        count: jest.fn().mockReturnValue('count'),
      },
    };
    const authorization = {
      require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      scope: jest.fn().mockResolvedValue({ assignedMemberId: 'member-1' }),
    };
    const service = new TelegramCrmContactReadService(
      prisma as never,
      authorization as never,
    );

    await service.list('user-1', { page: 1, pageSize: 25 });

    expect(authorization.require).toHaveBeenCalledWith(
      'user-1',
      'adSales.crm.view',
    );
    expect(authorization.scope).toHaveBeenCalledWith(
      'user-1',
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    expect(prisma.telegramAdvertiser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          ownerMemberId: 'member-1',
        }),
      }),
    );
  });

  it('does not add an owner constraint for view-all access', async () => {
    const prisma = {
      $transaction: jest.fn().mockResolvedValue([[], 0]),
      telegramAdvertiser: {
        findMany: jest.fn().mockReturnValue('rows'),
        count: jest.fn().mockReturnValue('count'),
      },
    };
    const service = new TelegramCrmContactReadService(
      prisma as never,
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
        scope: jest.fn().mockResolvedValue({}),
      } as never,
    );

    await service.list('user-1', { page: 1, pageSize: 25 });

    expect(prisma.telegramAdvertiser.findMany.mock.calls[0][0].where).toEqual({
      workspaceId: 'workspace-1',
    });
  });

  it('uses the newest unanswered outbound across all account Conversations for READ_NO_REPLY', async () => {
    const query = await captureReadNoReplySql();

    expect(query.text).toContain(
      'conversation."contactId" = advertiser."id"',
    );
    expect(query.text).toContain(
      'ORDER BY message."sentAt" DESC, message."id" DESC',
    );
    expect(query.text).toContain('LIMIT 1');
    expect(query.values).toEqual(
      expect.arrayContaining(['ACTIVE', 'OUTBOUND', 'READ']),
    );
  });

  it('allows an older UNKNOWN outbound when the latest unanswered outbound is READ', async () => {
    const query = await captureReadNoReplySql();

    expect(query.text).toContain(
      'OR message."sentAt" > advertiser."lastInboundAt"',
    );
    expect(query.text).not.toMatch(/message\."readState"[^)]*(?:<>|NOT)/);
  });

  it('returns enriched multi-account cards with authoritative aggregates and an active Deal independent of Contact stage', async () => {
    const row = contactRow();
    const prisma = {
      $transaction: jest.fn().mockResolvedValue([[row], 1]),
      telegramAdvertiser: {
        findMany: jest.fn().mockReturnValue('rows'),
        count: jest.fn().mockReturnValue('count'),
      },
      telegramCrmConversation: {
        groupBy: jest
          .fn()
          .mockResolvedValue([
            { contactId: 'contact-1', _sum: { unreadCount: 7 } },
          ]),
      },
      telegramAdSalePlacement: {
        groupBy: jest.fn().mockResolvedValue([
          {
            telegramAdSaleId: 'deal-1',
            _sum: { agreedPrice: new Prisma.Decimal(100) },
          },
        ]),
      },
      telegramAdSalePayment: {
        groupBy: jest.fn().mockResolvedValue([
          {
            telegramAdSaleId: 'deal-1',
            _sum: { amount: new Prisma.Decimal(40) },
          },
        ]),
      },
    };
    const service = new TelegramCrmContactReadService(
      prisma as never,
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
        scope: jest.fn().mockResolvedValue({}),
      } as never,
    );

    const result = await service.list('user-1', {
      page: 1,
      pageSize: 25,
      stage: 'LEAD',
    });

    expect(result.items[0]).toMatchObject({
      stage: 'LEAD',
      peer: { id: 'peer-1', photoUrl: 'https://cdn.example/ada.jpg' },
      unreadCount: 7,
      conversationCount: 101,
      conversationAccounts: [
        { id: 'account-1', username: 'manager_one' },
        { id: 'account-2', username: 'manager_two' },
      ],
      lastMessage: { id: 'message-1', text: 'Hello' },
      activeDeal: {
        id: 'deal-1',
        placementCount: 2,
        agreedAmount: '100',
        paidAmount: '40',
        paymentStatus: 'PARTIALLY_PAID',
        scheduledAt: '2026-08-31T12:00:00.000Z',
      },
    });
    const select = prisma.telegramAdvertiser.findMany.mock.calls[0][0].select;
    expect(select.sales.where).toEqual(
      expect.objectContaining({ status: expect.any(Object) }),
    );
    expect(select.crmConversations.take).toBe(12);
    expect(prisma.telegramCrmConversation.groupBy).toHaveBeenCalledTimes(1);
  });

  it('does not expose Inbox unread to a view-own member', async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { unreadCount: 3 } });
    const service = new TelegramCrmContactReadService(
      { telegramCrmConversation: { aggregate } } as never,
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
        scope: jest.fn().mockResolvedValue({ assignedMemberId: 'member-1' }),
      } as never,
    );

    await expect(service.unread('user-1')).resolves.toEqual({
      total: 3,
      contacts: 3,
      inbox: 0,
    });
    expect(aggregate).toHaveBeenCalledTimes(1);
    expect(aggregate.mock.calls[0][0].where).toMatchObject({
      workspaceId: 'workspace-1',
      contact: { ownerMemberId: 'member-1' },
    });
  });

  it('includes Inbox unread only for view-any access', async () => {
    const aggregate = jest
      .fn()
      .mockResolvedValueOnce({ _sum: { unreadCount: 3 } })
      .mockResolvedValueOnce({ _sum: { unreadCount: 4 } });
    const service = new TelegramCrmContactReadService(
      { telegramCrmConversation: { aggregate } } as never,
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
        scope: jest.fn().mockResolvedValue({}),
      } as never,
    );

    await expect(service.unread('user-1')).resolves.toEqual({
      total: 7,
      contacts: 3,
      inbox: 4,
    });
    expect(aggregate.mock.calls[1][0].where).toMatchObject({
      workspaceId: 'workspace-1',
      contactId: null,
    });
  });

  it('returns workspace-scoped Contact detail with authoritative unread and counts', async () => {
    const row = {
      ...contactRow(),
      tags: [{ tag: { id: 'tag-1', name: 'VIP', color: '#ff00ff' } }],
      sales: [
        {
          id: 'deal-1',
          customerAutomationOverride: 'DISABLED',
          customerAutomationEligibleAt: null,
        },
      ],
      _count: {
        sales: 1,
        crmConversations: 2,
        tasks: 3,
        activities: 4,
      },
    };
    const prisma = {
      telegramAdvertiser: { findFirst: jest.fn().mockResolvedValue(row) },
      telegramAdSale: { count: jest.fn().mockResolvedValue(5) },
      telegramCrmConversation: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { unreadCount: 6 },
        }),
      },
      $queryRaw: jest.fn().mockResolvedValue([
        {
          currency: 'USD',
          agreedAmount: 100,
          paidAmount: 40,
          outstandingAmount: 60,
        },
      ]),
    };
    const service = new TelegramCrmContactReadService(
      prisma as never,
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
        scope: jest.fn().mockResolvedValue({ assignedMemberId: 'member-1' }),
      } as never,
    );

    const result = await service.get('user-1', 'contact-1');

    expect(result).toMatchObject({
      id: 'contact-1',
      unreadCount: 6,
      peers: [{ id: 'peer-1' }],
      tags: [{ id: 'tag-1', name: 'VIP' }],
      paymentSummary: [{ currency: 'USD', outstandingAmount: '60' }],
      dealAutomation: [{ dealId: 'deal-1', override: 'DISABLED' }],
      counts: { conversations: 2, deals: 5, openTasks: 3, activities: 4 },
    });
    expect(prisma.telegramAdvertiser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'contact-1',
          workspaceId: 'workspace-1',
          ownerMemberId: 'member-1',
        },
      }),
    );
    expect(prisma.telegramCrmConversation.aggregate).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        contactId: 'contact-1',
        state: 'ACTIVE',
      },
      _sum: { unreadCount: true },
    });
  });
});
