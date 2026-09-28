import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { withTransactionIconPresentation } from '../../finance/transactions/transaction-presentation';

const iconSelect = {
  id: true,
  type: true,
  name: true,
  emoji: true,
  imageUrl: true,
};

/** Compact Finance-shaped read model used by the member investment modal. */
export async function findWorkspaceMemberInvestmentTransactions(
  prisma: PrismaService,
  workspaceId: string,
  memberId: string,
) {
  const rows = await (prisma as any).transaction.findMany({
    where: {
      workspaceId,
      memberId,
      deletedAt: null,
      type: 'income',
      categoryRef: { key: 'investment' },
    },
    include: {
      account: { include: { icon: { select: iconSelect } } },
      categoryRef: { include: { icon: { select: iconSelect } } },
      member: WorkspaceService.assignedMemberInclude,
      icon: { select: iconSelect },
      investment: true,
    },
    orderBy: { date: 'desc' },
  });
  return rows.map(withTransactionIconPresentation);
}
