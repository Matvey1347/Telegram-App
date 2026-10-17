import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';
import type { Prisma } from '@prisma/client';
import type {
  ConsumerFinanceImportDocumentV1,
  ConsumerFinanceImportResult,
  ConsumerFinanceImportSection,
} from '@telegram-system/shared';

const IMPORT_SECTIONS = [
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
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export const FINANCE_ROLLBACK_SNAPSHOT_LIMIT = 5;
export const FINANCE_EXPORT_HISTORY_LIMIT = 100;

export function financeDocumentCounts(
  document: ConsumerFinanceImportDocumentV1,
): ConsumerFinanceImportResult['counts'] {
  const counts: ConsumerFinanceImportResult['counts'] = {};
  for (const section of IMPORT_SECTIONS) {
    const count = document.data[section]?.length ?? 0;
    if (count) counts[section] = count;
  }
  return counts;
}

export function financeDocumentRecordCount(
  counts: ConsumerFinanceImportResult['counts'],
) {
  return Object.values(counts).reduce(
    (total, count) => total + (count ?? 0),
    0,
  );
}

export async function encodeFinanceRollbackSnapshot(
  document: ConsumerFinanceImportDocumentV1,
): Promise<Uint8Array<ArrayBuffer>> {
  return Uint8Array.from(
    await gzipAsync(Buffer.from(JSON.stringify(document), 'utf8')),
  );
}

export async function decodeFinanceRollbackSnapshot(snapshot: Uint8Array) {
  return JSON.parse((await gunzipAsync(snapshot)).toString('utf8')) as unknown;
}

export async function pruneFinanceRollbackSnapshots(
  tx: Prisma.TransactionClient,
  profileId: string,
) {
  const stale = await tx.financeDataImportReceipt.findMany({
    where: { profileId, rollbackSnapshot: { not: null } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: FINANCE_ROLLBACK_SNAPSHOT_LIMIT,
    select: { id: true },
  });
  if (!stale.length) return;
  await tx.financeDataImportReceipt.updateMany({
    where: { profileId, id: { in: stale.map(({ id }) => id) } },
    data: { rollbackSnapshot: null },
  });
}

export async function pruneFinanceExportHistory(
  tx: Prisma.TransactionClient,
  profileId: string,
) {
  const stale = await tx.financeDataExportReceipt.findMany({
    where: { profileId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: FINANCE_EXPORT_HISTORY_LIMIT,
    select: { id: true },
  });
  if (!stale.length) return;
  await tx.financeDataExportReceipt.deleteMany({
    where: { profileId, id: { in: stale.map(({ id }) => id) } },
  });
}
