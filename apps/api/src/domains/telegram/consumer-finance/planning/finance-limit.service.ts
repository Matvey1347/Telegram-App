import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrencyConversionService } from '../../../../common/currency-conversion.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { financeAnalyticsDateRange } from '../ledger/finance-history-date-range';
import { financeLimitView } from './finance-limit-view';

type LimitSpendRow = {
  categoryId: string;
  currency: string;
  valuedAmount: Prisma.Decimal | null;
  legacyNativeAmount: Prisma.Decimal | null;
  legacyTransactionCount: bigint;
};

@Injectable()
export class FinanceLimitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversion?: CurrencyConversionService,
  ) {}

  async list(profileId: string, categoryId?: string) {
    const profile = await this.prisma.financeProfile.findUnique({
      where: { id: profileId },
      select: {
        timezone: true,
        botIntegration: { select: { workspaceId: true } },
      },
    });
    if (!profile) throw new NotFoundException('Finance profile not found');
    const { from, to } = financeAnalyticsDateRange(
      { period: 'CURRENT_MONTH' },
      profile.timezone,
    );
    const [limits, spent] = await Promise.all([
      this.prisma.financeSpendingLimit.findMany({
        where: { profileId, ...(categoryId ? { categoryId } : {}) },
        select: {
          id: true,
          categoryId: true,
          amount: true,
          currency: true,
          category: { select: { id: true, name: true, key: true } },
        },
      }),
      this.prisma.$queryRaw<LimitSpendRow[]>`
        SELECT
          t."categoryId", t."currency",
          SUM(CASE WHEN t."valuationCurrency" = 'USD' AND t."amountInValuationCurrency" IS NOT NULL THEN t."amountInValuationCurrency" ELSE 0 END) AS "valuedAmount",
          SUM(CASE WHEN t."valuationCurrency" IS DISTINCT FROM 'USD' OR t."amountInValuationCurrency" IS NULL THEN t."amount" ELSE 0 END) AS "legacyNativeAmount",
          COUNT(*) FILTER (WHERE t."valuationCurrency" IS DISTINCT FROM 'USD' OR t."amountInValuationCurrency" IS NULL) AS "legacyTransactionCount"
        FROM "FinanceTransaction" t
        WHERE t."profileId" = ${profileId}
          AND t."type" = 'EXPENSE' AND t."deletedAt" IS NULL
          AND t."occurredAt" >= ${from} AND t."occurredAt" < ${to}
          ${categoryId ? Prisma.sql`AND t."categoryId" = ${categoryId}` : Prisma.empty}
        GROUP BY t."categoryId", t."currency"
      `,
    ]);
    const rates = new Map<string, Prisma.Decimal>();
    await Promise.all(
      [...new Set(limits.map((limit) => limit.currency))].map(
        async (currency) => {
          if (currency === 'USD')
            return rates.set(currency, new Prisma.Decimal(1));
          if (!this.conversion)
            throw new BadRequestException(
              'An exchange rate is unavailable. Please try again later.',
            );
          const rate = await this.conversion.getRateMetadata(
            'USD',
            currency,
            profile.botIntegration.workspaceId,
          );
          if (!rate.available) throw new BadRequestException(rate.message);
          rates.set(currency, new Prisma.Decimal(rate.rate));
        },
      ),
    );
    return limits.map((limit) => {
      const rows = spent.filter((row) => row.categoryId === limit.categoryId);
      const valuedUsd = rows.reduce(
        (sum, row) => sum.plus(row.valuedAmount || 0),
        new Prisma.Decimal(0),
      );
      const legacyRows = rows.filter(
        (row) => Number(row.legacyTransactionCount) > 0,
      );
      return {
        ...financeLimitView(
          limit,
          valuedUsd.mul(rates.get(limit.currency) || 0).toDecimalPlaces(2),
        ),
        legacyFallback: legacyRows.length
          ? {
              transactionCount: legacyRows.reduce(
                (sum, row) => sum + Number(row.legacyTransactionCount),
                0,
              ),
              nativeAmounts: legacyRows.map((row) => ({
                currency: row.currency,
                amount: new Prisma.Decimal(
                  row.legacyNativeAmount || 0,
                ).toString(),
              })),
              reason: 'UNKNOWN_HISTORICAL_DEFAULT_CURRENCY' as const,
            }
          : null,
      };
    });
  }
}
