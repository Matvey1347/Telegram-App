import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrencyConversionService } from '../../../../common/currency-conversion.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { financeAnalyticsDateRange } from '../ledger/finance-history-date-range';
import {
  currentFinancePresentationRate,
  type FinanceProfileContext,
} from '../ledger/finance-transaction-valuation';
import {
  financeAnalyticsView,
  type FinanceAnalyticsAccountRow,
  type FinanceAnalyticsCategoryRow,
  type FinanceAnalyticsLegacyRow,
  type FinanceAnalyticsMoneyRow,
  type FinanceAnalyticsNecessityRow,
  type FinanceAnalyticsSummaryRow,
  type FinanceAnalyticsTimelineRow,
  type FinanceSavingsAnalyticsRow,
} from './finance-analytics-view';
import { FinanceAssetSummaryService } from '../assets/finance-asset-summary.service';

const MAX_BREAKDOWN_ROWS = 400;
const MAX_LEGACY_CURRENCIES = 100;

@Injectable()
export class FinanceAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversion?: CurrencyConversionService,
    private readonly assets?: FinanceAssetSummaryService,
  ) {}

  async dashboard(profile: FinanceProfileContext, from: Date, to: Date) {
    const [rows, savingsResult] = await Promise.all([
      this.prisma.$queryRaw<FinanceAnalyticsCategoryRow[]>(Prisma.sql`
        SELECT t."type", t."purpose", t."categoryId", c."name" AS "categoryName",
          c."key" AS "categoryKey",
          SUM(CASE WHEN t."purpose" IN ('INVESTMENT_CONTRIBUTION', 'INVESTMENT_RETURN')
            THEN t."amount" ELSE t."economicAmount" END) FILTER (
            WHERE t."currency" = ${profile.defaultCurrency}
              AND t."valuationCurrency" = 'USD'
              AND t."amountInValuationCurrency" IS NOT NULL
          ) AS "nativeAmount",
          SUM(CASE WHEN t."purpose" IN ('INVESTMENT_CONTRIBUTION', 'INVESTMENT_RETURN')
            THEN t."amountInValuationCurrency" ELSE t."economicAmountInValuationCurrency" END) FILTER (
            WHERE t."currency" <> ${profile.defaultCurrency}
              AND t."valuationCurrency" = 'USD'
              AND t."amountInValuationCurrency" IS NOT NULL
          ) AS "valuedAmount"
        FROM "FinanceTransaction" t
        LEFT JOIN "FinanceCategory" c ON c.id = t."categoryId"
        WHERE t."profileId" = ${profile.id}
          AND t."deletedAt" IS NULL
          AND t."occurredAt" >= ${from} AND t."occurredAt" < ${to}
        GROUP BY t."type", t."purpose", t."categoryId", c."name", c."key"
        ORDER BY COALESCE(SUM(t."amountInValuationCurrency"), 0) DESC
        LIMIT ${MAX_BREAKDOWN_ROWS}`),
      this.prisma.$queryRaw<FinanceSavingsAnalyticsRow[]>(Prisma.sql`
        SELECT 'CURRENT' AS "segment",
          to_char(m."occurredAt" AT TIME ZONE ${profile.timezone || 'UTC'}, 'YYYY-MM-DD') AS "day",
          SUM(CASE WHEN m.kind = 'ALLOCATE' THEN m.amount
            WHEN m.kind = 'RELEASE' THEN -m.amount ELSE 0 END) FILTER (
              WHERE m.currency = ${profile.defaultCurrency}
                AND m."valuationCurrency" = 'USD') AS "nativeAmount",
          SUM(CASE WHEN m.kind = 'ALLOCATE' THEN m."amountInValuationCurrency"
            WHEN m.kind = 'RELEASE' THEN -m."amountInValuationCurrency" ELSE 0 END) FILTER (
              WHERE m.currency <> ${profile.defaultCurrency}
                AND m."valuationCurrency" = 'USD') AS "valuedAmount"
        FROM "FinanceSavingsMovement" m
        WHERE m."profileId" = ${profile.id}
          AND m."occurredAt" >= ${from} AND m."occurredAt" < ${to}
        GROUP BY 2 ORDER BY 2`),
    ]);
    const savingsRows = savingsResult || [];
    const requiresRate = [...rows, ...savingsRows].some(
      (row) => !new Prisma.Decimal(row.valuedAmount || 0).isZero(),
    );
    const rate = requiresRate
      ? await currentFinancePresentationRate(profile, {
          conversion: this.conversion,
          resolveWorkspaceId: (profileId) => this.workspaceId(profileId),
        })
      : new Prisma.Decimal(1);
    const view = financeAnalyticsView({
      summaries: rows.map((row) => ({
        segment: 'CURRENT' as const,
        type: row.type,
        purpose: row.purpose,
        nativeAmount: row.nativeAmount,
        valuedAmount: row.valuedAmount,
      })),
      categories: rows,
      accounts: [],
      timeline: [],
      savingsRows,
      legacy: [],
      rate,
      currency: profile.defaultCurrency,
      period: {
        period: 'CUSTOM',
        from: from.toISOString(),
        to: to.toISOString(),
      },
      comparisonPeriod: { from: from.toISOString(), to: from.toISOString() },
    });
    return {
      summary: view.summary,
      expensesByCategory: view.expensesByCategory,
    };
  }

  async analytics(
    profile: FinanceProfileContext,
    input: {
      period: 'CURRENT_MONTH' | 'PREVIOUS_MONTH' | 'LAST_3_MONTHS' | 'CUSTOM';
      from?: string;
      to?: string;
    },
  ) {
    const { from, to, comparisonFrom, comparisonTo } =
      financeAnalyticsDateRange(input, profile.timezone || 'UTC');
    const amountColumns = Prisma.sql`
      SUM(CASE WHEN t."purpose" IN ('INVESTMENT_CONTRIBUTION', 'INVESTMENT_RETURN')
        THEN t."amount" ELSE t."economicAmount" END) FILTER (
        WHERE t."currency" = ${profile.defaultCurrency}
          AND t."valuationCurrency" = 'USD'
          AND t."amountInValuationCurrency" IS NOT NULL
      ) AS "nativeAmount",
      SUM(CASE WHEN t."purpose" IN ('INVESTMENT_CONTRIBUTION', 'INVESTMENT_RETURN')
        THEN t."amountInValuationCurrency" ELSE t."economicAmountInValuationCurrency" END) FILTER (
        WHERE t."currency" <> ${profile.defaultCurrency}
          AND t."valuationCurrency" = 'USD'
          AND t."amountInValuationCurrency" IS NOT NULL
      ) AS "valuedAmount"`;

    // Separate bounded aggregates avoid a day x account x category result.
    const [
      summaries,
      categories,
      accounts,
      timeline,
      legacy,
      savingsRows,
      necessityRows,
    ] = await Promise.all([
      this.prisma.$queryRaw<FinanceAnalyticsSummaryRow[]>(Prisma.sql`
          SELECT CASE WHEN t."occurredAt" >= ${from}
            THEN 'CURRENT' ELSE 'PREVIOUS' END AS "segment",
            t."type", t."purpose", ${amountColumns}
          FROM "FinanceTransaction" t
          WHERE t."profileId" = ${profile.id}
            AND t."deletedAt" IS NULL
            AND t."occurredAt" >= ${comparisonFrom}
            AND t."occurredAt" < ${to}
          GROUP BY 1, t."type", t."purpose"`),
      this.prisma.$queryRaw<FinanceAnalyticsCategoryRow[]>(Prisma.sql`
          SELECT t."type", t."purpose", t."categoryId", c."name" AS "categoryName",
            c."key" AS "categoryKey", ${amountColumns}
          FROM "FinanceTransaction" t
          LEFT JOIN "FinanceCategory" c ON c.id = t."categoryId"
          WHERE t."profileId" = ${profile.id}
            AND t."deletedAt" IS NULL
            AND t."purpose" = 'ORDINARY'
            AND t."occurredAt" >= ${from} AND t."occurredAt" < ${to}
          GROUP BY t."type", t."purpose", t."categoryId", c."name", c."key"
          ORDER BY COALESCE(SUM(t."amountInValuationCurrency"), 0) DESC
          LIMIT ${MAX_BREAKDOWN_ROWS}`),
      this.prisma.$queryRaw<FinanceAnalyticsAccountRow[]>(Prisma.sql`
          SELECT t."type", t."purpose", t."accountId", a."name" AS "accountName",
            ${amountColumns}
          FROM "FinanceTransaction" t
          JOIN "FinanceAccount" a ON a.id = t."accountId"
          WHERE t."profileId" = ${profile.id}
            AND t."deletedAt" IS NULL
            AND t."occurredAt" >= ${from} AND t."occurredAt" < ${to}
          GROUP BY t."type", t."purpose", t."accountId", a."name"
          ORDER BY COALESCE(SUM(t."amountInValuationCurrency"), 0) DESC
          LIMIT ${MAX_BREAKDOWN_ROWS}`),
      this.prisma.$queryRaw<FinanceAnalyticsTimelineRow[]>(Prisma.sql`
          SELECT t."type", t."purpose",
            to_char(t."occurredAt" AT TIME ZONE ${profile.timezone || 'UTC'}, 'YYYY-MM-DD') AS "day",
            ${amountColumns}
          FROM "FinanceTransaction" t
          WHERE t."profileId" = ${profile.id}
            AND t."deletedAt" IS NULL
            AND t."occurredAt" >= ${from} AND t."occurredAt" < ${to}
          GROUP BY t."type", t."purpose", 3 ORDER BY 3`),
      this.prisma.$queryRaw<FinanceAnalyticsLegacyRow[]>(Prisma.sql`
          SELECT CASE WHEN t."occurredAt" >= ${from}
              THEN 'CURRENT' ELSE 'PREVIOUS' END AS "segment",
            t."currency", SUM(t."amount") AS "amount",
            COUNT(*)::bigint AS "transactions"
          FROM "FinanceTransaction" t
          WHERE t."profileId" = ${profile.id}
            AND t."deletedAt" IS NULL
            AND t."occurredAt" >= ${comparisonFrom}
            AND t."occurredAt" < ${to}
            AND (t."valuationCurrency" IS DISTINCT FROM 'USD'
              OR t."amountInValuationCurrency" IS NULL)
          GROUP BY 1, t."currency" ORDER BY 1, t."currency"
          LIMIT ${MAX_LEGACY_CURRENCIES}`),
      this.prisma.$queryRaw<FinanceSavingsAnalyticsRow[]>(Prisma.sql`
          SELECT CASE WHEN m."occurredAt" >= ${from}
              THEN 'CURRENT' ELSE 'PREVIOUS' END AS "segment",
            to_char(m."occurredAt" AT TIME ZONE ${profile.timezone || 'UTC'}, 'YYYY-MM-DD') AS "day",
            SUM(CASE WHEN m.kind = 'ALLOCATE' THEN m.amount
              WHEN m.kind = 'RELEASE' THEN -m.amount ELSE 0 END) FILTER (
                WHERE m.currency = ${profile.defaultCurrency}
                  AND m."valuationCurrency" = 'USD') AS "nativeAmount",
            SUM(CASE WHEN m.kind = 'ALLOCATE' THEN m."amountInValuationCurrency"
              WHEN m.kind = 'RELEASE' THEN -m."amountInValuationCurrency" ELSE 0 END) FILTER (
                WHERE m.currency <> ${profile.defaultCurrency}
                  AND m."valuationCurrency" = 'USD') AS "valuedAmount"
          FROM "FinanceSavingsMovement" m
          WHERE m."profileId" = ${profile.id}
            AND m."occurredAt" >= ${comparisonFrom} AND m."occurredAt" < ${to}
          GROUP BY 1, 2 ORDER BY 2`),
      this.prisma.$queryRaw<FinanceAnalyticsNecessityRow[]>(Prisma.sql`
          SELECT CASE WHEN t."occurredAt" >= ${from}
              THEN 'CURRENT' ELSE 'PREVIOUS' END AS "segment",
            t."necessity",
            SUM(t."economicAmount") FILTER (
              WHERE t."currency" = ${profile.defaultCurrency}
                AND t."valuationCurrency" = 'USD'
                AND t."economicAmountInValuationCurrency" IS NOT NULL
            ) AS "nativeAmount",
            SUM(t."economicAmountInValuationCurrency") FILTER (
              WHERE t."currency" <> ${profile.defaultCurrency}
                AND t."valuationCurrency" = 'USD'
                AND t."economicAmountInValuationCurrency" IS NOT NULL
            ) AS "valuedAmount"
          FROM "FinanceTransaction" t
          WHERE t."profileId" = ${profile.id}
            AND t."deletedAt" IS NULL
            AND t."type" = 'EXPENSE'
            AND t."purpose" = 'ORDINARY'
            AND t."occurredAt" >= ${comparisonFrom} AND t."occurredAt" < ${to}
          GROUP BY 1, t."necessity"`),
    ]);
    const resolvedSavingsRows = savingsRows || [];
    const requiresRate = [
      summaries,
      categories,
      accounts,
      timeline,
      resolvedSavingsRows,
      necessityRows || [],
    ]
      .flat()
      .some(
        (row: FinanceAnalyticsMoneyRow) =>
          !new Prisma.Decimal(row.valuedAmount || 0).isZero(),
      );
    const rate = requiresRate
      ? await currentFinancePresentationRate(profile, {
          conversion: this.conversion,
          resolveWorkspaceId: (profileId) => this.workspaceId(profileId),
        })
      : new Prisma.Decimal(1);
    const view = financeAnalyticsView({
      summaries,
      categories,
      accounts,
      timeline,
      savingsRows: resolvedSavingsRows,
      necessityRows: necessityRows || [],
      legacy,
      rate,
      currency: profile.defaultCurrency,
      period: { ...input, from: from.toISOString(), to: to.toISOString() },
      comparisonPeriod: {
        from: comparisonFrom.toISOString(),
        to: comparisonTo.toISOString(),
      },
    });
    const assets = this.assets
      ? await this.assets.overview(profile.id)
      : {
          savings: {
            currency: profile.defaultCurrency,
            allocated: '0',
            backed: '0',
            activeGoals: 0,
            completedGoals: 0,
            underfundedGoals: 0,
            excludedGoals: [],
          },
          investments: {
            currency: profile.defaultCurrency,
            totalInvested: '0',
            totalReturned: '0',
            currentValue: '0',
            profitLoss: '0',
            returnPercentage: null,
            activeInvestments: 0,
            closedInvestments: 0,
            excludedInvestments: [],
          },
          netWorth: {
            amount: '0',
            currency: profile.defaultCurrency,
            cashAmount: '0',
            investmentValue: '0',
            complete: true,
            excludedAccountCount: 0,
            excludedInvestmentCount: 0,
          },
        };
    return { ...view, ...assets };
  }

  private async workspaceId(profileId: string) {
    const profile = await this.prisma.financeProfile.findUnique({
      where: { id: profileId },
      select: { botIntegration: { select: { workspaceId: true } } },
    });
    return profile?.botIntegration.workspaceId;
  }
}
