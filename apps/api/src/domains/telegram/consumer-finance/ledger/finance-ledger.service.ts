import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FinanceTransactionSource, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CurrencyConversionService } from '../../../../common/currency-conversion.service';
import { FINANCE_UNDO_TTL_MS } from '../catalog/finance-defaults';
import { financeAccountView } from '../catalog/finance-account-view';
import {
  financeAnalyticsDateRange,
  financeHistoryDateRange,
  financeOccurredAtFilter,
} from './finance-history-date-range';
import { financeBalanceSummary } from './finance-balance-summary';
import {
  financeAnalyticsView,
  type FinanceAnalyticsAggregateRow,
} from '../analytics/finance-analytics-view';
import {
  financeTransactionSearchFilter,
  financeTransactionSelect,
  financeTransactionView,
} from './finance-transaction-view';
import type {
  CreateFinanceTransactionDto,
  FinanceHistoryQueryDto,
  UpdateFinanceTransactionDto,
} from '../http/finance.dto';
import {
  financeAccountEmoji,
  financeIconPresentation,
} from '../catalog/finance-entity-emoji';
import {
  currentFinancePresentationRate,
  financeDefaultCurrencySnapshot,
  financeValuationSnapshot,
  prepareFinanceAccountRates,
  prepareFinanceTransactionRates,
  prepareFinanceTransactionWriteContext,
  type FinanceProfileContext,
  type FinanceTransactionRateSource,
  type FinanceTransactionWriteContext,
} from './finance-transaction-valuation';
@Injectable()
export class FinanceLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversion?: CurrencyConversionService,
  ) {}
  async profileContext(profileId: string): Promise<FinanceProfileContext> {
    const profile = await this.prisma.financeProfile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        defaultCurrency: true,
        timezone: true,
        botIntegration: { select: { workspaceId: true } },
      },
    });
    if (!profile) throw new NotFoundException('Finance profile not found');
    return {
      id: profile.id,
      defaultCurrency: profile.defaultCurrency,
      timezone: profile.timezone,
      workspaceId: profile.botIntegration.workspaceId,
    };
  }
  async accounts(
    profileId: string,
    profileCurrency?: string,
    workspaceId?: string,
  ) {
    const accounts = await this.prisma.financeAccount.findMany({
      where: { profileId },
      select: {
        id: true,
        name: true,
        emoji: true,
        type: true,
        currency: true,
        openingBalance: true,
        archivedAt: true,
      },
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
    const missingContext =
      !profileCurrency || !workspaceId
        ? await this.prisma.financeProfile.findUnique({
            where: { id: profileId },
            select: {
              defaultCurrency: true,
              botIntegration: { select: { workspaceId: true } },
            },
          })
        : null;
    const defaultCurrency =
      profileCurrency || missingContext?.defaultCurrency || 'USD';
    const resolvedWorkspaceId =
      workspaceId || missingContext?.botIntegration.workspaceId;
    const equivalents = await prepareFinanceAccountRates({
      conversion: this.conversion,
      workspaceId: resolvedWorkspaceId,
      currencies: accounts.map((account) => account.currency),
      defaultCurrency,
    });
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
        id: account.id,
        name: account.name,
        iconPresentation: financeIconPresentation(
          account.emoji,
          financeAccountEmoji(account.type),
        ),
        type: account.type,
        currency: account.currency,
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
        archivedAt: account.archivedAt,
      };
    });
  }
  async account(profileId: string, accountId: string) {
    return financeAccountView(
      this.prisma,
      this.conversion,
      profileId,
      accountId,
    );
  }

  prepareTransactionRateSource(
    profile: FinanceProfileContext,
    operations: Array<{ currency: string; occurredAt: string }>,
  ) {
    return prepareFinanceTransactionRates({
      profile,
      operations,
      conversion: this.conversion,
      resolveWorkspaceId: (profileId) => this.workspaceId(profileId),
    });
  }

  async prepareTransactionWriteContext(
    tx: Prisma.TransactionClient,
    profileId: string,
    operations: CreateFinanceTransactionDto[],
    rates: FinanceTransactionRateSource,
  ): Promise<FinanceTransactionWriteContext> {
    return prepareFinanceTransactionWriteContext({
      tx,
      profileId,
      operations,
      rates,
    });
  }

  async createTransaction(
    profile: FinanceProfileContext,
    dto: CreateFinanceTransactionDto,
    source: FinanceTransactionSource = 'MINI_APP',
    id?: string,
  ) {
    return this.prisma.$transaction((tx) =>
      this.createTransactionInTransaction(tx, profile, dto, source, id),
    );
  }

  async createTransactionInTransaction(
    tx: Prisma.TransactionClient,
    profile: FinanceProfileContext,
    dto: CreateFinanceTransactionDto,
    source: FinanceTransactionSource = 'MINI_APP',
    id?: string,
    writeContext?: FinanceTransactionWriteContext,
  ) {
    const amount = this.positive(dto.amount, 'amount');
    const account = writeContext
      ? writeContext.accounts.get(dto.accountId)
      : await tx.financeAccount.findFirst({
          where: {
            id: dto.accountId,
            profileId: profile.id,
            archivedAt: null,
          },
        });
    if (!account) throw new NotFoundException('Finance account not found');
    const currency = account.currency;
    const category = dto.categoryId
      ? writeContext
        ? writeContext.categories.get(dto.categoryId)
        : await tx.financeCategory.findFirst({
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
      financeValuationSnapshot(
        profile,
        currency,
        occurredAt,
        this.rateDependencies(),
        writeContext?.rates,
      ),
      financeDefaultCurrencySnapshot(
        profile,
        currency,
        occurredAt,
        this.rateDependencies(),
        writeContext?.rates,
      ),
    ]);
    const description = dto.description?.trim() || null;
    const merchantDisplay = dto.merchantDisplay?.trim() || null;
    const items = await this.items(
      tx,
      profile.id,
      dto.type,
      dto.items,
      writeContext?.categories,
    );
    const created = await tx.financeTransaction.create({
      data: {
        ...(id ? { id } : {}),
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
        merchantDisplay,
        merchantNormalized:
          merchantDisplay || description
            ? this.normalizeMerchant(merchantDisplay || description || '')
            : null,
        source,
        items: items.length ? { create: items } : undefined,
      },
      select: financeTransactionSelect,
    });
    const merchantMappingKey = merchantDisplay || description;
    if (merchantMappingKey && category)
      await tx.financeMerchantMapping.upsert({
        where: {
          profileId_merchantNormalized: {
            profileId: profile.id,
            merchantNormalized: this.normalizeMerchant(merchantMappingKey),
          },
        },
        update: { categoryId: category.id },
        create: {
          profileId: profile.id,
          merchantNormalized: this.normalizeMerchant(merchantMappingKey),
          categoryId: category.id,
        },
      });
    return financeTransactionView(created);
  }

  async updateTransaction(
    profile: FinanceProfileContext,
    id: string,
    dto: UpdateFinanceTransactionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.financeTransaction.findFirst({
        where: { id, profileId: profile.id, deletedAt: null },
        select: {
          id: true,
          accountId: true,
          categoryId: true,
          merchantDisplay: true,
        },
      });
      if (!existing)
        throw new NotFoundException('Finance transaction not found');
      return this.createReplacement(tx, profile, existing, dto);
    });
  }

  private async createReplacement(
    tx: Prisma.TransactionClient,
    profile: FinanceProfileContext,
    existing: {
      id: string;
      accountId: string;
      categoryId: string | null;
      merchantDisplay: string | null;
    },
    dto: UpdateFinanceTransactionDto,
  ) {
    const amount = this.positive(dto.amount, 'amount');
    const account = await tx.financeAccount.findFirst({
      where: {
        id: dto.accountId,
        profileId: profile.id,
        ...(dto.accountId === existing.accountId ? {} : { archivedAt: null }),
      },
    });
    if (!account) throw new NotFoundException('Finance account not found');
    const currency = account.currency;
    const category = dto.categoryId
      ? await tx.financeCategory.findFirst({
          where: {
            id: dto.categoryId,
            profileId: profile.id,
            ...(dto.categoryId === existing.categoryId
              ? {}
              : { archivedAt: null }),
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
      financeValuationSnapshot(
        profile,
        currency,
        occurredAt,
        this.rateDependencies(),
      ),
      financeDefaultCurrencySnapshot(
        profile,
        currency,
        occurredAt,
        this.rateDependencies(),
      ),
    ]);
    const description = dto.description?.trim() || null;
    const merchantDisplay =
      dto.merchantDisplay === undefined
        ? existing.merchantDisplay
        : dto.merchantDisplay.trim() || null;
    const items =
      dto.items === undefined
        ? undefined
        : await this.items(tx, profile.id, dto.type, dto.items);
    const updated = await tx.financeTransaction.update({
      where: { id: existing.id },
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
        description,
        merchantDisplay,
        merchantNormalized:
          merchantDisplay || description
            ? this.normalizeMerchant(merchantDisplay || description || '')
            : null,
        ...(items === undefined
          ? {}
          : {
              items: {
                deleteMany: {},
                ...(items.length ? { create: items } : {}),
              },
            }),
      },
      select: financeTransactionSelect,
    });
    const merchantMappingKey = merchantDisplay || description;
    if (merchantMappingKey && category)
      await tx.financeMerchantMapping.upsert({
        where: {
          profileId_merchantNormalized: {
            profileId: profile.id,
            merchantNormalized: this.normalizeMerchant(merchantMappingKey),
          },
        },
        update: { categoryId: category.id },
        create: {
          profileId: profile.id,
          merchantNormalized: this.normalizeMerchant(merchantMappingKey),
          categoryId: category.id,
        },
      });
    return financeTransactionView(updated);
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
    const restored = await this.prisma.financeTransaction.findFirst({
      where: { id, profileId },
      select: financeTransactionSelect,
    });
    if (result.count && restored)
      return {
        undone: true,
        duplicate: false,
        transaction: financeTransactionView(restored),
      };
    if (restored?.deletedAt === null)
      return {
        undone: true,
        duplicate: true,
        transaction: financeTransactionView(restored),
      };
    throw new BadRequestException(
      'Undo window has expired or transaction does not exist',
    );
  }

  async history(
    profileId: string,
    query: FinanceHistoryQueryDto,
    timezone = 'UTC',
  ) {
    const range = financeHistoryDateRange(query.from, query.to, timezone);
    const rows = await this.prisma.financeTransaction.findMany({
      where: {
        profileId,
        deletedAt: null,
        ...(query.type ? { type: query.type } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.accountId ? { accountId: query.accountId } : {}),
        ...financeTransactionSearchFilter(query.search),
        ...financeOccurredAtFilter(range),
      },
      select: financeTransactionSelect,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const items = rows
      .slice(0, query.limit)
      .map((row) => financeTransactionView(row));
    return { items, nextCursor: hasMore ? items.at(-1)?.id || null : null };
  }

  async detail(profileId: string, id: string) {
    const row = await this.prisma.financeTransaction.findFirst({
      where: { id, profileId, deletedAt: null },
      select: {
        ...financeTransactionSelect,
        items: {
          select: {
            id: true,
            displayName: true,
            normalizedName: true,
            quantity: true,
            unitPrice: true,
            totalAmount: true,
            currency: true,
            category: {
              select: { id: true, name: true, key: true, type: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!row) throw new NotFoundException('Finance transaction not found');
    return {
      ...financeTransactionView(row),
      items: row.items.map((item) => ({
        ...item,
        quantity: item.quantity?.toString() || null,
        unitPrice: item.unitPrice?.toString() || null,
        totalAmount: item.totalAmount.toString(),
      })),
    };
  }

  private async items(
    tx: Prisma.TransactionClient,
    profileId: string,
    type: CreateFinanceTransactionDto['type'],
    items: CreateFinanceTransactionDto['items'],
    preparedCategories?: FinanceTransactionWriteContext['categories'],
  ) {
    if (!items?.length) return [];
    const categoryIds = [
      ...new Set(items.map((item) => item.categoryId).filter(Boolean)),
    ] as string[];
    if (categoryIds.length) {
      const categories = preparedCategories
        ? categoryIds
            .map((categoryId) => preparedCategories.get(categoryId))
            .filter((category) => category !== undefined)
        : await tx.financeCategory.findMany({
            where: { id: { in: categoryIds }, profileId, archivedAt: null },
            select: { id: true, type: true },
          });
      if (
        categories.length !== categoryIds.length ||
        categories.some((category) => category.type !== type)
      )
        throw new NotFoundException('Finance item category not found');
    }
    return items.map((item) => ({
      displayName: item.displayName.trim(),
      normalizedName: this.normalizeMerchant(item.displayName),
      quantity: item.quantity
        ? this.positive(item.quantity, 'item quantity')
        : null,
      unitPrice: item.unitPrice
        ? this.positive(item.unitPrice, 'item unit price')
        : null,
      totalAmount: this.positive(item.totalAmount, 'item total amount'),
      currency: item.currency.toUpperCase(),
      categoryId: item.categoryId || null,
    }));
  }

  async stats(profileId: string, from: Date, to: Date) {
    if (to <= from || to.getTime() - from.getTime() > 366 * 86400000)
      throw new BadRequestException('Invalid or unbounded statistics range');
    const profile = await this.prisma.financeProfile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        defaultCurrency: true,
        timezone: true,
        botIntegration: { select: { workspaceId: true } },
      },
    });
    if (!profile) throw new NotFoundException('Finance profile not found');
    const [analytics, accounts] = await Promise.all([
      this.analytics(
        {
          id: profile.id,
          defaultCurrency: profile.defaultCurrency,
          timezone: profile.timezone,
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
        categoryKey: row.categoryKey,
        name: row.name,
        amount: row.amount,
      })),
      accounts,
      totalBalance: financeBalanceSummary(accounts, profile.defaultCurrency),
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
    const { from, to } = financeAnalyticsDateRange(
      input,
      profile.timezone || 'UTC',
    );
    // Aggregate in Postgres so a full 366-day window does not load every
    // ledger row into Node. The result is bounded by day/category/type groups.
    const rows = await this.prisma.$queryRaw<FinanceAnalyticsAggregateRow[]>`
      SELECT
        t."type",
        t."categoryId",
        c."name" AS "categoryName",
        c."key" AS "categoryKey",
        t."currency",
        to_char(t."occurredAt" AT TIME ZONE ${profile.timezone || 'UTC'}, 'YYYY-MM-DD') AS "day",
        SUM(CASE
          WHEN t."valuationCurrency" = 'USD'
            AND t."amountInValuationCurrency" IS NOT NULL
          THEN t."amountInValuationCurrency"
          ELSE 0
        END) AS "valuedAmount",
        SUM(t."amount") AS "nativeAmount",
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
      GROUP BY t."type", t."categoryId", c."name", c."key", t."currency", 6
    `;
    const hasValuedAmount = rows.some(
      (row) =>
        row.currency !== profile.defaultCurrency &&
        !new Prisma.Decimal(row.valuedAmount || 0).isZero(),
    );
    const rate = hasValuedAmount
      ? await currentFinancePresentationRate(profile, this.rateDependencies())
      : new Prisma.Decimal(1);
    return financeAnalyticsView({
      rows,
      rate,
      currency: profile.defaultCurrency,
      period: { ...input, from: from.toISOString(), to: to.toISOString() },
    });
  }

  private rateDependencies() {
    return {
      conversion: this.conversion,
      resolveWorkspaceId: (profileId: string) => this.workspaceId(profileId),
    };
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
}
