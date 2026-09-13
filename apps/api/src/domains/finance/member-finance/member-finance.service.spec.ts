import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MemberFinanceService } from './member-finance.service';

describe('MemberFinanceService', () => {
  const tx = {
    $queryRaw: jest.fn(),
    telegramAdSalePayment: { findMany: jest.fn() },
    memberCompensationSettlement: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    investment: { findMany: jest.fn(), create: jest.fn() },
    transaction: { create: jest.fn() },
    reinvestmentDistribution: { findFirst: jest.fn(), create: jest.fn() },
  };
  const prisma = {
    workspaceMember: { findFirst: jest.fn() },
    workspace: { findUniqueOrThrow: jest.fn() },
    account: { findFirst: jest.fn() },
    transactionCategory: { findFirstOrThrow: jest.fn() },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const workspaceService = {
    resolveWorkspaceMembershipForUser: jest.fn(),
  };
  const conversion = { getRate: jest.fn() };
  const categories = { ensureSystemCategories: jest.fn() };
  const reads = { assertPayable: jest.fn(), summaryRows: jest.fn() };
  let service: MemberFinanceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MemberFinanceService(
      prisma as never,
      workspaceService as never,
      conversion as never,
      categories as never,
      reads as never,
    );
    workspaceService.resolveWorkspaceMembershipForUser.mockResolvedValue({
      id: 'owner-member',
      workspaceId: 'workspace-1',
      role: 'owner',
    });
    prisma.workspaceMember.findFirst.mockResolvedValue({
      id: 'seller-1',
      user: { id: 'seller-user', name: 'Seller', email: 'seller@example.com' },
    });
    prisma.workspace.findUniqueOrThrow.mockResolvedValue({
      primaryCurrency: 'UAH',
    });
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'UAH',
    });
    prisma.transactionCategory.findFirstOrThrow.mockResolvedValue({
      id: 'salary-category',
      name: 'Salary',
    });
    tx.telegramAdSalePayment.findMany.mockResolvedValue([
      {
        id: 'payment-1',
        paidAt: new Date('2026-09-12T10:00:00Z'),
        amountInPrimaryCurrency: 1_000,
        sale: {
          id: 'sale-1',
          title: 'Campaign',
          advertiserName: 'Advertiser',
          sellerMemberId: 'seller-1',
          sellerCommissionRate: 10,
        },
      },
    ]);
    tx.memberCompensationSettlement.findMany.mockResolvedValue([]);
    tx.reinvestmentDistribution.findFirst.mockResolvedValue(null);
    tx.investment.findMany.mockResolvedValue([]);
    tx.transaction.create.mockResolvedValue({
      id: 'salary-transaction',
      date: new Date('2026-09-12T12:00:00Z'),
    });
    tx.memberCompensationSettlement.create.mockResolvedValue({
      id: 'settlement-1',
    });
  });

  it('atomically pays commission through the salary system category', async () => {
    await service.payCommission('owner-user', 'seller-1', {
      amount: 100,
      accountId: 'account-1',
    });

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'expense',
        categoryId: 'salary-category',
        amountInPrimaryCurrency: 100,
        memberId: 'seller-1',
      }),
    });
    expect(tx.memberCompensationSettlement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'PAYOUT',
        transactionId: 'salary-transaction',
      }),
    });
  });

  it('converts salary to capital without creating a cash transaction', async () => {
    tx.investment.create.mockResolvedValue({ id: 'salary-investment' });

    await service.investCommission('owner-user', 'seller-1', { amount: 100 });

    expect(tx.transaction.create).not.toHaveBeenCalled();
    expect(tx.investment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: null,
        origin: 'SALARY',
        movementType: 'CONTRIBUTION',
      }),
    });
  });

  it('rejects money management by a non-owner', async () => {
    workspaceService.resolveWorkspaceMembershipForUser.mockResolvedValue({
      id: 'member-1',
      workspaceId: 'workspace-1',
      role: 'member',
    });

    await expect(
      service.investCommission('member-user', 'member-1', { amount: 10 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a reinvestment period that overlaps an earlier distribution', async () => {
    tx.reinvestmentDistribution.findFirst.mockResolvedValue({
      id: 'distribution-1',
    });

    await expect(
      service.distributeReinvestment('owner-user', {
        dateFrom: '2026-09-01',
        dateTo: '2026-09-30',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.reinvestmentDistribution.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        workspaceId: 'workspace-1',
        periodStart: { lte: expect.any(Date) },
        periodEnd: { gte: expect.any(Date) },
      }),
      select: { id: true },
    });
    expect(tx.reinvestmentDistribution.create).not.toHaveBeenCalled();
  });
});
