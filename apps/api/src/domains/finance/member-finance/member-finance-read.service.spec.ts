import { ForbiddenException } from '@nestjs/common';
import { MemberFinanceReadService } from './member-finance-read.service';

describe('MemberFinanceReadService', () => {
  const prisma = {
    workspace: { findUniqueOrThrow: jest.fn() },
    workspaceMember: { findMany: jest.fn(), findFirst: jest.fn() },
    telegramAdSalePayment: { findMany: jest.fn() },
    memberCompensationSettlement: { findMany: jest.fn() },
    investment: { findMany: jest.fn() },
  };
  const workspaceService = {
    resolveWorkspaceMembershipForUser: jest.fn(),
  };
  let service: MemberFinanceReadService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MemberFinanceReadService(
      prisma as never,
      workspaceService as never,
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
          reinvestment: 75,
          total: 100,
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
});
