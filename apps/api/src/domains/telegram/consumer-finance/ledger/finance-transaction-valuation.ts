import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CurrencyConversionService } from '../../../../common/currency-conversion.service';

export type FinanceProfileContext = {
  id: string;
  defaultCurrency: string;
  timezone?: string;
  workspaceId?: string;
};

export type FinanceTransactionWriteContext = {
  rates: FinanceTransactionRateSource;
  accounts: ReadonlyMap<string, { id: string; currency: string }>;
  categories: ReadonlyMap<string, { id: string; type: 'INCOME' | 'EXPENSE' }>;
};

type FinanceRateSnapshot = { rate: Prisma.Decimal; rateAt: Date };
type StoredFinanceRate = { rate: string; rateAt: number };
type FinanceRateOperation = { currency: string; occurredAt: string };
type FinanceTransactionReferenceInput = {
  accountId: string;
  categoryId?: string;
  items?: Array<{ categoryId?: string }>;
};

function unavailable(code = 'RATE_UNAVAILABLE', message?: string) {
  return new BadRequestException({
    code,
    message:
      message || 'An exchange rate is unavailable. Please try again later.',
  });
}

function operationDate(value: string) {
  const occurredAt = new Date(value);
  if (Number.isNaN(occurredAt.getTime()))
    throw new BadRequestException('Transaction date is invalid');
  return occurredAt;
}

function rateKey(from: string, to: string, occurredAt: Date) {
  return `${from}:${to}:${occurredAt.toISOString()}`;
}

/** Today/future entries are current writes even when their timestamp is sent. */
export function financeRateDateForWrite(occurredAt: Date) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return occurredAt < today ? occurredAt : undefined;
}

/**
 * An operation-scoped immutable snapshot collection. It exposes no mutable map
 * and returns fresh Date/Decimal values, so transaction code cannot alter a
 * prepared rate that another operation in the same confirmation will reuse.
 */
export class FinanceTransactionRateSource {
  private readonly values: ReadonlyMap<string, StoredFinanceRate>;

  constructor(values: ReadonlyMap<string, StoredFinanceRate>) {
    this.values = new Map(values);
  }

  resolve(from: string, to: string, occurredAt: Date): FinanceRateSnapshot {
    if (from === to)
      return { rate: new Prisma.Decimal(1), rateAt: new Date(occurredAt) };
    const value = this.values.get(rateKey(from, to, occurredAt));
    if (!value) throw unavailable();
    return {
      rate: new Prisma.Decimal(value.rate),
      rateAt: new Date(value.rateAt),
    };
  }
}

export async function prepareFinanceTransactionRates(input: {
  profile: FinanceProfileContext;
  operations: FinanceRateOperation[];
  conversion?: CurrencyConversionService;
  resolveWorkspaceId: (profileId: string) => Promise<string | undefined>;
}) {
  if (!input.operations.length || input.operations.length > 10)
    throw new BadRequestException('A proposal must contain 1 to 10 operations');
  const requests = new Map<
    string,
    { from: string; to: string; occurredAt: Date; asOf?: Date }
  >();
  for (const operation of input.operations) {
    const occurredAt = operationDate(operation.occurredAt);
    const add = (to: string) => {
      if (operation.currency === to) return;
      const key = rateKey(operation.currency, to, occurredAt);
      requests.set(key, {
        from: operation.currency,
        to,
        occurredAt,
        asOf: financeRateDateForWrite(occurredAt),
      });
    };
    add('USD');
    add(input.profile.defaultCurrency);
  }
  if (!requests.size) return new FinanceTransactionRateSource(new Map());
  const workspaceId =
    input.profile.workspaceId ||
    (await input.resolveWorkspaceId(input.profile.id));
  const conversion = input.conversion;
  if (!conversion || !workspaceId) throw unavailable();
  const values = new Map<string, StoredFinanceRate>();
  const groups = new Map<
    string,
    {
      asOf?: Date;
      requests: Array<
        [string, { from: string; to: string; occurredAt: Date; asOf?: Date }]
      >;
    }
  >();
  for (const entry of requests.entries()) {
    const asOf = entry[1].asOf;
    const groupKey = asOf?.toISOString() || 'CURRENT';
    const group = groups.get(groupKey) || { asOf, requests: [] };
    group.requests.push(entry);
    groups.set(groupKey, group);
  }
  await Promise.all(
    [...groups.values()].map(async (group) => {
      const source = await conversion.prepareRateSource(
        workspaceId,
        group.asOf,
      );
      await Promise.all(
        group.requests.map(async ([key, request]) => {
          const result = await source.getRateMetadata(request.from, request.to);
          if (!result.available) throw unavailable(result.code, result.message);
          values.set(key, {
            rate: String(result.rate),
            rateAt: result.rateAt.getTime(),
          });
        }),
      );
    }),
  );
  return new FinanceTransactionRateSource(values);
}

