import { BadRequestException, Injectable } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import {
  TRASH_DAY_MS,
  TRASH_RETENTION_DAYS,
  trashDaysRemaining,
  trashExpiresAt,
} from './trash-retention';

type TrashKind =
  | 'account'
  | 'transaction'
  | 'category'
  | 'transfer'
  | 'finance_bot_account'
  | 'finance_bot_transaction'
  | 'finance_bot_category'
  | 'finance_bot_transfer';
type TrashRow = {
  id: string;
  kind: TrashKind;
  name: string;
  product: 'Internal Finance' | 'Finance Bot';
  deletedAt: Date;
};

@Injectable()
export class TrashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
  ) {}

  private expiresAt(deletedAt: Date) {
    return trashExpiresAt(deletedAt);
  }

  private async adminWorkspaceId(userId: string) {
    return (
      await this.workspace.requireWorkspaceRole(userId, [
        WorkspaceRole.owner,
        WorkspaceRole.admin,
      ])
    ).workspaceId;
  }

  async list(userId: string, page = 1, pageSize = 25) {
    const workspaceId = await this.adminWorkspaceId(userId);
    const profiles = { botIntegration: { workspaceId } };
    const [
      accounts,
      transactions,
      categories,
      transfers,
      botAccounts,
      botTransactions,
      botCategories,
      botTransfers,
    ] = await Promise.all([
      this.prisma.account.findMany({
        where: { workspaceId, deletedAt: { not: null } },
        select: { id: true, name: true, deletedAt: true },
      }),
      this.prisma.transaction.findMany({
        where: { workspaceId, deletedAt: { not: null } },
        select: {
          id: true,
          description: true,
          category: true,
          deletedAt: true,
        },
      }),
      this.prisma.transactionCategory.findMany({
        where: { workspaceId, deletedAt: { not: null } },
        select: { id: true, name: true, deletedAt: true },
      }),
      this.prisma.transfer.findMany({
        where: { workspaceId, deletedAt: { not: null } },
        select: { id: true, description: true, deletedAt: true },
      }),
      this.prisma.financeAccount.findMany({
        where: { profile: profiles, archivedAt: { not: null } },
        select: { id: true, name: true, archivedAt: true },
      }),
      this.prisma.financeTransaction.findMany({
        where: { profile: profiles, deletedAt: { not: null } },
        select: { id: true, description: true, deletedAt: true },
      }),
      this.prisma.financeCategory.findMany({
        where: { profile: profiles, archivedAt: { not: null } },
        select: { id: true, name: true, archivedAt: true },
      }),
      this.prisma.financeTransfer.findMany({
        where: { profile: profiles, deletedAt: { not: null } },
        select: { id: true, description: true, deletedAt: true },
      }),
    ]);
    const rows: TrashRow[] = [
      ...accounts.map((row) => ({
        id: row.id,
        kind: 'account' as const,
        name: row.name,
        product: 'Internal Finance' as const,
        deletedAt: row.deletedAt!,
      })),
      ...transactions.map((row) => ({
        id: row.id,
        kind: 'transaction' as const,
        name: row.description || row.category || 'Transaction',
        product: 'Internal Finance' as const,
        deletedAt: row.deletedAt!,
      })),
      ...categories.map((row) => ({
        id: row.id,
        kind: 'category' as const,
        name: row.name,
        product: 'Internal Finance' as const,
        deletedAt: row.deletedAt!,
      })),
      ...transfers.map((row) => ({
        id: row.id,
        kind: 'transfer' as const,
        name: row.description || 'Transfer',
        product: 'Internal Finance' as const,
        deletedAt: row.deletedAt!,
      })),
      ...botAccounts.map((row) => ({
        id: row.id,
        kind: 'finance_bot_account' as const,
        name: row.name,
        product: 'Finance Bot' as const,
        deletedAt: row.archivedAt!,
      })),
      ...botTransactions.map((row) => ({
        id: row.id,
        kind: 'finance_bot_transaction' as const,
        name: row.description || 'Transaction',
        product: 'Finance Bot' as const,
        deletedAt: row.deletedAt!,
      })),
      ...botCategories.map((row) => ({
        id: row.id,
        kind: 'finance_bot_category' as const,
        name: row.name,
        product: 'Finance Bot' as const,
        deletedAt: row.archivedAt!,
      })),
      ...botTransfers.map((row) => ({
        id: row.id,
        kind: 'finance_bot_transfer' as const,
        name: row.description || 'Transfer',
        product: 'Finance Bot' as const,
        deletedAt: row.deletedAt!,
      })),
    ]
      .filter((row) => this.expiresAt(row.deletedAt).getTime() > Date.now())
      .sort(
        (a, b) =>
          this.expiresAt(a.deletedAt).getTime() -
          this.expiresAt(b.deletedAt).getTime(),
      );
    const totalItems = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const items = rows
      .slice((page - 1) * pageSize, page * pageSize)
      .map((row) => ({
        ...row,
        deletedAt: row.deletedAt.toISOString(),
        expiresAt: this.expiresAt(row.deletedAt).toISOString(),
        daysRemaining: trashDaysRemaining(row.deletedAt),
      }));
    return {
      items,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async restore(userId: string, kind: TrashKind, id: string) {
    const workspaceId = await this.adminWorkspaceId(userId);
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * TRASH_DAY_MS);
    const internalWhere = { id, workspaceId, deletedAt: { gte: cutoff } };
    if (kind === 'account')
      return this.prisma.account.updateMany({
        where: internalWhere,
        data: { deletedAt: null, isActive: true },
      });
    if (kind === 'transaction')
      return this.prisma.transaction.updateMany({
        where: internalWhere,
        data: { deletedAt: null },
      });
    if (kind === 'category')
      return this.prisma.transactionCategory.updateMany({
        where: internalWhere,
        data: { deletedAt: null },
      });
    if (kind === 'transfer')
      return this.prisma.transfer.updateMany({
        where: internalWhere,
        data: { deletedAt: null },
      });
    const profile = { botIntegration: { workspaceId } };
    if (kind === 'finance_bot_account')
      return this.prisma.financeAccount.updateMany({
        where: { id, profile, archivedAt: { gte: cutoff } },
        data: { archivedAt: null },
      });
    if (kind === 'finance_bot_transaction')
      return this.prisma.financeTransaction.updateMany({
        where: { id, profile, deletedAt: { gte: cutoff } },
        data: { deletedAt: null },
      });
    if (kind === 'finance_bot_category')
      return this.prisma.financeCategory.updateMany({
        where: { id, profile, archivedAt: { gte: cutoff } },
        data: { archivedAt: null },
      });
    if (kind === 'finance_bot_transfer')
      return this.prisma.financeTransfer.updateMany({
        where: { id, profile, deletedAt: { gte: cutoff } },
        data: { deletedAt: null },
      });
    throw new BadRequestException('Unsupported trash item');
  }
}
