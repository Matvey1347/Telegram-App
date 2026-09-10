import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrencyConversionService } from '../../../../common/currency-conversion.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { prepareFinanceAccountRates } from '../ledger/finance-transaction-valuation';
import type {
  FinanceSavingsGoalQueryDto,
  FinanceSavingsMovementQueryDto,
} from './finance-savings.dto';
import {
  financeSavingsGoalSelect,
  financeSavingsGoalView,
  financeSavingsMovementSelect,
  financeSavingsMovementView,
} from './finance-savings-view';

type BackingRow = { goalId: string; backedAmount: Prisma.Decimal | null };

@Injectable()
export class FinanceSavingsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversion?: CurrencyConversionService,
  ) {}

  async list(profileId: string, query: FinanceSavingsGoalQueryDto) {
    const limit = query.limit ?? 30;
    const rows = await this.prisma.financeSavingsGoal.findMany({
      where: { profileId, ...(query.status ? { status: query.status } : {}) },
      select: financeSavingsGoalSelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      take: limit + 1,
    });
    const selected = rows.slice(0, limit);
    const backing = await this.backing(
      profileId,
      selected.map((row) => row.id),
    );
    const items = selected.map((row) =>
      financeSavingsGoalView(row, backing.get(row.id) || new Prisma.Decimal(0)),
    );
    return {
      items,
      nextCursor: rows.length > limit ? items.at(-1)?.id || null : null,
    };
  }

  async goal(profileId: string, id: string) {
    const row = await this.prisma.financeSavingsGoal.findFirst({
      where: { id, profileId },
      select: financeSavingsGoalSelect,
    });
    if (!row) throw new NotFoundException('Savings goal not found');
    const backing = await this.backing(profileId, [id]);
    return financeSavingsGoalView(
      row,
      backing.get(id) || new Prisma.Decimal(0),
    );
  }

  async goals(profileId: string, ids: string[]) {
    const rows = await this.prisma.financeSavingsGoal.findMany({
      where: { profileId, id: { in: ids } },
      select: financeSavingsGoalSelect,
    });
    const backing = await this.backing(
      profileId,
      rows.map((row) => row.id),
    );
    return rows.map((row) =>
      financeSavingsGoalView(row, backing.get(row.id) || new Prisma.Decimal(0)),
    );
  }

  async history(
    profileId: string,
    goalId: string,
    query: FinanceSavingsMovementQueryDto,
  ) {
    await this.goal(profileId, goalId);
    const limit = query.limit ?? 30;
    const rows = await this.prisma.financeSavingsMovement.findMany({
      where: { profileId, OR: [{ fromGoalId: goalId }, { toGoalId: goalId }] },
      select: financeSavingsMovementSelect,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      take: limit + 1,
    });
    const items = rows.slice(0, limit).map(financeSavingsMovementView);
    return {
      items,
      nextCursor: rows.length > limit ? items.at(-1)?.id || null : null,
    };
  }

  async summary(profileId: string) {
    const profile = await this.prisma.financeProfile.findUnique({
      where: { id: profileId },
      select: {
        defaultCurrency: true,
        botIntegration: { select: { workspaceId: true } },
      },
    });
    if (!profile) throw new NotFoundException('Finance profile not found');
    const goals = await this.prisma.financeSavingsGoal.findMany({
      where: { profileId, status: { not: 'ARCHIVED' } },
      select: financeSavingsGoalSelect,
    });
    const backing = await this.backing(
      profileId,
      goals.map((goal) => goal.id),
    );
    const rates = await prepareFinanceAccountRates({
      conversion: this.conversion,
      workspaceId: profile.botIntegration.workspaceId,
      currencies: goals.map((goal) => goal.currency),
      defaultCurrency: profile.defaultCurrency,
    });
    let allocated = new Prisma.Decimal(0);
    let backed = new Prisma.Decimal(0);
    const excludedGoals: Array<{
      goalId: string;
      name: string;
      amount: string;
      currency: string;
      reason: 'RATE_UNAVAILABLE' | 'UNLINKED_LEGACY';
    }> = [];
    for (const goal of goals) {
      const linked = new Prisma.Decimal(goal.linkedAllocated);
      const backedNative = backing.get(goal.id) || new Prisma.Decimal(0);
      const result = rates.get(goal.currency);
      const rate =
        goal.currency === profile.defaultCurrency
          ? new Prisma.Decimal(1)
          : result?.available
            ? new Prisma.Decimal(result.rate)
            : null;
      if (rate) {
        allocated = allocated.plus(linked.mul(rate));
        backed = backed.plus(backedNative.mul(rate));
      } else if (!linked.isZero()) {
        excludedGoals.push({
          goalId: goal.id,
          name: goal.name,
          amount: linked.toString(),
          currency: goal.currency,
          reason: 'RATE_UNAVAILABLE',
        });
      }
      if (!new Prisma.Decimal(goal.legacyUnlinkedAmount).isZero())
        excludedGoals.push({
          goalId: goal.id,
          name: goal.name,
          amount: goal.legacyUnlinkedAmount.toString(),
          currency: goal.currency,
          reason: 'UNLINKED_LEGACY',
        });
    }
    return {
      currency: profile.defaultCurrency,
      allocated: allocated.toDecimalPlaces(2).toString(),
      backed: backed.toDecimalPlaces(2).toString(),
      activeGoals: goals.filter((goal) => goal.status === 'ACTIVE').length,
      completedGoals: goals.filter((goal) => goal.status === 'COMPLETED')
        .length,
      underfundedGoals: goals.filter((goal) =>
        (backing.get(goal.id) || new Prisma.Decimal(0)).lt(
          goal.linkedAllocated,
        ),
      ).length,
      excludedGoals,
    };
  }

  private async backing(profileId: string, goalIds: string[]) {
    if (!goalIds.length) return new Map<string, Prisma.Decimal>();
    const rows = await this.prisma.$queryRaw<BackingRow[]>(Prisma.sql`
      WITH movements AS (
        SELECT "accountId", "toGoalId" AS "goalId", amount
        FROM "FinanceSavingsMovement"
        WHERE "profileId" = ${profileId} AND "toGoalId" IS NOT NULL
        UNION ALL
        SELECT "accountId", "fromGoalId" AS "goalId", -amount
        FROM "FinanceSavingsMovement"
        WHERE "profileId" = ${profileId} AND "fromGoalId" IS NOT NULL
      ), allocations AS (
        SELECT "accountId", "goalId", SUM(amount) AS allocated
        FROM movements GROUP BY "accountId", "goalId" HAVING SUM(amount) > 0
      ), account_totals AS (
        SELECT "accountId", SUM(allocated) AS allocated FROM allocations GROUP BY "accountId"
      ), balances AS (
        SELECT a.id AS "accountId", GREATEST(0,
          a."openingBalance"
          + COALESCE((SELECT SUM(CASE WHEN t.type = 'INCOME' THEN t.amount ELSE -t.amount END)
              FROM "FinanceTransaction" t WHERE t."profileId" = ${profileId}
                AND t."accountId" = a.id AND t."deletedAt" IS NULL), 0)
          - COALESCE((SELECT SUM(f."fromAmount") FROM "FinanceTransfer" f
              WHERE f."profileId" = ${profileId} AND f."fromAccountId" = a.id
                AND f."deletedAt" IS NULL), 0)
          + COALESCE((SELECT SUM(f."toAmount") FROM "FinanceTransfer" f
              WHERE f."profileId" = ${profileId} AND f."toAccountId" = a.id
                AND f."deletedAt" IS NULL), 0)) AS balance
        FROM "FinanceAccount" a
        WHERE a."profileId" = ${profileId} AND a."archivedAt" IS NULL
      )
      SELECT x."goalId",
        SUM(x.allocated * LEAST(1, b.balance / NULLIF(t.allocated, 0))) AS "backedAmount"
      FROM allocations x
      JOIN account_totals t ON t."accountId" = x."accountId"
      JOIN balances b ON b."accountId" = x."accountId"
      WHERE x."goalId" IN (${Prisma.join(goalIds)})
      GROUP BY x."goalId"`);
    return new Map(
      rows.map((row) => [
        row.goalId,
        new Prisma.Decimal(row.backedAmount || 0),
      ]),
    );
  }
}
