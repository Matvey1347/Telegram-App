import { resolveAdSaleCommissionSnapshot } from './telegram-ad-sales-commission';

describe('resolveAdSaleCommissionSnapshot', () => {
  const prisma = {
    telegramAdSalesWorkspaceSettings: { findUnique: jest.fn() },
    workspaceMember: { findFirst: jest.fn() },
  };

  beforeEach(() => jest.clearAllMocks());

  it('uses the workspace commission rate for a newly created sale', async () => {
    prisma.telegramAdSalesWorkspaceSettings.findUnique.mockResolvedValue({
      salesCommissionEnabled: true,
      defaultSalesCommissionRate: 10,
    });
    prisma.workspaceMember.findFirst.mockResolvedValue({
      id: 'member-1',
    });

    await expect(
      resolveAdSaleCommissionSnapshot(prisma, 'workspace-1', 'member-1'),
    ).resolves.toEqual({
      sellerMemberId: 'member-1',
      sellerCommissionEnabled: true,
      sellerCommissionRate: 10,
    });
  });

  it('keeps commission disabled by default', async () => {
    prisma.telegramAdSalesWorkspaceSettings.findUnique.mockResolvedValue(null);
    prisma.workspaceMember.findFirst.mockResolvedValue({
      id: 'member-1',
    });

    await expect(
      resolveAdSaleCommissionSnapshot(prisma, 'workspace-1', 'member-1'),
    ).resolves.toEqual({
      sellerMemberId: 'member-1',
      sellerCommissionEnabled: false,
      sellerCommissionRate: 0,
    });
  });

  it('cannot assign another workspace member as seller', async () => {
    prisma.telegramAdSalesWorkspaceSettings.findUnique.mockResolvedValue({
      salesCommissionEnabled: true,
      defaultSalesCommissionRate: 10,
    });
    prisma.workspaceMember.findFirst.mockResolvedValue(null);

    await expect(
      resolveAdSaleCommissionSnapshot(prisma, 'workspace-1', 'foreign-member'),
    ).resolves.toMatchObject({
      sellerMemberId: null,
      sellerCommissionEnabled: false,
    });
  });
});
