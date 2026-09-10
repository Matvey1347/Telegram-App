import type { AnyRow, ImportSection } from './finance-import-validation';
import {
  currency,
  decimal,
  exactKeys,
  fail,
  instant,
  object,
  oneOf,
  refs,
  requireRef,
  signedDecimal,
  text,
  validateReferenceGraph,
} from './finance-import-validation';

type ImportData = Record<ImportSection, AnyRow[]>;

export function validateFinanceImportLedger(data: ImportData) {
  const accountRefs = refs(data, 'accounts');
  const categoryRefs = refs(data, 'categories');
  const transactionRefs = refs(data, 'transactions');
  const accountByRef = new Map(data.accounts.map((row) => [row.ref, row]));
  const categoryByRef = new Map(data.categories.map((row) => [row.ref, row]));
  const transactionByRef = new Map(
    data.transactions.map((row) => [row.ref, row]),
  );

  data.accounts.forEach((row, index) => {
    const path = `data.accounts[${index}]`;
    text(row.name, `${path}.name`, { max: 80 });
    text(row.emoji, `${path}.emoji`, { optional: true, max: 2048 });
    oneOf(row.type, `${path}.type`, ['CASH', 'CARD', 'SAVINGS', 'OTHER']);
    currency(row.currency, `${path}.currency`);
    if (row.openingBalance != null)
      signedDecimal(row.openingBalance, `${path}.openingBalance`);
    instant(row.archivedAt, `${path}.archivedAt`, true);
  });
  const categoryKeys = data.categories
    .filter((row) => typeof row.key === 'string')
    .map(
      (row) =>
        `${typeof row.type === 'string' ? row.type : ''}:${typeof row.key === 'string' ? row.key : ''}`,
    );
  if (new Set(categoryKeys).size !== categoryKeys.length)
    fail('data.categories', 'Category key must be unique within its type');
  data.categories.forEach((row, index) => {
    const path = `data.categories[${index}]`;
    text(row.name, `${path}.name`, { max: 80 });
    oneOf(row.type, `${path}.type`, ['INCOME', 'EXPENSE']);
    text(row.emoji, `${path}.emoji`, { optional: true, max: 2048 });
    text(row.key, `${path}.key`, { optional: true, max: 120 });
    requireRef(row.parentRef, `${path}.parentRef`, categoryRefs, true);
    if (
      typeof row.parentRef === 'string' &&
      categoryByRef.get(row.parentRef)?.type !== row.type
    )
      fail(`${path}.parentRef`, 'Parent and child category types must match');
    instant(row.archivedAt, `${path}.archivedAt`, true);
  });
  validateReferenceGraph(
    data.categories,
    'parentRef',
    'data.categories',
    'Category cycle detected',
  );

  data.transactions.forEach((row, index) => {
    const path = `data.transactions[${index}]`;
    requireRef(row.accountRef, `${path}.accountRef`, accountRefs);
    requireRef(row.categoryRef, `${path}.categoryRef`, categoryRefs, true);
    oneOf(row.type, `${path}.type`, ['INCOME', 'EXPENSE']);
    if (
      typeof row.categoryRef === 'string' &&
      categoryByRef.get(row.categoryRef)?.type !== row.type
    )
      fail(`${path}.categoryRef`, 'Transaction and category types must match');
    decimal(row.amount, `${path}.amount`);
    instant(row.occurredAt, `${path}.occurredAt`);
    text(row.description, `${path}.description`, { optional: true, max: 240 });
    text(row.merchantDisplay, `${path}.merchantDisplay`, {
      optional: true,
      max: 240,
    });
    if (row.items != null && !Array.isArray(row.items))
      fail(`${path}.items`, 'Expected an array');
    if (Array.isArray(row.items) && row.items.length > 100)
      fail(`${path}.items`, 'A transaction can contain at most 100 items');
    (row.items as unknown[] | undefined)?.forEach((value, itemIndex) => {
      const item = object(value, `${path}.items[${itemIndex}]`);
      const itemPath = `${path}.items[${itemIndex}]`;
      exactKeys(item, itemPath, [
        'displayName',
        'quantity',
        'unitPrice',
        'totalAmount',
        'categoryRef',
        'metadata',
      ]);
      text(item.displayName, `${itemPath}.displayName`, { max: 240 });
      if (item.quantity != null) decimal(item.quantity, `${itemPath}.quantity`);
      if (item.unitPrice != null)
        decimal(item.unitPrice, `${itemPath}.unitPrice`, true);
      decimal(item.totalAmount, `${itemPath}.totalAmount`);
      requireRef(
        item.categoryRef,
        `${itemPath}.categoryRef`,
        categoryRefs,
        true,
      );
      if (
        typeof item.categoryRef === 'string' &&
        categoryByRef.get(item.categoryRef)?.type !== row.type
      )
        fail(
          `${itemPath}.categoryRef`,
          'Item and transaction category types must match',
        );
      if (item.metadata != null) object(item.metadata, `${itemPath}.metadata`);
    });
  });

  return {
    accountRefs,
    categoryRefs,
    transactionRefs,
    accountByRef,
    categoryByRef,
    transactionByRef,
  };
}
