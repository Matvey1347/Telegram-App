import type { Prisma } from '@prisma/client';

type CommissionReader = {
  telegramAdSalesWorkspaceSettings: {
    findUnique(args: unknown): Promise<{
      salesCommissionEnabled: boolean;
      defaultSalesCommissionRate: Prisma.Decimal;
    } | null>;
  };
  workspaceMember: {
    findFirst(args: unknown): Promise<{
      id: string;
      salesCommissionRate: Prisma.Decimal | null;
    } | null>;
  };
};

export async function resolveAdSaleCommissionSnapshot(
  prisma: CommissionReader,
  workspaceId: string,
  sellerMemberId: string | null | undefined,
) {
  if (!sellerMemberId) {
    return {
      sellerMemberId: null,
      sellerCommissionEnabled: false,
      sellerCommissionRate: 0,
    };
  }

  const [settings, member] = await Promise.all([
    prisma.telegramAdSalesWorkspaceSettings.findUnique({
      where: { workspaceId },
      select: {
        salesCommissionEnabled: true,
        defaultSalesCommissionRate: true,
      },
    }),
    prisma.workspaceMember.findFirst({
      where: { id: sellerMemberId, workspaceId },
      select: { id: true, salesCommissionRate: true },
    }),
  ]);
  const enabled = Boolean(settings?.salesCommissionEnabled && member);
  const rate = enabled
    ? Number(
        member?.salesCommissionRate ??
          settings?.defaultSalesCommissionRate ??
          0,
      )
    : 0;
  return {
    sellerMemberId: member?.id ?? null,
    sellerCommissionEnabled: enabled && rate > 0,
    sellerCommissionRate: rate,
  };
}
