import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { financeHistoryDateRange } from '../ledger/finance-history-date-range';
import type { FinanceUltimateQueryDto } from '../http/finance.dto';
import { FinanceLedgerService } from '../ledger/finance-ledger.service';
import { financeBalanceSummary } from '../ledger/finance-balance-summary';
import {
  financeChatLocale,
  type FinanceChatLocale,
} from '../i18n/finance-chat-i18n';

type AggregateRow = {
  label: string | null;
  amount: Prisma.Decimal | null;
  transactions: bigint;
};
type MonthRow = {
  month: Date;
  income: Prisma.Decimal | null;
  expense: Prisma.Decimal | null;
};
type LegacyRow = {
  currency: string;
  amount: Prisma.Decimal | null;
  transactions: bigint;
};
const MAX_LOOKBACK_DAYS = 366;
const TOP_LIMIT = 12;
const ultimateCopy = {
  en: {
    uncategorized: 'Uncategorized',
    unknown: 'Unknown',
    suggestions: [
      'What did I spend most on?',
      'How much did I spend at this merchant?',
      'Which products cost me the most?',
    ],
    increased: (name: string, change: number) => ({
      title: `${name} spending increased`,
      detail: `${name} is ${change}% above its prior three-month monthly average.`,
    }),
    items: (value: string) => `Your highest item spending is ${value}.`,
    noItems: 'No item-level purchase data is available for this period.',
    areas: (value: string) => `Your largest spending areas are ${value}.`,
    noAreas: 'No valued expense data is available for this period.',
  },
  uk: {
    uncategorized: 'Без категорії',
    unknown: 'Невідомо',
    suggestions: [
      'На що я витратив найбільше?',
      'Скільки я витратив у цього продавця?',
      'Які товари коштували найдорожче?',
    ],
    increased: (name: string, change: number) => ({
      title: `Витрати «${name}» зросли`,
      detail: `Витрати «${name}» на ${change}% вищі за середнє за попередні три місяці.`,
    }),
    items: (value: string) => `Найбільші витрати за товарами: ${value}.`,
    noItems: 'За цей період немає даних за окремими товарами.',
    areas: (value: string) => `Найбільші напрями витрат: ${value}.`,
    noAreas: 'За цей період немає оцінених витрат.',
  },
  ru: {
    uncategorized: 'Без категории',
    unknown: 'Неизвестно',
    suggestions: [
      'На что я потратил больше всего?',
      'Сколько я потратил у этого продавца?',
      'Какие товары стоили дороже всего?',
    ],
    increased: (name: string, change: number) => ({
      title: `Расходы «${name}» выросли`,
      detail: `Расходы «${name}» на ${change}% выше среднего за предыдущие три месяца.`,
    }),
    items: (value: string) => `Наибольшие расходы по товарам: ${value}.`,
    noItems: 'За этот период нет данных по отдельным товарам.',
    areas: (value: string) => `Наибольшие направления расходов: ${value}.`,
    noAreas: 'За этот период нет оценённых расходов.',
  },
} satisfies Record<FinanceChatLocale, object>;

/**
 * On-demand Ultimate intelligence. Every calculation is deterministic and
 * profile-filtered; it creates neither snapshots nor recurring work.
 */
