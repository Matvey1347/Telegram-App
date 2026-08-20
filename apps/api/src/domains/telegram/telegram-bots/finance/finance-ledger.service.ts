import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FinanceTransactionSource, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CurrencyConversionService } from '../../../../common/currency-conversion.service';
import { FINANCE_UNDO_TTL_MS } from './finance-defaults';
import type {
  CreateFinanceTransactionDto,
  CreateFinanceTransferDto,
  FinanceHistoryQueryDto,
  UpdateFinanceTransactionDto,
} from './finance.dto';

type ProfileContext = {
  id: string;
  defaultCurrency: string;
  workspaceId?: string;
};

type AnalyticsAggregateRow = {
  type: 'INCOME' | 'EXPENSE';
  categoryId: string | null;
  categoryName: string | null;
  currency: string;
  day: Date;
  valuedAmount: Prisma.Decimal | null;
  legacyNativeAmount: Prisma.Decimal | null;
  legacyTransactionCount: bigint;
};

@Injectable()
export class FinanceLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversion?: CurrencyConversionService,
  ) {}

  async accounts(
    profileId: string,
    profileCurrency?: string,
    workspaceId?: string,
  ) {
    const accounts = await this.prisma.financeAccount.findMany({
      where: { profileId },
      orderBy: [{ archivedAt: 'asc' }, { createdAt: 'asc' }],
    });
    const [transactions, outgoing, incoming] = await Promise.all([
      this.prisma.financeTransaction.groupBy({
        by: ['accountId', 'type'],
        where: { profileId, deletedAt: null },
        _sum: { amount: true },
      }),
      this.prisma.financeTransfer.groupBy({
        by: ['fromAccountId'],
        where: { profileId, deletedAt: null },
        _sum: { fromAmount: true },
      }),
      this.prisma.financeTransfer.groupBy({
        by: ['toAccountId'],
        where: { profileId, deletedAt: null },
        _sum: { toAmount: true },
      }),
    ]);
    const defaultCurrency =
      profileCurrency ||
      (
        await this.prisma.financeProfile.findUnique({
          where: { id: profileId },
          select: { defaultCurrency: true },
        })
      )?.defaultCurrency ||
      'USD';
    const resolvedWorkspaceId =
      workspaceId || (await this.workspaceId(profileId));
    const equivalents = new Map<
      string,
      Awaited<ReturnType<CurrencyConversionService['getRateMetadata']>>
    >();
    if (this.conversion && resolvedWorkspaceId)
      for (const currency of new Set(
        accounts
          .map((account) => account.currency)
          .filter((currency) => currency !== defaultCurrency),
      ))
        equivalents.set(
          currency,
          await this.conversion.getRateMetadata(
            currency,
            defaultCurrency,
            resolvedWorkspaceId,
          ),
        );
    return accounts.map((account) => {
      let balance = new Prisma.Decimal(account.openingBalance);
      for (const row of transactions.filter(
        (item) => item.accountId === account.id,
      ))
        balance =
          row.type === 'INCOME'
            ? balance.plus(row._sum.amount || 0)
            : balance.minus(row._sum.amount || 0);
      balance = balance.minus(
        outgoing.find((item) => item.fromAccountId === account.id)?._sum
          .fromAmount || 0,
      );
      balance = balance.plus(
        incoming.find((item) => item.toAccountId === account.id)?._sum
          .toAmount || 0,
      );
      return {
        ...account,
        openingBalance: account.openingBalance.toString(),
        balance: balance.toString(),
        defaultCurrency,
        equivalentBalance:
          account.currency === defaultCurrency
            ? null
            : (() => {
                const result = equivalents.get(account.currency);
                return result?.available
                  ? {
                      amount: balance
                        .mul(result.rate)
                        .toDecimalPlaces(2)
                        .toString(),
                      currency: defaultCurrency,
                      rate: String(result.rate),
                      rateAsOf: result.rateAt.toISOString(),
                    }
                  : null;
              })(),
      };
    });
  }

  async createTransaction(
    profile: ProfileContext,
    dto: CreateFinanceTransactionDto,
    source: FinanceTransactionSource = 'MINI_APP',
  ) {
    return this.prisma.$transaction((tx) =>
      this.createTransactionInTransaction(tx, profile, dto, source),
    );
  }

  async createTransactionInTransaction(
    tx: Prisma.TransactionClient,
    profile: ProfileContext,
    dto: CreateFinanceTransactionDto,
    source: FinanceTransactionSource = 'MINI_APP',
  ) {
    const amount = this.positive(dto.amount, 'amount');
    const account = await tx.financeAccount.findFirst({
      where: { id: dto.accountId, profileId: profile.id, archivedAt: null },
    });
    if (!account) throw new NotFoundException('Finance account not found');
    const currency = account.currency;
    const category = dto.categoryId
      ? await tx.financeCategory.findFirst({
          where: {
            id: dto.categoryId,
            profileId: profile.id,
            archivedAt: null,
          },
        })
      : null;
    if (dto.categoryId && !category)
      throw new NotFoundException('Finance category not found');
    if (category && category.type !== dto.type)
      throw new BadRequestException(
        'Category type does not match transaction type',
      );
    const occurredAt = new Date(dto.occurredAt);
    const [valuation, defaultSnapshot] = await Promise.all([
      this.valuation(profile, currency, occurredAt),
      this.legacyDefaultSnapshot(profile, currency, occurredAt),
    ]);
    const description = dto.description?.trim() || null;
    const created = await tx.financeTransaction.create({
      data: {
        profileId: profile.id,
        accountId: account.id,
        categoryId: category?.id || null,
        type: dto.type,
        amount,
        currency,
        // These retain their original meaning: a snapshot in the profile's
        // default currency at write time. USD valuations live only below.
        exchangeRateToDefault: defaultSnapshot.rate,
        amountInDefaultCurrency: amount.mul(defaultSnapshot.rate),
        valuationCurrency: 'USD',
        amountInValuationCurrency: amount.mul(valuation.rate),
        exchangeRateToValuation: valuation.rate,
        valuationRateAt: valuation.rateAt,
        occurredAt,
        description,
        merchantNormalized: description
          ? this.normalizeMerchant(description)
          : null,
        source,
      },
    });
    if (description && category)
      await tx.financeMerchantMapping.upsert({
        where: {
          profileId_merchantNormalized: {
            profileId: profile.id,
            merchantNormalized: this.normalizeMerchant(description),
          },
        },
        update: { categoryId: category.id },
        create: {
          profileId: profile.id,
          merchantNormalized: this.normalizeMerchant(description),
          categoryId: category.id,
        },
      });
    return this.viewTransaction(created);
  }

  async updateTransaction(
    profile: ProfileContext,
    id: string,
    dto: UpdateFinanceTransactionDto,
  ) {
    const existing = await this.prisma.financeTransaction.findFirst({
      where: { id, profileId: profile.id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Finance transaction not found');
    return this.createReplacement(profile, existing.id, dto);
  }

  private async createReplacement(
    profile: ProfileContext,
    id: string,
    dto: UpdateFinanceTransactionDto,
  ) {
    const amount = this.positive(dto.amount, 'amount');
    const account = await this.prisma.financeAccount.findFirst({
      where: { id: dto.accountId, profileId: profile.id, archivedAt: null },
    });
    if (!account) throw new NotFoundException('Finance account not found');
    const currency = account.currency;
    const category = dto.categoryId
      ? await this.prisma.financeCategory.findFirst({
          where: {
            id: dto.categoryId,
            profileId: profile.id,
            archivedAt: null,
          },
        })
      : null;
    if (dto.categoryId && !category)
      throw new NotFoundException('Finance category not found');
    if (category && category.type !== dto.type)
      throw new BadRequestException(
        'Category type does not match transaction type',
      );
    const occurredAt = new Date(dto.occurredAt);
    const [valuation, defaultSnapshot] = await Promise.all([
      this.valuation(profile, currency, occurredAt),
      this.legacyDefaultSnapshot(profile, currency, occurredAt),
    ]);
    const updated = await this.prisma.financeTransaction.update({
      where: { id },
      data: {
        accountId: account.id,
        categoryId: category?.id || null,
        type: dto.type,
        amount,
        currency,
        exchangeRateToDefault: defaultSnapshot.rate,
        amountInDefaultCurrency: amount.mul(defaultSnapshot.rate),
        valuationCurrency: 'USD',
        amountInValuationCurrency: amount.mul(valuation.rate),
        exchangeRateToValuation: valuation.rate,
        valuationRateAt: valuation.rateAt,
        occurredAt,
        description: dto.description?.trim() || null,
        merchantNormalized: dto.description
          ? this.normalizeMerchant(dto.description)
          : null,
      },
    });
    return this.viewTransaction(updated);
  }

  async removeTransaction(profileId: string, id: string) {
    const result = await this.prisma.financeTransaction.updateMany({
      where: { id, profileId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!result.count)
      throw new NotFoundException('Finance transaction not found');
    return { deleted: true };
  }

  async undo(profileId: string, id: string) {
    const cutoff = new Date(Date.now() - FINANCE_UNDO_TTL_MS);
    const result = await this.prisma.financeTransaction.updateMany({
      where: { id, profileId, deletedAt: { gte: cutoff } },
      data: { deletedAt: null },
    });
    if (result.count) return { undone: true, duplicate: false };
    const existing = await this.prisma.financeTransaction.findFirst({
      where: { id, profileId },
      select: { deletedAt: true },
    });
    if (existing?.deletedAt === null) return { undone: true, duplicate: true };
    throw new BadRequestException(
      'Undo window has expired or transaction does not exist',
    );
  }

  async history(profileId: string, query: FinanceHistoryQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && to.getTime() - from.getTime() > 366 * 86400000)
      throw new BadRequestException('Date range cannot exceed 366 days');
    const rows = await this.prisma.financeTransaction.findMany({
      where: {
        profileId,
        deletedAt: null,
        ...(query.type ? { type: query.type } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.accountId ? { accountId: query.accountId } : {}),
        ...(from || to
          ? {
              occurredAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      include: {
        account: { select: { id: true, name: true, currency: true } },
        category: { select: { id: true, name: true, type: true } },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const items = rows
      .slice(0, query.limit)
      .map((row) => this.viewTransaction(row));
    return { items, nextCursor: hasMore ? items.at(-1)?.id || null : null };
  }

  async stats(profileId: string, from: Date, to: Date) {
    if (to <= from || to.getTime() - from.getTime() > 366 * 86400000)
      throw new BadRequestException('Invalid or unbounded statistics range');
    const profile = await this.prisma.financeProfile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        defaultCurrency: true,
        botIntegration: { select: { workspaceId: true } },
      },
    });
    if (!profile) throw new NotFoundException('Finance profile not found');
    const [analytics, accounts] = await Promise.all([
      this.analytics(
        {
          id: profile.id,
          defaultCurrency: profile.defaultCurrency,
          workspaceId: profile.botIntegration.workspaceId,
        },
        { period: 'CUSTOM', from: from.toISOString(), to: to.toISOString() },
      ),
      this.accounts(
        profile.id,
        profile.defaultCurrency,
        profile.botIntegration.workspaceId,
      ),
    ]);
    return {
      income: analytics.summary.income,
      expense: analytics.summary.expenses,
      net: analytics.summary.netCashflow,
      categories: analytics.expensesByCategory.map((row) => ({
        categoryId: row.categoryId,
        name: row.name,
        amount: row.amount,
      })),
      accounts,
    };
  }

  async createTransfer(profileId: string, dto: CreateFinanceTransferDto) {
    if (dto.fromAccountId === dto.toAccountId)
      throw new BadRequestException('Transfer accounts must be different');
    const accounts = await this.prisma.financeAccount.findMany({
      where: {
        profileId,
        id: { in: [dto.fromAccountId, dto.toAccountId] },
        archivedAt: null,
      },
    });
    if (accounts.length !== 2)
      throw new NotFoundException('Finance transfer account not found');
    const from = accounts.find((item) => item.id === dto.fromAccountId)!;
    const to = accounts.find((item) => item.id === dto.toAccountId)!;
    const fromAmount = this.positive(dto.fromAmount, 'fromAmount');
    const toAmount = this.positive(dto.toAmount, 'toAmount');
    if (from.currency === to.currency && !fromAmount.equals(toAmount))
      throw new BadRequestException(
        'Same-currency transfer amounts must match',
      );
    const created = await this.prisma.financeTransfer.create({
      data: {
        profileId,
        fromAccountId: from.id,
        toAccountId: to.id,
        fromAmount,
        fromCurrency: from.currency,
        toAmount,
        toCurrency: to.currency,
        exchangeRate:
          from.currency === to.currency
            ? new Prisma.Decimal(1)
            : toAmount.div(fromAmount),
        occurredAt: new Date(dto.occurredAt),
        description: dto.description?.trim() || null,
      },
    });
    return this.viewTransfer(created);
  }

  async removeTransfer(profileId: string, id: string) {
    const result = await this.prisma.financeTransfer.updateMany({
      where: { id, profileId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!result.count)
      throw new NotFoundException('Finance transfer not found');
    return { deleted: true };
  }

  async analytics(
    profile: ProfileContext,
    input: {
      period: 'CURRENT_MONTH' | 'PREVIOUS_MONTH' | 'LAST_3_MONTHS' | 'CUSTOM';
      from?: string;
      to?: string;
    },
  ) {
    const { from, to } = this.analyticsRange(input);
    // Aggregate in Postgres so a full 366-day window does not load every
    // ledger row into Node. The result is bounded by day/category/type groups.
    const rows = await this.prisma.$queryRaw<AnalyticsAggregateRow[]>`
      SELECT
        t."type",
        t."categoryId",
        c."name" AS "categoryName",
        t."currency",
        date_trunc('day', t."occurredAt") AS "day",
        SUM(CASE
          WHEN t."valuationCurrency" = 'USD'
            AND t."amountInValuationCurrency" IS NOT NULL
          THEN t."amountInValuationCurrency"
          ELSE 0
        END) AS "valuedAmount",
        SUM(CASE
          WHEN t."valuationCurrency" IS DISTINCT FROM 'USD'
            OR t."amountInValuationCurrency" IS NULL
          THEN t."amount"
          ELSE 0
        END) AS "legacyNativeAmount",
        COUNT(*) FILTER (WHERE
          t."valuationCurrency" IS DISTINCT FROM 'USD'
          OR t."amountInValuationCurrency" IS NULL
        ) AS "legacyTransactionCount"
      FROM "FinanceTransaction" t
      LEFT JOIN "FinanceCategory" c ON c.id = t."categoryId"
      WHERE t."profileId" = ${profile.id}
        AND t."deletedAt" IS NULL
        AND t."occurredAt" >= ${from}
        AND t."occurredAt" < ${to}
      GROUP BY t."type", t."categoryId", c."name", t."currency", date_trunc('day', t."occurredAt")
    `;
    const rate = await this.currentPresentationRate(profile);
    const convert = (value: Prisma.Decimal) =>
      value.mul(rate).toDecimalPlaces(2);
    let income = new Prisma.Decimal(0);
    let expenses = new Prisma.Decimal(0);
    let legacyTransactionCount = 0;
    const legacyNativeAmounts = new Map<string, Prisma.Decimal>();
    const categories = new Map<
      string,
      { categoryId: string | null; name: string; amount: Prisma.Decimal }
    >();
    const timeline = new Map<
      string,
      { income: Prisma.Decimal; expenses: Prisma.Decimal }
    >();
    for (const row of rows) {
      // The pre-valuation schema did not retain the historical default
      // currency. Do not silently reinterpret those amounts as USD.
      legacyTransactionCount += Number(row.legacyTransactionCount || 0);
      if (row.legacyTransactionCount) {
        legacyNativeAmounts.set(
          row.currency,
          (legacyNativeAmounts.get(row.currency) || new Prisma.Decimal(0)).plus(
            row.legacyNativeAmount || 0,
          ),
        );
      }
      const amount = convert(new Prisma.Decimal(row.valuedAmount || 0));
      if (row.type === 'INCOME') income = income.plus(amount);
      else expenses = expenses.plus(amount);
      if (row.type === 'EXPENSE') {
        const key = row.categoryId || 'other';
        const current = categories.get(key) || {
          categoryId: row.categoryId,
          name: row.categoryName || 'Other',
          amount: new Prisma.Decimal(0),
        };
        current.amount = current.amount.plus(amount);
        categories.set(key, current);
      }
      const key = row.day.toISOString().slice(0, 10);
      const current = timeline.get(key) || {
        income: new Prisma.Decimal(0),
        expenses: new Prisma.Decimal(0),
      };
      if (row.type === 'INCOME') current.income = current.income.plus(amount);
      else current.expenses = current.expenses.plus(amount);
      timeline.set(key, current);
    }
    return {
      currency: profile.defaultCurrency,
      period: { ...input, from: from.toISOString(), to: to.toISOString() },
      summary: {
        income: income.toString(),
        expenses: expenses.toString(),
        netCashflow: income.minus(expenses).toString(),
      },
      expensesByCategory: [...categories.values()].map((row) => ({
        categoryId: row.categoryId,
        name: row.name,
        amount: row.amount.toString(),
        percentage: expenses.isZero()
          ? 0
          : Number(row.amount.div(expenses).mul(100).toDecimalPlaces(2)),
      })),
      timeline: [...timeline.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, row]) => ({
          date,
          income: row.income.toString(),
          expenses: row.expenses.toString(),
          netCashflow: row.income.minus(row.expenses).toString(),
        })),
      legacyFallback:
        legacyTransactionCount > 0
          ? {
              transactionCount: legacyTransactionCount,
              nativeAmounts: [...legacyNativeAmounts.entries()]
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([currency, amount]) => ({
                  currency,
                  amount: amount.toString(),
                })),
              reason: 'UNKNOWN_HISTORICAL_DEFAULT_CURRENCY' as const,
            }
          : null,
    };
  }

  private analyticsRange(input: {
    period: string;
    from?: string;
    to?: string;
  }) {
    const now = new Date();
    const month = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    if (input.period === 'CURRENT_MONTH')
      return {
        from: month,
        to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
      };
    if (input.period === 'PREVIOUS_MONTH')
      return {
        from: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
        ),
        to: month,
      };
    if (input.period === 'LAST_3_MONTHS')
      return {
        from: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1),
        ),
        to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
      };
    if (!input.from || !input.to)
      throw new BadRequestException(
        'Custom analytics requires both from and to dates',
      );
    const from = new Date(input.from);
    const to = new Date(input.to);
    if (
      Number.isNaN(+from) ||
      Number.isNaN(+to) ||
      to <= from ||
      to.getTime() - from.getTime() > 366 * 86400000
    )
      throw new BadRequestException('Invalid analytics date range');
    return { from, to };
  }

  private async currentPresentationRate(profile: ProfileContext) {
    if (profile.defaultCurrency === 'USD') return new Prisma.Decimal(1);
    const workspaceId =
      profile.workspaceId || (await this.workspaceId(profile.id));
    if (!this.conversion || !workspaceId)
      throw new BadRequestException({
        code: 'RATE_UNAVAILABLE',
        message: 'An exchange rate is unavailable. Please try again later.',
      });
    const result = await this.conversion.getRateMetadata(
      'USD',
      profile.defaultCurrency,
      workspaceId,
    );
    if (!result.available)
      throw new BadRequestException({
        code: result.code,
        message: result.message,
      });
    return new Prisma.Decimal(result.rate);
  }

  private async valuation(
    profile: ProfileContext,
    currency: string,
    occurredAt: Date,
  ) {
    if (currency === 'USD')
      return { rate: new Prisma.Decimal(1), rateAt: occurredAt };
    const workspaceId =
      profile.workspaceId || (await this.workspaceId(profile.id));
    if (!this.conversion || !workspaceId)
      throw new BadRequestException({
        code: 'RATE_UNAVAILABLE',
        message: 'An exchange rate is unavailable. Please try again later.',
      });
    const result = await this.conversion.getRateMetadata(
      currency,
      'USD',
      workspaceId,
      this.rateDateForWrite(occurredAt),
    );
    if (!result.available)
      throw new BadRequestException({
        code: result.code,
        message: result.message,
      });
    return { rate: new Prisma.Decimal(result.rate), rateAt: result.rateAt };
  }

  private async legacyDefaultSnapshot(
    profile: ProfileContext,
    currency: string,
    occurredAt: Date,
  ) {
    if (currency === profile.defaultCurrency)
      return { rate: new Prisma.Decimal(1), rateAt: occurredAt };
    const workspaceId =
      profile.workspaceId || (await this.workspaceId(profile.id));
    if (!this.conversion || !workspaceId)
      throw new BadRequestException({
        code: 'RATE_UNAVAILABLE',
        message: 'An exchange rate is unavailable. Please try again later.',
      });
    const result = await this.conversion.getRateMetadata(
      currency,
      profile.defaultCurrency,
      workspaceId,
      this.rateDateForWrite(occurredAt),
    );
    if (!result.available)
      throw new BadRequestException({
        code: result.code, message: result.message,
      });
    return { rate: new Prisma.Decimal(result.rate), rateAt: result.rateAt };
  }

  /** Today/future entries are current writes even when their timestamp is sent. */
  private rateDateForWrite(occurredAt: Date) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return occurredAt < today ? occurredAt : undefined;
  }

  private async workspaceId(profileId: string) {
    const profile = await this.prisma.financeProfile.findUnique({
      where: { id: profileId },
      select: { botIntegration: { select: { workspaceId: true } } },
    });
    return profile?.botIntegration.workspaceId;
  }

  normalizeMerchant(value: string) {
    return value
      .normalize('NFKC')
      .trim()
      .toLocaleLowerCase()
      .replace(/\s+/g, ' ')
      .slice(0, 120);
  }
  private positive(value: string | undefined, field: string) {
    try {
      const amount = new Prisma.Decimal(value || '');
      if (!amount.isFinite() || amount.lte(0)) throw new Error();
      return amount;
    } catch {
      throw new BadRequestException(`${field} must be a positive decimal`);
    }
  }
  private viewTransaction<
    T extends {
      amount: Prisma.Decimal;
      valuationCurrency?: string | null;
      amountInValuationCurrency?: Prisma.Decimal | null;
      exchangeRateToValuation?: Prisma.Decimal | null;
      valuationRateAt?: Date | null;
    },
  >(row: T) {
    const {
      amountInDefaultCurrency: _legacyAmount,
      exchangeRateToDefault: _legacyRate,
      valuationCurrency,
      amountInValuationCurrency,
      exchangeRateToValuation,
      valuationRateAt,
      ...transaction
    } = row as T & {
      amountInDefaultCurrency?: Prisma.Decimal;
      exchangeRateToDefault?: Prisma.Decimal;
    };
    return {
      ...transaction,
      amount: row.amount.toString(),
      valuationSnapshot:
        valuationCurrency && amountInValuationCurrency && exchangeRateToValuation
          ? {
              currency: valuationCurrency,
              amount: amountInValuationCurrency.toString(),
              exchangeRate: exchangeRateToValuation.toString(),
              rateAt: valuationRateAt?.toISOString() || null,
            }
          : null,
    };
  }
  private viewTransfer<
    T extends {
      fromAmount: Prisma.Decimal;
      toAmount: Prisma.Decimal;
      exchangeRate: Prisma.Decimal | null;
    },
  >(row: T) {
    return {
      ...row,
      fromAmount: row.fromAmount.toString(),
      toAmount: row.toAmount.toString(),
      exchangeRate: row.exchangeRate?.toString() || null,
    };
  }
}
