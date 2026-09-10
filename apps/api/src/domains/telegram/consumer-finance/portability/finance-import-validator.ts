import type { ConsumerFinanceImportDocumentV1 } from '@telegram-system/shared';
import { Prisma } from '@prisma/client';
import {
  type AnyRow,
  currency,
  decimal,
  exactKeys,
  fail,
  financeImportSections,
  type ImportSection,
  instant,
  object,
  oneOf,
  refs,
  requireRef,
  sectionFields,
  text,
  timezone,
  validateBase,
  validateReferenceGraph,
} from './finance-import-validation';
import { validateFinanceImportLedger } from './finance-import-ledger-validator';

const FORMAT = 'telegram-system.consumer-finance';
const MAX_TOTAL_ROWS = 5_000;
const MAX_SECTION_ROWS = 5_000;
const sections = financeImportSections;

export function validateFinanceImportDocument(
  input: unknown,
): ConsumerFinanceImportDocumentV1 {
  const root = object(input, '$');
  exactKeys(root, '$', ['format', 'version', 'mode', 'settings', 'data']);
  if (root.format !== FORMAT) fail('format', `Expected ${FORMAT}`);
  if (root.version !== 1)
    fail('version', 'Only import format version 1 is supported');
  if (root.mode !== 'ADD') fail('mode', 'Only ADD mode is supported');
  if (root.settings != null) {
    const settings = object(root.settings, 'settings');
    exactKeys(settings, 'settings', [
      'defaultCurrency',
      'timezone',
      'locale',
      'displayName',
    ]);
    if (settings.defaultCurrency != null)
      currency(settings.defaultCurrency, 'settings.defaultCurrency');
    if (settings.timezone != null)
      timezone(settings.timezone, 'settings.timezone');
    if (settings.locale != null)
      oneOf(settings.locale, 'settings.locale', ['uk', 'ru', 'en']);
    if (settings.displayName != null)
      text(settings.displayName, 'settings.displayName', { max: 120 });
  }
  const rawData = object(root.data, 'data');
  exactKeys(rawData, 'data', sections);
  const data = Object.fromEntries(
    sections.map((section) => {
      const value = rawData[section] ?? [];
      if (!Array.isArray(value)) fail(`data.${section}`, 'Expected an array');
      if (value.length > MAX_SECTION_ROWS)
        fail(`data.${section}`, `Section exceeds ${MAX_SECTION_ROWS} rows`);
      const rows = value.map((item, index) => {
        const row = object(item, `data.${section}[${index}]`) as AnyRow;
        exactKeys(row, `data.${section}[${index}]`, sectionFields[section]);
        validateBase(row, `data.${section}[${index}]`);
        return row;
      });
      const unique = new Set(rows.map((row) => row.ref));
      if (unique.size !== rows.length)
        fail(`data.${section}`, 'Duplicate ref values are not allowed');
      return [section, rows];
    }),
  ) as Record<ImportSection, AnyRow[]>;
  const total = sections.reduce(
    (sum, section) => sum + data[section].length,
    0,
  );
  const itemTotal = data.transactions.reduce(
    (sum, row) => sum + (Array.isArray(row.items) ? row.items.length : 0),
    0,
  );
  if (!total && root.settings == null)
    fail('data', 'At least one row or settings object is required');
  if (total + itemTotal > MAX_TOTAL_ROWS)
    fail('data', `Import exceeds ${MAX_TOTAL_ROWS} rows`);

  const {
    accountRefs,
    categoryRefs,
    transactionRefs,
    accountByRef,
    categoryByRef,
    transactionByRef,
  } = validateFinanceImportLedger(data);
  const transferRefs = refs(data, 'transfers');
  const goalRefs = refs(data, 'savingsGoals');
  const investmentRefs = refs(data, 'investments');
  const valuationRefs = refs(data, 'investmentValuations');
  const transferByRef = new Map(data.transfers.map((row) => [row.ref, row]));
  const goalByRef = new Map(data.savingsGoals.map((row) => [row.ref, row]));
  data.transfers.forEach((row, index) => {
    const path = `data.transfers[${index}]`;
    requireRef(row.fromAccountRef, `${path}.fromAccountRef`, accountRefs);
    requireRef(row.toAccountRef, `${path}.toAccountRef`, accountRefs);
    if (row.fromAccountRef === row.toAccountRef)
      fail(path, 'Transfer accounts must differ');
    decimal(row.fromAmount, `${path}.fromAmount`);
    decimal(row.toAmount, `${path}.toAmount`);
    instant(row.occurredAt, `${path}.occurredAt`);
    text(row.description, `${path}.description`, { optional: true, max: 240 });
  });
  data.limits.forEach((row, index) => {
    requireRef(
      row.categoryRef,
      `data.limits[${index}].categoryRef`,
      categoryRefs,
    );
    decimal(row.amount, `data.limits[${index}].amount`);
    currency(row.currency, `data.limits[${index}].currency`);
    if (
      typeof row.categoryRef !== 'string' ||
      categoryByRef.get(row.categoryRef)?.type !== 'EXPENSE'
    )
      fail(
        `data.limits[${index}].categoryRef`,
        'Limits require an EXPENSE category',
      );
  });
  data.reminders.forEach((row, index) => {
    const path = `data.reminders[${index}]`;
    text(row.name, `${path}.name`, { max: 120 });
    decimal(row.amount, `${path}.amount`);
    currency(row.currency, `${path}.currency`);
    if (
      !Number.isInteger(row.dayOfMonth) ||
      Number(row.dayOfMonth) < 1 ||
      Number(row.dayOfMonth) > 31
    )
      fail(`${path}.dayOfMonth`, 'Expected an integer from 1 to 31');
    if (
      row.reminderOffsetMinutes != null &&
      (!Number.isInteger(row.reminderOffsetMinutes) ||
        Number(row.reminderOffsetMinutes) < 0 ||
        Number(row.reminderOffsetMinutes) > 43_200)
    )
      fail(
        `${path}.reminderOffsetMinutes`,
        'Expected an integer from 0 to 43200',
      );
    if (row.enabled != null && typeof row.enabled !== 'boolean')
      fail(`${path}.enabled`, 'Expected a boolean');
    instant(row.nextOccurrenceAt, `${path}.nextOccurrenceAt`);
  });
  const settlementRefs = data.debts
    .map((row) => row.settlementTransactionRef)
    .filter((ref): ref is string => typeof ref === 'string');
  if (new Set(settlementRefs).size !== settlementRefs.length)
    fail(
      'data.debts',
      'A settlement transaction can only be linked to one debt',
    );
  data.debts.forEach((row, index) => {
    const path = `data.debts[${index}]`;
    requireRef(row.accountRef, `${path}.accountRef`, accountRefs);
    requireRef(
      row.settlementTransactionRef,
      `${path}.settlementTransactionRef`,
      transactionRefs,
      true,
    );
    oneOf(row.direction, `${path}.direction`, ['I_OWE', 'OWED_TO_ME']);
    if (row.status != null)
      oneOf(row.status, `${path}.status`, ['OPEN', 'SETTLED']);
    text(row.name, `${path}.name`, { max: 120 });
    decimal(row.amount, `${path}.amount`);
    instant(row.dueAt, `${path}.dueAt`);
    timezone(row.scheduleTimezone, `${path}.scheduleTimezone`);
    text(row.note, `${path}.note`, { optional: true, max: 500 });
    instant(row.settledAt, `${path}.settledAt`, true);
    const status = row.status ?? 'OPEN';
    const settlementRef =
      typeof row.settlementTransactionRef === 'string'
        ? row.settlementTransactionRef
        : null;
    if (status === 'SETTLED' && (!settlementRef || !row.settledAt))
      fail(
        path,
        'A settled debt requires settledAt and settlementTransactionRef',
      );
    if (status === 'OPEN' && (settlementRef || row.settledAt))
      fail(path, 'An open debt cannot have settlement fields');
    if (settlementRef) {
      const transaction = transactionByRef.get(settlementRef)!;
      const expectedType = row.direction === 'I_OWE' ? 'EXPENSE' : 'INCOME';
      if (
        transaction.accountRef !== row.accountRef ||
        transaction.type !== expectedType ||
        new Prisma.Decimal(String(transaction.amount)).cmp(
          new Prisma.Decimal(String(row.amount)),
        ) !== 0
      )
        fail(
          `${path}.settlementTransactionRef`,
          'Settlement transaction must match the debt account, direction and amount',
        );
    }
  });
  data.regularPayments.forEach((row, index) => {
    const path = `data.regularPayments[${index}]`;
    requireRef(row.accountRef, `${path}.accountRef`, accountRefs);
    requireRef(row.categoryRef, `${path}.categoryRef`, categoryRefs, true);
    text(row.name, `${path}.name`, { max: 120 });
    decimal(row.amount, `${path}.amount`);
    oneOf(row.recurrence, `${path}.recurrence`, [
      'WEEKLY',
      'MONTHLY',
      'YEARLY',
    ]);
    if (row.status != null)
      oneOf(row.status, `${path}.status`, ['ACTIVE', 'PAUSED', 'CANCELED']);
    instant(row.nextOccurrenceAt, `${path}.nextOccurrenceAt`);
    timezone(row.scheduleTimezone, `${path}.scheduleTimezone`);
    text(row.note, `${path}.note`, { optional: true, max: 500 });
    if (
      typeof row.categoryRef === 'string' &&
      categoryByRef.get(row.categoryRef)?.type !== 'EXPENSE'
    )
      fail(
        `${path}.categoryRef`,
        'Regular payments require an EXPENSE category',
      );
  });
  data.savingsGoals.forEach((row, index) => {
    const path = `data.savingsGoals[${index}]`;
    text(row.name, `${path}.name`, { max: 120 });
    decimal(row.targetAmount, `${path}.targetAmount`);
    if (row.initialAmount != null)
      decimal(row.initialAmount, `${path}.initialAmount`, true);
    currency(row.currency, `${path}.currency`);
    instant(row.targetDate, `${path}.targetDate`, true);
    text(row.note, `${path}.note`, { optional: true, max: 1000 });
    if (row.status != null)
      oneOf(row.status, `${path}.status`, ['ACTIVE', 'COMPLETED', 'ARCHIVED']);
  });
  const linkedTransferRefs = data.savingsMovements
    .map((row) => row.linkedTransferRef)
    .filter((ref): ref is string => typeof ref === 'string');
  if (new Set(linkedTransferRefs).size !== linkedTransferRefs.length)
    fail(
      'data.savingsMovements',
      'A transfer can only be linked to one savings movement',
    );
  data.savingsMovements.forEach((row, index) => {
    const path = `data.savingsMovements[${index}]`;
    requireRef(row.accountRef, `${path}.accountRef`, accountRefs);
    requireRef(row.fromGoalRef, `${path}.fromGoalRef`, goalRefs, true);
    requireRef(row.toGoalRef, `${path}.toGoalRef`, goalRefs, true);
    requireRef(
      row.linkedTransferRef,
      `${path}.linkedTransferRef`,
      transferRefs,
      true,
    );
    oneOf(row.kind, `${path}.kind`, ['ALLOCATE', 'RELEASE', 'REALLOCATE']);
    const from = typeof row.fromGoalRef === 'string' ? row.fromGoalRef : null;
    const to = typeof row.toGoalRef === 'string' ? row.toGoalRef : null;
    if (
      (row.kind === 'ALLOCATE' && (!to || from)) ||
      (row.kind === 'RELEASE' && (!from || to)) ||
      (row.kind === 'REALLOCATE' && (!from || !to || from === to))
    )
      fail(path, 'Savings movement references do not match its kind');
    const accountCurrency =
      typeof row.accountRef === 'string'
        ? accountByRef.get(row.accountRef)?.currency
        : undefined;
    if (
      (from && goalByRef.get(from)?.currency !== accountCurrency) ||
      (to && goalByRef.get(to)?.currency !== accountCurrency)
    )
      fail(path, 'Savings goal and account currencies must match');
    decimal(row.amount, `${path}.amount`);
    instant(row.occurredAt, `${path}.occurredAt`);
    text(row.note, `${path}.note`, { optional: true, max: 1000 });
    if (typeof row.linkedTransferRef === 'string') {
      if (row.kind === 'REALLOCATE')
        fail(
          `${path}.linkedTransferRef`,
          'A reallocation cannot be linked to an account transfer',
        );
      const transfer = transferByRef.get(row.linkedTransferRef)!;
      const movementAmount = new Prisma.Decimal(String(row.amount));
      const valid =
        row.kind === 'ALLOCATE'
          ? transfer.toAccountRef === row.accountRef &&
            accountByRef.get(String(transfer.toAccountRef))?.currency ===
              accountCurrency &&
            new Prisma.Decimal(String(transfer.toAmount)).gte(movementAmount)
          : transfer.fromAccountRef === row.accountRef &&
            accountByRef.get(String(transfer.fromAccountRef))?.currency ===
              accountCurrency &&
            new Prisma.Decimal(String(transfer.fromAmount)).gte(movementAmount);
      if (!valid)
        fail(
          `${path}.linkedTransferRef`,
          'Transfer direction, account, currency or amount does not match this movement',
        );
    }
  });
  const allocatedByGoal = new Map(
    data.savingsGoals.map((row) => [row.ref, new Prisma.Decimal(0)]),
  );
  const orderedMovements = data.savingsMovements
    .map((row, index) => ({ row, index }))
    .sort(
      (left, right) =>
        Date.parse(String(left.row.occurredAt)) -
          Date.parse(String(right.row.occurredAt)) || left.index - right.index,
    );
  for (const { row, index } of orderedMovements) {
    const amount = new Prisma.Decimal(String(row.amount));
    if (typeof row.fromGoalRef === 'string') {
      const ref = row.fromGoalRef;
      const remaining = (
        allocatedByGoal.get(ref) ?? new Prisma.Decimal(0)
      ).minus(amount);
      if (remaining.isNegative())
        fail(
          `data.savingsMovements[${index}].amount`,
          'Savings movements cannot release more than the goal has accumulated at that time',
        );
      allocatedByGoal.set(ref, remaining);
    }
    if (typeof row.toGoalRef === 'string') {
      const ref = row.toGoalRef;
      allocatedByGoal.set(
        ref,
        (allocatedByGoal.get(ref) ?? new Prisma.Decimal(0)).plus(amount),
      );
    }
  }
  const investmentByRef = new Map(
    data.investments.map((row) => [row.ref, row]),
  );
  data.investments.forEach((row, index) => {
    const path = `data.investments[${index}]`;
    text(row.name, `${path}.name`, { max: 120 });
    text(row.description, `${path}.description`, {
      optional: true,
      max: 2000,
    });
    currency(row.currency, `${path}.currency`);
    oneOf(row.type, `${path}.type`, [
      'BUSINESS',
      'REAL_ESTATE',
      'SECURITIES',
      'CRYPTO',
      'DIGITAL_ASSET',
      'PHYSICAL_ASSET',
      'OTHER',
    ]);
    if (row.status != null)
      oneOf(row.status, `${path}.status`, ['ACTIVE', 'CLOSED', 'ARCHIVED']);
    instant(row.startedAt, `${path}.startedAt`);
    instant(row.closedAt, `${path}.closedAt`, true);
    const status = row.status ?? 'ACTIVE';
    if (status === 'CLOSED' && typeof row.closedAt !== 'string')
      fail(`${path}.closedAt`, 'A closed investment must have a closing date');
    if (status === 'ACTIVE' && row.closedAt != null)
      fail(
        `${path}.closedAt`,
        'An active investment cannot have a closing date',
      );
    if (
      typeof row.closedAt === 'string' &&
      Date.parse(row.closedAt) < Date.parse(String(row.startedAt))
    )
      fail(`${path}.closedAt`, 'Investment cannot close before it starts');
  });
  data.investmentCashFlows.forEach((row, index) => {
    const path = `data.investmentCashFlows[${index}]`;
    requireRef(row.investmentRef, `${path}.investmentRef`, investmentRefs);
    requireRef(row.accountRef, `${path}.accountRef`, accountRefs);
    oneOf(row.kind, `${path}.kind`, ['CONTRIBUTION', 'RETURN']);
    decimal(row.amount, `${path}.amount`);
    instant(row.occurredAt, `${path}.occurredAt`);
    text(row.note, `${path}.note`, { optional: true, max: 1000 });
    if (
      Date.parse(String(row.occurredAt)) <
      Date.parse(
        String(investmentByRef.get(String(row.investmentRef))!.startedAt),
      )
    )
      fail(
        `${path}.occurredAt`,
        'Investment cash flow cannot precede the investment',
      );
    const investment = investmentByRef.get(String(row.investmentRef))!;
    if (
      typeof investment.closedAt === 'string' &&
      Date.parse(String(row.occurredAt)) > Date.parse(investment.closedAt)
    )
      fail(
        `${path}.occurredAt`,
        'Investment cash flow cannot follow the investment closing date',
      );
  });
  const correctedRefs = data.investmentValuations
    .map((row) => row.correctsRef)
    .filter((ref): ref is string => typeof ref === 'string');
  if (new Set(correctedRefs).size !== correctedRefs.length)
    fail('data.investmentValuations', 'A valuation can only be corrected once');
  data.investmentValuations.forEach((row, index) => {
    const path = `data.investmentValuations[${index}]`;
    requireRef(row.investmentRef, `${path}.investmentRef`, investmentRefs);
    requireRef(row.correctsRef, `${path}.correctsRef`, valuationRefs, true);
    if (
      typeof row.correctsRef === 'string' &&
      data.investmentValuations.find(
        (candidate) => candidate.ref === row.correctsRef,
      )?.investmentRef !== row.investmentRef
    )
      fail(
        `${path}.correctsRef`,
        'A valuation can only correct the same investment',
      );
    decimal(row.value, `${path}.value`, true);
    instant(row.valuedAt, `${path}.valuedAt`);
    instant(row.createdAt, `${path}.createdAt`, true);
    text(row.note, `${path}.note`, { optional: true, max: 1000 });
    if (
      Date.parse(String(row.valuedAt)) <
      Date.parse(
        String(investmentByRef.get(String(row.investmentRef))!.startedAt),
      )
    )
      fail(
        `${path}.valuedAt`,
        'Investment valuation cannot precede the investment',
      );
    const investment = investmentByRef.get(String(row.investmentRef))!;
    if (
      typeof investment.closedAt === 'string' &&
      Date.parse(String(row.valuedAt)) > Date.parse(investment.closedAt)
    )
      fail(
        `${path}.valuedAt`,
        'Investment valuation cannot follow the investment closing date',
      );
  });
  validateReferenceGraph(
    data.investmentValuations,
    'correctsRef',
    'data.investmentValuations',
    'Valuation correction cycle detected',
  );
  return input as ConsumerFinanceImportDocumentV1;
}

export { financeImportSections } from './finance-import-validation';
