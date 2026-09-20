import { ForbiddenException } from '@nestjs/common';
import { MemberFinanceReadService } from './member-finance-read.service';

describe('MemberFinanceReadService', () => {
  const prisma = {
    workspace: { findUniqueOrThrow: jest.fn() },
    workspaceMember: { findMany: jest.fn(), findFirst: jest.fn() },
    telegramAdSalePayment: { findMany: jest.fn() },
    memberCompensationSettlement: { findMany: jest.fn() },
    investment: { findMany: jest.fn() },
    transaction: { findMany: jest.fn() },
  };
  const workspaceService = {
    resolveWorkspaceMembershipForUser: jest.fn(),
  };
  const conversion = {};
  let service: MemberFinanceReadService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MemberFinanceReadService(
      prisma as never,
      workspaceService as never,
      conversion as never,
    );
    workspaceService.resolveWorkspaceMembershipForUser.mockResolvedValue({
      id: 'seller-1',
      workspaceId: 'workspace-1',
      role: 'member',
    });
    prisma.workspace.findUniqueOrThrow.mockResolvedValue({
      primaryCurrency: 'UAH',
    });
    prisma.telegramAdSalePayment.findMany.mockResolvedValue([
      {
        id: 'payment-1',
        paidAt: new Date('2026-09-12T10:00:00Z'),
        amountInPrimaryCurrency: 1_000,
        sale: {
          id: 'sale-1',
          title: 'Ad sale',
          advertiserName: 'Advertiser',
          sellerMemberId: 'seller-1',
          sellerCommissionRate: 10,
        },
      },
    ]);
    prisma.memberCompensationSettlement.findMany.mockResolvedValue([
      {
        id: 'settlement-1',
        workspaceMemberId: 'seller-1',
        type: 'INVESTMENT',
        amountInPrimaryCurrency: 25,
        date: new Date('2026-09-12T11:00:00Z'),
        notes: null,
      },
    ]);
    prisma.investment.findMany.mockResolvedValue([
      {
        id: 'investment-1',
        workspaceMemberId: 'seller-1',
        origin: 'SALARY',
        movementType: 'CONTRIBUTION',
        amountInPrimaryCurrency: 25,
        date: new Date('2026-09-12T11:00:00Z'),
        notes: null,
      },
      {
        id: 'investment-2',
        workspaceMemberId: 'seller-1',
        origin: 'REINVESTMENT',
        movementType: 'CONTRIBUTION',
        amountInPrimaryCurrency: 75,
        date: new Date('2026-09-12T12:00:00Z'),
        notes: null,
      },
    ]);
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.workspaceMember.findMany.mockResolvedValue([{ id: 'seller-1' }]);
  });

  it('shows only the current member summary to a non-owner', async () => {
    await expect(service.summaries('seller-user')).resolves.toEqual([
      expect.objectContaining({
        memberId: 'seller-1',
        commissionEarned: 100,
        commissionSettled: 25,
        commissionPayable: 75,
        investments: expect.objectContaining({
          salary: 25,
          investorEarnings: 0,
          principal: 25,
          total: 25,
        }),
      }),
    ]);
  });

  it('does not expose another member history to an employee', async () => {
    await expect(
      service.details('seller-user', 'another-member'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.workspaceMember.findFirst).not.toHaveBeenCalled();
  });

  it('divides all earned revenue by the current visible investor shares', async () => {
    prisma.telegramAdSalePayment.findMany.mockResolvedValue([]);
    prisma.memberCompensationSettlement.findMany.mockResolvedValue([]);
    prisma.investment.findMany.mockResolvedValue([
      {
        id: 'm1-first',
        workspaceMemberId: 'm1',
        origin: 'EXTERNAL',
        movementType: 'CONTRIBUTION',
        amountInPrimaryCurrency: 100,
        date: new Date('2026-09-01'),
      },
      {
        id: 'm2-first',
        workspaceMemberId: 'm2',
        origin: 'EXTERNAL',
        movementType: 'CONTRIBUTION',
        amountInPrimaryCurrency: 100,
        date: new Date('2026-09-01'),
      },
      {
        id: 'm1-second',
        workspaceMemberId: 'm1',
        origin: 'EXTERNAL',
        movementType: 'CONTRIBUTION',
        amountInPrimaryCurrency: 100,
        date: new Date('2026-09-03'),
      },
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'income-before',
        type: 'income',
        date: new Date('2026-09-02'),
        amountInPrimaryCurrency: 100,
        category: 'Channel revenue',
        categoryRef: { key: 'channel_advertising_revenue' },
        telegramAdSalePayment: null,
      },
      {
        id: 'income-after',
        type: 'income',
        date: new Date('2026-09-04'),
        amountInPrimaryCurrency: 120,
        category: 'Channel revenue',
        categoryRef: { key: 'channel_advertising_revenue' },
        telegramAdSalePayment: null,
      },
    ]);
    prisma.workspaceMember.findMany.mockResolvedValue([
      { id: 'm1' },
      { id: 'm2' },
    ]);

    const rows = await service.summaryRows('workspace-1');

    expect(rows.byMember.get('m1')?.investorEarnings).toBe(146.67);
    expect(rows.byMember.get('m2')?.investorEarnings).toBe(73.33);
  });

  it('does not distribute profit to members with hidden finance', async () => {
    prisma.telegramAdSalePayment.findMany.mockResolvedValue([]);
    prisma.memberCompensationSettlement.findMany.mockResolvedValue([]);
    prisma.investment.findMany.mockResolvedValue([
      {
        id: 'visible',
        workspaceMemberId: 'visible',
        origin: 'EXTERNAL',
        movementType: 'CONTRIBUTION',
        amountInPrimaryCurrency: 100,
        date: new Date('2026-09-01'),
      },
      {
        id: 'hidden',
        workspaceMemberId: 'hidden',
        origin: 'EXTERNAL',
        movementType: 'CONTRIBUTION',
        amountInPrimaryCurrency: 900,
        date: new Date('2026-09-01'),
      },
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'income',
        type: 'income',
        date: new Date('2026-09-02'),
        amountInPrimaryCurrency: 100,
        category: 'Channel revenue',
        categoryRef: { key: 'channel_advertising_revenue' },
        telegramAdSalePayment: null,
      },
    ]);
    prisma.workspaceMember.findMany.mockResolvedValue([{ id: 'visible' }]);

    const rows = await service.summaryRows('workspace-1');

    expect(rows.byMember.get('visible')?.investorEarnings).toBe(100);
    expect(rows.byMember.get('hidden')?.investorEarnings ?? 0).toBe(0);
  });

  it('uses the same currency valuation as cash flow before dividing revenue', async () => {
    const incomeDate = new Date('2026-09-02T00:00:00.000Z');
    prisma.telegramAdSalePayment.findMany.mockResolvedValue([]);
    prisma.memberCompensationSettlement.findMany.mockResolvedValue([]);
    prisma.investment.findMany.mockResolvedValue([
      {
        id: 'm1',
        workspaceMemberId: 'm1',
        origin: 'EXTERNAL',
        movementType: 'CONTRIBUTION',
        amountInPrimaryCurrency: 145242.74,
        date: new Date('2026-09-01'),
      },
      {
        id: 'm2',
        workspaceMemberId: 'm2',
        origin: 'EXTERNAL',
        movementType: 'CONTRIBUTION',
        amountInPrimaryCurrency: 26207.96,
        date: new Date('2026-09-01'),
      },
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'channel-income',
        type: 'income',
        date: incomeDate,
        amount: 64.35,
        currency: 'USD',
        amountInPrimaryCurrency: 64.35,
        category: 'Channel revenue',
        categoryRef: { key: 'channel_advertising_revenue' },
        telegramAdSalePayment: null,
      },
    ]);
    prisma.workspaceMember.findMany.mockResolvedValue([
      { id: 'm1' },
      { id: 'm2' },
    ]);
    Object.assign(conversion, {
      prepareHistoricalRateSources: jest
        .fn()
        .mockResolvedValue(
          new Map([
            [
              incomeDate.toISOString(),
              { convertCurrency: jest.fn().mockResolvedValue(2862) },
            ],
          ]),
        ),
    });

    const rows = await service.summaryRows('workspace-1');

    expect(rows.byMember.get('m1')?.investorEarnings).toBe(2424.51);
    expect(rows.byMember.get('m2')?.investorEarnings).toBe(437.49);
  });
});
