import { Injectable } from '@nestjs/common';
import type {
  FinanceCategoryStatisticsItem,
  FinanceCategoryStatisticsResponse,
} from '@telegram-system/shared';
import { Prisma, TransactionType } from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';

type CategoryCurrencyAggregate = {
  categoryId: string | null;
  categoryName: string | null;
  currency: string;
  count: number;
  amount: Prisma.Decimal;
  amountInPrimaryCurrency: Prisma.Decimal;
};

type MutableStatisticsItem = FinanceCategoryStatisticsItem & {
  total: Prisma.Decimal;
};

@Injectable()
export class FinanceCategoryStatisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async statistics(
    userId: string,
    type: TransactionType,
  ): Promise<FinanceCategoryStatisticsResponse> {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const rows = await this.prisma.$queryRaw<CategoryCurrencyAggregate[]>(
      Prisma.sql`
        SELECT
          tx."categoryId" AS "categoryId",
          COALESCE(category."name", tx."category") AS "categoryName",
          tx."currency" AS "currency",
          COUNT(*)::integer AS "count",
          SUM(tx."amount") AS "amount",
          SUM(tx."amountInPrimaryCurrency") AS "amountInPrimaryCurrency"
        FROM "Transaction" AS tx
        LEFT JOIN "TransactionCategory" AS category
          ON category."id" = tx."categoryId"
          AND category."workspaceId" = ${workspaceId}
        WHERE tx."workspaceId" = ${workspaceId}
          AND tx."type" = ${type}::"TransactionType"
          AND tx."deletedAt" IS NULL
        GROUP BY
          tx."categoryId",
          COALESCE(category."name", tx."category"),
          tx."currency"
      `,
    );
    const grouped = new Map<string, MutableStatisticsItem>();
    for (const row of rows) {
      const key = JSON.stringify([row.categoryId, row.categoryName]);
      const current = grouped.get(key) ?? {
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        count: 0,
        totalInPrimaryCurrency: '0',
        currencies: [],
        total: new Prisma.Decimal(0),
      };
      current.count += row.count;
      current.total = current.total.add(row.amountInPrimaryCurrency);
      current.totalInPrimaryCurrency = current.total.toString();
      current.currencies.push({
        currency: row.currency,
        amount: row.amount.toString(),
        amountInPrimaryCurrency: row.amountInPrimaryCurrency.toString(),
      });
      grouped.set(key, current);
    }
    return {
      type,
      items: [...grouped.values()]
        .sort(
          (left, right) =>
            right.total.comparedTo(left.total) ||
            (left.categoryName ?? '').localeCompare(right.categoryName ?? ''),
        )
        .map((item) => ({
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          count: item.count,
          totalInPrimaryCurrency: item.totalInPrimaryCurrency,
          currencies: item.currencies.sort((left, right) =>
            left.currency.localeCompare(right.currency),
          ),
        })),
    };
  }
}