@Injectable()
export class FinanceUltimateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: FinanceLedgerService,
  ) {}

  async overview(profileId: string) {
    const profile = await this.profile(profileId);
    const range = this.range({}, profile.timezone, 90);
    const [reminders, accounts, insights, anomalies] = await Promise.all([
      this.prisma.financeReminder.findMany({
        where: { profileId, enabled: true },
        select: {
          name: true,
          amount: true,
          currency: true,
          nextOccurrenceAt: true,
        },
        orderBy: { nextOccurrenceAt: 'asc' },
        take: 30,
      }),
      this.ledger.accounts(
        profileId,
        profile.defaultCurrency,
        profile.workspaceId,
      ),
      this.insights(profileId),
      this.anomalies(profileId),
    ]);
    const expected = reminders
      .filter(
        (r) =>
          r.currency === profile.defaultCurrency &&
          r.nextOccurrenceAt < range.to,
      )
      .reduce((sum, r) => sum + this.number(r.amount), 0);
    const balanceSummary = financeBalanceSummary(
      accounts,
      profile.defaultCurrency,
    );
    const balance = this.number(new Prisma.Decimal(balanceSummary.amount));
    const forecast = balance - expected;
    return {
      currency: profile.defaultCurrency,
      balance: this.fixed(balance),
      balanceSummary,
      forecast: {
        expectedIncome: '0',
        expectedExpenses: this.fixed(expected),
        projectedBalance: this.fixed(forecast),
        through: range.to.toISOString(),
      },
      insights: insights.insights,
      anomalies: anomalies.anomalies,
    };
  }

  async analytics(profileId: string, dto: FinanceUltimateQueryDto) {
    const profile = await this.profile(profileId);
    const range = this.range(dto, profile.timezone, 180);
    const filter = Prisma.sql`WHERE t."profileId" = ${profileId} AND t."deletedAt" IS NULL AND t."type" = 'EXPENSE' AND t."valuationCurrency" = 'USD' AND t."amountInValuationCurrency" IS NOT NULL AND t."occurredAt" >= ${range.from} AND t."occurredAt" < ${range.to}`;
    const [categories, merchants, accounts, months, itemFacts, legacyFallback] =
      await Promise.all([
        this.prisma.$queryRaw<AggregateRow[]>(
          Prisma.sql`SELECT COALESCE(c."name", 'Uncategorized') AS label, SUM(t."amountInValuationCurrency") AS amount, COUNT(*)::bigint AS transactions FROM "FinanceTransaction" t LEFT JOIN "FinanceCategory" c ON c.id = t."categoryId" ${filter} ${dto.categoryId ? Prisma.sql`AND t."categoryId" = ${dto.categoryId}` : Prisma.empty} GROUP BY c."name" ORDER BY amount DESC NULLS LAST LIMIT ${TOP_LIMIT}`,
        ),
        this.prisma.$queryRaw<AggregateRow[]>(
          Prisma.sql`SELECT COALESCE(t."merchantDisplay", t."merchantNormalized", 'Unknown merchant') AS label, SUM(t."amountInValuationCurrency") AS amount, COUNT(*)::bigint AS transactions FROM "FinanceTransaction" t ${filter} ${dto.merchant ? Prisma.sql`AND t."merchantNormalized" = ${this.normalize(dto.merchant)}` : Prisma.empty} GROUP BY t."merchantDisplay", t."merchantNormalized" ORDER BY amount DESC NULLS LAST LIMIT ${TOP_LIMIT}`,
        ),
        this.prisma.$queryRaw<AggregateRow[]>(
          Prisma.sql`SELECT a."name" AS label, SUM(t."amountInValuationCurrency") AS amount, COUNT(*)::bigint AS transactions FROM "FinanceTransaction" t JOIN "FinanceAccount" a ON a.id = t."accountId" ${filter} GROUP BY a."name" ORDER BY amount DESC NULLS LAST LIMIT ${TOP_LIMIT}`,
        ),
        this.monthly(profileId, range.from, range.to),
        this.items(profileId, dto),
        this.legacyFallback(profileId, range.from, range.to),
      ]);
    return {
      currency: 'USD',
      period: this.period(range),
      categories: this.contractRows(categories, false, profile.locale),
      merchants: this.contractRows(merchants, true, profile.locale),
      accounts: this.contractRows(accounts, false, profile.locale),
      trend: months.map((r) => ({
        date: r.month.toISOString().slice(0, 10),
        amount: this.fixed(r.expense),
        transactionCount: 0,
      })),
      items: itemFacts,
      legacyFallback,
    };
  }

  async items(profileId: string, dto: FinanceUltimateQueryDto) {
    const profile = await this.profile(profileId);
    const range = this.range(dto, profile.timezone, 180);
    // Item values have no valuation snapshot. Only combine rows in one
    // currency; never fabricate a cross-currency product total.
    const where = Prisma.sql`WHERE t."profileId" = ${profileId} AND t."deletedAt" IS NULL AND t."type" = 'EXPENSE' AND t."currency" = ${profile.defaultCurrency} AND t."occurredAt" >= ${range.from} AND t."occurredAt" < ${range.to}`;
    const [items, coverage] = await Promise.all([
      this.prisma.$queryRaw<AggregateRow[]>(
        Prisma.sql`SELECT COALESCE(i."normalizedName", i."displayName") AS label, SUM(i."totalAmount") AS amount, COUNT(DISTINCT t.id)::bigint AS transactions FROM "FinanceTransactionItem" i JOIN "FinanceTransaction" t ON t.id = i."transactionId" ${where} AND i."currency" = ${profile.defaultCurrency} GROUP BY i."normalizedName", i."displayName" ORDER BY amount DESC NULLS LAST LIMIT ${TOP_LIMIT}`,
      ),
      this.prisma.$queryRaw<{ purchases: bigint; covered: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::bigint AS purchases, COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "FinanceTransactionItem" i WHERE i."transactionId" = t.id AND i."currency" = ${profile.defaultCurrency}))::bigint AS covered FROM "FinanceTransaction" t ${where}`,
      ),
    ]);
    const c = coverage[0] || { purchases: BigInt(0), covered: BigInt(0) };
    return {
      currency: profile.defaultCurrency,
      availablePurchaseCount: Number(c.covered),
      totalPurchaseCount: Number(c.purchases),
      rows: items.map((row) => ({
        name: row.label || ultimateCopy[profile.locale].unknown,
        amount: this.fixed(this.number(row.amount)),
        quantity: null,
      })),
    };
  }

  async insights(profileId: string) {
    const profile = await this.profile(profileId);
    const now = new Date();
    const currentStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const previousStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1),
    );
    const rows = await this.prisma.$queryRaw<AggregateRow[]>(
      Prisma.sql`SELECT COALESCE(c."name", 'Uncategorized') AS label, SUM(t."amountInValuationCurrency") FILTER (WHERE t."occurredAt" >= ${currentStart}) AS amount, COUNT(*)::bigint AS transactions FROM "FinanceTransaction" t LEFT JOIN "FinanceCategory" c ON c.id = t."categoryId" WHERE t."profileId" = ${profileId} AND t."deletedAt" IS NULL AND t."type" = 'EXPENSE' AND t."valuationCurrency" = 'USD' AND t."amountInValuationCurrency" IS NOT NULL AND t."occurredAt" >= ${previousStart} GROUP BY c."name" ORDER BY amount DESC NULLS LAST LIMIT ${TOP_LIMIT}`,
    );
    // The comparison needs two bounded aggregates; avoid guessing when the baseline has too little data.
    const baseline = await this.prisma.$queryRaw<AggregateRow[]>(
      Prisma.sql`SELECT COALESCE(c."name", 'Uncategorized') AS label, SUM(t."amountInValuationCurrency") / 3 AS amount, COUNT(*)::bigint AS transactions FROM "FinanceTransaction" t LEFT JOIN "FinanceCategory" c ON c.id = t."categoryId" WHERE t."profileId" = ${profileId} AND t."deletedAt" IS NULL AND t."type" = 'EXPENSE' AND t."valuationCurrency" = 'USD' AND t."amountInValuationCurrency" IS NOT NULL AND t."occurredAt" >= ${previousStart} AND t."occurredAt" < ${currentStart} GROUP BY c."name"`,
    );
    const localized = ultimateCopy[profile.locale];
    const base = new Map(
      baseline.map((x) => [
        x.label || localized.uncategorized,
        this.number(x.amount),
      ]),
    );
    const insights = rows
      .flatMap((row) => {
        const current = this.number(row.amount);
        const previous = base.get(row.label || localized.uncategorized) || 0;
        if (previous < 1 || current < previous * 1.25) return [];
        const change = Math.round((current / previous - 1) * 100);
        const name = row.label || localized.uncategorized;
        const message = localized.increased(name, change);
        return [
          {
            kind: 'CATEGORY_CHANGE' as const,
            ...message,
            amount: this.fixed(current),
            changePercent: change,
          },
        ];
      })
      .slice(0, 3);
    return { insights };
  }

  async anomalies(profileId: string) {
    await this.profile(profileId);
    const since = new Date(Date.now() - 180 * 86400000);
    const recent = new Date(Date.now() - 31 * 86400000);
    const rows = await this.prisma.$queryRaw<
      {
        label: string;
        current: Prisma.Decimal;
        average: Prisma.Decimal;
        occurredAt: Date;
      }[]
    >(
      Prisma.sql`WITH grouped AS (SELECT COALESCE("merchantNormalized", "merchantDisplay") AS merchant, "amountInValuationCurrency" AS amount, "occurredAt" FROM "FinanceTransaction" WHERE "profileId" = ${profileId} AND "deletedAt" IS NULL AND type = 'EXPENSE' AND "valuationCurrency" = 'USD' AND "amountInValuationCurrency" IS NOT NULL AND "occurredAt" >= ${since} AND COALESCE("merchantNormalized", "merchantDisplay") IS NOT NULL), averages AS (SELECT merchant, AVG(amount) AS average, COUNT(*)::bigint AS samples FROM grouped WHERE "occurredAt" < ${recent} GROUP BY merchant HAVING COUNT(*) >= 4) SELECT g.merchant AS label, g.amount AS current, a.average, g."occurredAt" FROM grouped g JOIN averages a ON a.merchant = g.merchant WHERE g."occurredAt" >= ${recent} AND g.amount >= a.average * 2 ORDER BY (g.amount / a.average) DESC LIMIT 10`,
    );
    return {
      anomalies: rows.map((r) => ({
        merchant: r.label,
        amount: this.fixed(this.number(r.current)),
        usualAmount: this.fixed(this.number(r.average)),
        multiple: Number(
          (this.number(r.current) / this.number(r.average)).toFixed(1),
        ),
        occurredAt: r.occurredAt.toISOString(),
      })),
    };
  }

  async answer(
    profileId: string,
    dto: FinanceUltimateQueryDto & { question: string },
  ) {
    const profile = await this.profile(profileId);
    const localized = ultimateCopy[profile.locale];
    const facts = await this.analytics(profileId, dto);
    const lower = dto.question.toLocaleLowerCase();
    const suggestedQuestions = localized.suggestions;
    if (/product|item|товар|продукт/u.test(lower)) {
      const items = await this.items(profileId, dto);
      const top = items.rows.slice(0, 5);
      return {
        answer: top.length
          ? localized.items(
              top
                .map(
                  (item) => `${item.name} (${item.amount} ${items.currency})`,
                )
                .join(', '),
            )
          : localized.noItems,
        facts: top.map((item) => ({
          label: item.name,
          amount: item.amount,
          currency: items.currency,
        })),
        suggestedQuestions,
      };
    }
    const source = /restaurant|ресторан|merchant|магазин|biedronka/u.test(lower)
      ? facts.merchants
      : facts.categories;
    const top = source.slice(0, 5);
    return {
      answer: top.length
        ? localized.areas(
            top
              .map((row) => `${row.name} (${row.amount} ${facts.currency})`)
              .join(', '),
          )
        : localized.noAreas,
      facts: top.map((row) => ({
        label: row.name,
        amount: row.amount,
        currency: facts.currency,
      })),
      suggestedQuestions,
    };
  }

  private async profile(profileId: string) {
    const row = await this.prisma.financeProfile.findUnique({
      where: { id: profileId },
      select: {
        defaultCurrency: true,
        timezone: true,
        locale: true,
        telegramUser: { select: { languageCode: true } },
        botIntegration: { select: { workspaceId: true } },
      },
    });
    if (!row) throw new BadRequestException('Finance profile not found');
    return {
      defaultCurrency: row.defaultCurrency,
      timezone: row.timezone,
      workspaceId: row.botIntegration.workspaceId,
      locale: financeChatLocale(row.locale, row.telegramUser?.languageCode),
    };
  }
  private range(
    dto: FinanceUltimateQueryDto,
    timezone: string,
    fallbackDays: number,
  ) {
    const range = financeHistoryDateRange(dto.from, dto.to, timezone);
    const to = range.to || new Date();
    const selectedDays =
      dto.period === 'LAST_3_MONTHS'
        ? 90
        : dto.period === 'LAST_12_MONTHS'
          ? 366
          : dto.period === 'LAST_6_MONTHS'
            ? 183
            : fallbackDays;
    const from = range.from || new Date(to.getTime() - selectedDays * 86400000);
    if (to.getTime() - from.getTime() > MAX_LOOKBACK_DAYS * 86400000)
      throw new BadRequestException(
        'Ultimate analytics supports up to 366 days',
      );
    return { from, to };
  }
  private async monthly(profileId: string, from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<MonthRow[]>(
      Prisma.sql`SELECT date_trunc('month', "occurredAt") AS month, SUM("amountInValuationCurrency") FILTER (WHERE type = 'INCOME') AS income, SUM("amountInValuationCurrency") FILTER (WHERE type = 'EXPENSE') AS expense FROM "FinanceTransaction" WHERE "profileId" = ${profileId} AND "deletedAt" IS NULL AND "valuationCurrency" = 'USD' AND "amountInValuationCurrency" IS NOT NULL AND "occurredAt" >= ${from} AND "occurredAt" < ${to} GROUP BY 1 ORDER BY 1`,
    );
    return rows.map((r) => ({
      month: r.month,
      income: this.number(r.income),
      expense: this.number(r.expense),
    }));
  }
  private async legacyFallback(profileId: string, from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<LegacyRow[]>(
      Prisma.sql`SELECT "currency", SUM("amount") AS amount, COUNT(*)::bigint AS transactions FROM "FinanceTransaction" WHERE "profileId" = ${profileId} AND "deletedAt" IS NULL AND type = 'EXPENSE' AND ("valuationCurrency" IS DISTINCT FROM 'USD' OR "amountInValuationCurrency" IS NULL) AND "occurredAt" >= ${from} AND "occurredAt" < ${to} GROUP BY "currency" ORDER BY "currency"`,
    );
    if (!rows.length) return null;
    return {
      transactionCount: rows.reduce(
        (sum, row) => sum + Number(row.transactions),
        0,
      ),
      nativeAmounts: rows.map((row) => ({
        currency: row.currency,
        amount: this.fixed(this.number(row.amount)),
      })),
      reason: 'UNKNOWN_HISTORICAL_DEFAULT_CURRENCY' as const,
    };
  }
  private contractRows(
    rows: AggregateRow[],
    merchant = false,
    locale: FinanceChatLocale = 'en',
  ) {
    return rows.map((r) =>
      merchant
        ? {
            name: r.label || ultimateCopy[locale].unknown,
            amount: this.fixed(this.number(r.amount)),
            transactionCount: Number(r.transactions),
            averageTransaction: this.fixed(
              this.number(r.amount) / Math.max(Number(r.transactions), 1),
            ),
          }
        : {
            name: r.label || ultimateCopy[locale].unknown,
            amount: this.fixed(this.number(r.amount)),
            transactionCount: Number(r.transactions),
          },
    );
  }
  private period(range: { from: Date; to: Date }) {
    return { from: range.from.toISOString(), to: range.to.toISOString() };
  }
  private number(value: Prisma.Decimal | number | null | undefined) {
    return value == null ? 0 : Number(value);
  }
  private fixed(value: number) {
    return Number(value.toFixed(2)).toString();
  }
  private normalize(value: string) {
    return value.trim().toLocaleLowerCase();
  }
}
