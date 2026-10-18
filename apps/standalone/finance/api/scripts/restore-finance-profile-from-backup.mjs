import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import pg from 'pg';

const { Client } = pg;
const root = resolve(import.meta.dirname, '..', '..', '..');
const backupName = process.argv.find((value) => value.startsWith('--backup='))?.slice(9);
const username = process.argv.find((value) => value.startsWith('--username='))?.slice(11)?.replace(/^@/, '').toLowerCase();
const execute = process.argv.includes('--execute');
if (!backupName || !username) {
  throw new Error('Usage: --backup=.finance-backups/<file>.json.gz --username=<telegram username> [--execute]');
}

const backupPath = resolve(root, backupName);
const raw = gunzipSync(readFileSync(backupPath));
const checksum = createHash('sha256').update(raw).digest('hex');
const expectedChecksum = readFileSync(`${backupPath}.sha256`, 'utf8').trim().split(/\s+/u)[0];
if (checksum !== expectedChecksum) throw new Error('Backup checksum verification failed.');
const backup = JSON.parse(raw);
if (backup.version !== 1 || !backup.data) throw new Error('Unsupported Finance backup format.');
const rows = (table) => backup.data[table] ?? [];
const archivedUser = rows('TelegramBotUser').filter((row) => String(row.username ?? '').toLowerCase() === username);
if (archivedUser.length !== 1) throw new Error(`Backup must contain exactly one @${username} Telegram user.`);
const archivedProfile = rows('FinanceProfile').filter((row) => row.telegramBotUserId === archivedUser[0].id);
if (archivedProfile.length !== 1) throw new Error(`Backup must contain exactly one Finance profile for @${username}.`);

const profileTables = [
  'FinanceAccount', 'FinanceCategory', 'FinanceCustomIcon', 'FinanceMerchantMapping',
  'FinanceSpendingLimit', 'FinanceTransaction', 'FinanceTransactionItem', 'FinanceTransfer',
  'FinanceDebt', 'FinanceRecurringPayment', 'FinanceRecurringPaymentOccurrence',
  'FinanceRecurringPaymentRevision', 'FinanceReminder', 'FinanceGoal', 'FinanceSavingsMovement',
  'FinanceInvestment', 'FinanceInvestmentCashFlow', 'FinanceInvestmentValuation',
  'FinanceDataImportReceipt', 'FinanceDataExportReceipt', 'FinanceAssistantProfile', 'FinanceAiUsage',
];
const jsonColumns = new Map([
  ['FinanceDataImportReceipt', new Set(['counts', 'warnings', 'rollbackSnapshot'])],
]);
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const profileId = archivedProfile[0].id;
const scoped = Object.fromEntries(profileTables.map((table) => [table, rows(table).filter((row) => row.profileId === profileId)]));
const recurringIds = new Set(scoped.FinanceRecurringPayment.map((row) => row.id));
scoped.FinanceRecurringPaymentRevision = rows('FinanceRecurringPaymentRevision').filter((row) => recurringIds.has(row.recurringPaymentId));
const transactionIds = new Set(scoped.FinanceTransaction.map((row) => row.id));
scoped.FinanceTransactionItem = rows('FinanceTransactionItem').filter((row) => transactionIds.has(row.transactionId));

function profileRecord(row, current) {
  return {
    ...row,
    id: current.profileId,
    botIntegrationId: current.botIntegrationId,
    telegramBotUserId: current.telegramBotUserId,
  };
}

function remapProfile(record, current) {
  const next = { ...record };
  if ('profileId' in next) next.profileId = current.profileId;
  if ('botIntegrationId' in next) next.botIntegrationId = current.botIntegrationId;
  if ('telegramBotUserId' in next) next.telegramBotUserId = current.telegramBotUserId;
  if ('workspaceId' in next) next.workspaceId = current.workspaceId;
  return next;
}

