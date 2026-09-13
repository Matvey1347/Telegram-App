import { BadRequestException } from '@nestjs/common';
import type { ConsumerFinanceImportSection } from '@telegram-system/shared';

export const financeImportSections = [
  'accounts',
  'categories',
  'transactions',
  'transfers',
  'limits',
  'reminders',
  'debts',
  'regularPayments',
  'savingsGoals',
  'savingsMovements',
  'investments',
  'investmentCashFlows',
  'investmentValuations',
] as const satisfies ReadonlyArray<
  Exclude<ConsumerFinanceImportSection, 'document'>
>;

export type ImportSection = (typeof financeImportSections)[number];
export type AnyRow = Record<string, unknown> & { ref: string };

export const sectionFields: Record<ImportSection, readonly string[]> = {
  accounts: [
    'ref',
    'name',
    'emoji',
    'type',
    'currency',
    'openingBalance',
    'archivedAt',
  ],
  categories: [
    'ref',
    'parentRef',
    'name',
    'emoji',
    'type',
    'key',
    'archivedAt',
  ],
  transactions: [
    'ref',
    'accountRef',
    'categoryRef',
    'type',
    'amount',
    'economicAmount',
    'purpose',
    'necessity',
    'occurredAt',
    'description',
    'merchantDisplay',
    'items',
  ],
  transfers: [
    'ref',
    'fromAccountRef',
    'toAccountRef',
    'fromAmount',
    'toAmount',
    'occurredAt',
    'description',
  ],
  limits: ['ref', 'categoryRef', 'amount', 'currency'],
  reminders: [
    'ref',
    'name',
    'amount',
    'currency',
    'dayOfMonth',
    'reminderOffsetMinutes',
    'nextOccurrenceAt',
    'enabled',
  ],
  debts: [
    'ref',
    'accountRef',
    'settlementTransactionRef',
    'direction',
    'status',
    'necessity',
    'name',
    'amount',
    'dueAt',
    'scheduleTimezone',
    'note',
    'settledAt',
  ],
  regularPayments: [
    'ref',
    'accountRef',
    'categoryRef',
    'name',
    'amount',
    'recurrence',
    'nextOccurrenceAt',
    'scheduleTimezone',
    'note',
    'status',
  ],
  savingsGoals: [
    'ref',
    'name',
    'targetAmount',
    'initialAmount',
    'currency',
    'targetDate',
    'note',
    'status',
  ],
  savingsMovements: [
    'ref',
    'accountRef',
    'fromGoalRef',
    'toGoalRef',
    'linkedTransferRef',
    'kind',
    'amount',
    'occurredAt',
    'note',
  ],
  investments: [
    'ref',
    'name',
    'description',
    'type',
    'currency',
    'status',
    'startedAt',
    'closedAt',
  ],
  investmentCashFlows: [
    'ref',
    'investmentRef',
    'accountRef',
    'kind',
    'amount',
    'occurredAt',
    'note',
  ],
  investmentValuations: [
    'ref',
    'investmentRef',
    'value',
    'valuedAt',
    'createdAt',
    'correctsRef',
    'note',
  ],
};

export function fail(path: string, message: string): never {
  throw new BadRequestException({
    code: 'FINANCE_IMPORT_INVALID',
    message,
    path,
  });
}

export function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(path, 'Expected an object');
  return value as Record<string, unknown>;
}

export function exactKeys(
  value: Record<string, unknown>,
  path: string,
  allowed: readonly string[],
) {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) fail(`${path}.${unexpected}`, 'Unknown field');
}

export function text(
  value: unknown,
  path: string,
  options: { optional?: boolean; max?: number } = {},
) {
  if (value == null && options.optional) return;
  if (typeof value !== 'string' || !value.trim())
    fail(path, 'Expected a non-empty string');
  if (value.length > (options.max ?? 2_000))
    fail(path, `Must contain at most ${options.max ?? 2_000} characters`);
}

export function oneOf(value: unknown, path: string, values: readonly string[]) {
  if (!values.includes(String(value)))
    fail(path, `Expected one of: ${values.join(', ')}`);
}

export function decimal(value: unknown, path: string, allowZero = false) {
  text(value, path, { max: 80 });
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (allowZero ? parsed < 0 : parsed <= 0))
    fail(
      path,
      allowZero
        ? 'Expected a non-negative amount'
        : 'Expected a positive amount',
    );
}

export function signedDecimal(value: unknown, path: string) {
  text(value, path, { max: 80 });
  if (!Number.isFinite(Number(value))) fail(path, 'Expected a finite amount');
}

export function currency(value: unknown, path: string) {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/u.test(value))
    fail(path, 'Expected a three-letter uppercase currency code');
}

export function instant(value: unknown, path: string, optional = false) {
  if (value == null && optional) return;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value,
    ) ||
    Number.isNaN(new Date(value).getTime())
  )
    fail(path, 'Expected an ISO-8601 date/time');
}

export function timezone(value: unknown, path: string) {
  text(value, path, { max: 120 });
  try {
    Intl.DateTimeFormat('en', { timeZone: String(value) }).format();
  } catch {
    fail(path, 'Expected a valid IANA timezone, for example Europe/Kyiv');
  }
}

export function refs(
  data: Record<ImportSection, AnyRow[]>,
  section: ImportSection,
) {
  return new Set(data[section].map((row) => row.ref));
}

export function requireRef(
  value: unknown,
  path: string,
  available: ReadonlySet<string>,
  optional = false,
) {
  if (value == null && optional) return;
  text(value, path, { max: 120 });
  if (!available.has(String(value)))
    fail(path, `Unknown reference: ${String(value)}`);
}

export function validateBase(row: AnyRow, path: string) {
  text(row.ref, `${path}.ref`, { max: 120 });
}

export function validateReferenceGraph(
  rows: AnyRow[],
  referenceField: 'parentRef' | 'correctsRef',
  path: string,
  message: string,
) {
  const references = new Map(
    rows.map((row) => [
      row.ref,
      typeof row[referenceField] === 'string' ? row[referenceField] : null,
    ]),
  );
  for (const ref of references.keys()) {
    const seen = new Set<string>();
    let current: string | null = ref;
    while (current) {
      if (seen.has(current))
        fail(`${path}[ref=${ref}].${referenceField}`, message);
      seen.add(current);
      current = references.get(current) ?? null;
    }
  }
}