export async function prepareFinanceAccountRates(input: {
  conversion?: CurrencyConversionService;
  workspaceId?: string;
  currencies: string[];
  defaultCurrency: string;
}) {
  const results = new Map<
    string,
    Awaited<ReturnType<CurrencyConversionService['getRateMetadata']>>
  >();
  const currencies = [
    ...new Set(
      input.currencies.filter((currency) => currency !== input.defaultCurrency),
    ),
  ];
  if (!input.conversion || !input.workspaceId || !currencies.length)
    return results;
  const source = await input.conversion.prepareRateSource(input.workspaceId);
  await Promise.all(
    currencies.map(async (currency) =>
      results.set(
        currency,
        await source.getRateMetadata(currency, input.defaultCurrency),
      ),
    ),
  );
  return results;
}

export async function prepareFinanceTransactionWriteContext(input: {
  tx: Prisma.TransactionClient;
  profileId: string;
  operations: FinanceTransactionReferenceInput[];
  rates: FinanceTransactionRateSource;
}): Promise<FinanceTransactionWriteContext> {
  const accountIds = [
    ...new Set(input.operations.map((operation) => operation.accountId)),
  ];
  const categoryIds = [
    ...new Set(
      input.operations.flatMap((operation) => [
        ...(operation.categoryId ? [operation.categoryId] : []),
        ...(operation.items || []).flatMap((item) =>
          item.categoryId ? [item.categoryId] : [],
        ),
      ]),
    ),
  ];
  const accounts = await input.tx.financeAccount.findMany({
    where: {
      id: { in: accountIds },
      profileId: input.profileId,
      archivedAt: null,
    },
    select: { id: true, currency: true },
  });
  const categories = categoryIds.length
    ? await input.tx.financeCategory.findMany({
        where: {
          id: { in: categoryIds },
          profileId: input.profileId,
          archivedAt: null,
        },
        select: { id: true, type: true },
      })
    : [];
  return {
    rates: input.rates,
    accounts: new Map(accounts.map((account) => [account.id, account])),
    categories: new Map(categories.map((category) => [category.id, category])),
  };
}

type FinanceRateDependencies = {
  conversion?: CurrencyConversionService;
  resolveWorkspaceId: (profileId: string) => Promise<string | undefined>;
};

async function resolveLiveRate(
  profile: FinanceProfileContext,
  from: string,
  to: string,
  occurredAt: Date,
  dependencies: FinanceRateDependencies,
): Promise<FinanceRateSnapshot> {
  if (from === to) return { rate: new Prisma.Decimal(1), rateAt: occurredAt };
  const workspaceId =
    profile.workspaceId || (await dependencies.resolveWorkspaceId(profile.id));
  if (!dependencies.conversion || !workspaceId) throw unavailable();
  const result = await dependencies.conversion.getRateMetadata(
    from,
    to,
    workspaceId,
    financeRateDateForWrite(occurredAt),
  );
  if (!result.available) throw unavailable(result.code, result.message);
  return { rate: new Prisma.Decimal(result.rate), rateAt: result.rateAt };
}

export function financeValuationSnapshot(
  profile: FinanceProfileContext,
  currency: string,
  occurredAt: Date,
  dependencies: FinanceRateDependencies,
  prepared?: FinanceTransactionRateSource,
) {
  return prepared
    ? prepared.resolve(currency, 'USD', occurredAt)
    : resolveLiveRate(profile, currency, 'USD', occurredAt, dependencies);
}

export function financeDefaultCurrencySnapshot(
  profile: FinanceProfileContext,
  currency: string,
  occurredAt: Date,
  dependencies: FinanceRateDependencies,
  prepared?: FinanceTransactionRateSource,
) {
  return prepared
    ? prepared.resolve(currency, profile.defaultCurrency, occurredAt)
    : resolveLiveRate(
        profile,
        currency,
        profile.defaultCurrency,
        occurredAt,
        dependencies,
      );
}

export async function currentFinancePresentationRate(
  profile: FinanceProfileContext,
  dependencies: FinanceRateDependencies,
) {
  if (profile.defaultCurrency === 'USD') return new Prisma.Decimal(1);
  const workspaceId =
    profile.workspaceId || (await dependencies.resolveWorkspaceId(profile.id));
  if (!dependencies.conversion || !workspaceId) throw unavailable();
  const result = await dependencies.conversion.getRateMetadata(
    'USD',
    profile.defaultCurrency,
    workspaceId,
  );
  if (!result.available) throw unavailable(result.code, result.message);
  return new Prisma.Decimal(result.rate);
}