async function insertRows(client, table, records) {
  if (!records.length) return;
  const columns = Object.keys(records[0]);
  if (!columns.length) return;
  const values = records.flatMap((row) => columns.map((column) => {
    const value = row[column];
    return jsonColumns.get(table)?.has(column) && value != null
      ? JSON.stringify(value)
      : value;
  }));
  await client.query(
    `INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')}) VALUES ${records.map((_, rowIndex) => `(${columns.map((__, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(', ')})`).join(', ')}`,
    values,
  );
}

const connectionString = parse(readFileSync(resolve(root, '.env'))).DATABASE_URL;
if (!connectionString) throw new Error('Root .env must define DATABASE_URL.');
const client = new Client({ connectionString, statement_timeout: 30_000 });
try {
  await client.connect();
  await client.query(execute ? 'BEGIN' : 'BEGIN READ ONLY');
  const target = await client.query(
    `SELECT u.id AS "telegramBotUserId", u."botIntegrationId", b."workspaceId", fp.id AS "profileId",
       (SELECT count(*)::int FROM "FinanceTransaction" WHERE "profileId" = fp.id) AS "transactionCount"
       FROM "TelegramBotUser" u
       JOIN "FinanceProfile" fp ON fp."telegramBotUserId" = u.id
       JOIN "TelegramBotIntegration" b ON b.id = u."botIntegrationId"
      WHERE lower(coalesce(u.username, '')) = $1`,
    [username],
  );
  if (target.rows.length !== 1) throw new Error(`Current database must contain exactly one Finance profile for @${username}.`);
  const current = target.rows[0];
  if (current.transactionCount !== 0) throw new Error('Refusing to overwrite a non-empty current Finance profile.');
  const archivePlan = rows('BotSubscriptionPlan').find((plan) => plan.id === rows('BotSubscription').find((subscription) => subscription.telegramBotUserId === archivedUser[0].id)?.planId);
  const plan = archivePlan ? { code: archivePlan.code, name: archivePlan.name, description: archivePlan.description, freeCapabilities: archivePlan.freeCapabilities, paidCapabilities: archivePlan.paidCapabilities, isActive: archivePlan.isActive } : null;
  const summary = Object.fromEntries(Object.entries(scoped).map(([table, values]) => [table, values.length]));
  if (!execute) {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', backup: backupName, checksum, username, targetProfile: true, restoreCounts: summary, restoreUltimateGift: plan?.code === 'ULTIMATE', writesPerformed: false }, null, 2)}\n`);
  } else {
    // Removing the empty target profile cascades only its generated defaults.
    await client.query('DELETE FROM "FinanceProfile" WHERE id = $1', [current.profileId]);
    await insertRows(client, 'FinanceProfile', [profileRecord(archivedProfile[0], current)]);
    // Parents precede dependent ledger rows. Categories are patched after
    // insertion to preserve their optional self-referential hierarchy.
    for (const table of ['FinanceAccount', 'FinanceCustomIcon']) {
      await insertRows(client, table, scoped[table].map((record) => remapProfile(record, current)));
    }
    await insertRows(client, 'FinanceCategory', scoped.FinanceCategory.map((record) => remapProfile({ ...record, parentId: null }, current)));
    for (const record of scoped.FinanceCategory.filter((record) => record.parentId)) {
      await client.query('UPDATE "FinanceCategory" SET "parentId" = $1 WHERE id = $2', [record.parentId, record.id]);
    }
    for (const table of [
      'FinanceMerchantMapping', 'FinanceSpendingLimit', 'FinanceTransaction',
      'FinanceTransfer', 'FinanceDebt', 'FinanceRecurringPayment',
      'FinanceRecurringPaymentOccurrence', 'FinanceReminder', 'FinanceGoal',
      'FinanceSavingsMovement', 'FinanceInvestment', 'FinanceInvestmentCashFlow',
      'FinanceInvestmentValuation', 'FinanceDataImportReceipt',
      'FinanceDataExportReceipt', 'FinanceAssistantProfile', 'FinanceAiUsage',
      'FinanceTransactionItem', 'FinanceRecurringPaymentRevision',
    ]) {
      await insertRows(client, table, scoped[table].map((record) => remapProfile(record, current)));
    }
    if (plan?.code === 'ULTIMATE') {
      const existingPlan = await client.query('SELECT id FROM "BotSubscriptionPlan" WHERE "botIntegrationId" = $1 AND code = $2', [current.botIntegrationId, plan.code]);
      const planId = existingPlan.rows[0]?.id ?? `recovered-${checksum.slice(0, 18)}`;
      if (!existingPlan.rows[0]) await insertRows(client, 'BotSubscriptionPlan', [{ id: planId, workspaceId: current.workspaceId, botIntegrationId: current.botIntegrationId, ...plan, createdAt: new Date(), updatedAt: new Date() }]);
      const subscriptionId = `recovered-${checksum.slice(0, 18)}-ultimate`;
      await insertRows(client, 'BotSubscription', [{ id: subscriptionId, workspaceId: current.workspaceId, botIntegrationId: current.botIntegrationId, telegramBotUserId: current.telegramBotUserId, planId, source: 'GIFT', status: 'ACTIVE', currentPeriodStart: new Date(), currentPeriodEnd: null, cancelAtPeriodEnd: false, createdAt: new Date(), updatedAt: new Date() }]);
      await insertRows(client, 'BotSubscriptionGrant', [{ id: `recovered-${checksum.slice(0, 18)}-grant`, subscriptionId, source: 'GIFT', reason: `Recovered from verified Finance backup ${checksum}`, idempotencyKey: `finance-recovery:${checksum}:${current.telegramBotUserId}`, expiresAt: null, createdAt: new Date(), updatedAt: new Date() }]);
    }
    await client.query('COMMIT');
    process.stdout.write(`${JSON.stringify({ mode: 'execute', backup: backupName, checksum, username, restoreCounts: summary, restoredUltimateGift: plan?.code === 'ULTIMATE', writesPerformed: true }, null, 2)}\n`);
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
