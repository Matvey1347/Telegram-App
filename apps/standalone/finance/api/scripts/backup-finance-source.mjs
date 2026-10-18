import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import pg from 'pg';

const { Client } = pg;
const root = resolve(import.meta.dirname, '..', '..', '..');
const sourceProfile = resolve(root, '.env');
const backupDirectory = resolve(root, '.finance-backups');
const sourceUrl = parse(readFileSync(sourceProfile)).DATABASE_URL;
if (!sourceUrl) throw new Error('Root .env must define DATABASE_URL.');

const scopedTables = new Set([
  'TelegramBotIntegration',
  'TelegramBotUser',
  'BotBillingProviderConfig',
  'BotBillingEvent',
  'BotSubscriptionPlan',
  'BotSubscription',
  'BotCoupon',
  'BotCouponRedemption',
  'BotProviderCustomer',
]);

function quote(name) {
  return `"${name.replaceAll('"', '""')}"`;
}

const client = new Client({ connectionString: sourceUrl, statement_timeout: 30_000 });
try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const integrations = await client.query(
    'SELECT * FROM "TelegramBotIntegration" WHERE "applicationType" = $1 ORDER BY "id"',
    ['FINANCE'],
  );
  const botIds = integrations.rows.map((row) => row.id);
  const tables = await client.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  const selectedTables = tables.rows
    .map(({ table_name: name }) => name)
    .filter((name) => name.startsWith('Finance') || scopedTables.has(name));
  const data = {};

  for (const table of selectedTables) {
    if (table === 'TelegramBotIntegration') {
      data[table] = integrations.rows;
      continue;
    }
    const columns = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    const hasBotIntegration = columns.rows.some(({ column_name: name }) => name === 'botIntegrationId');
    const query = hasBotIntegration
      ? `SELECT row_to_json(item) AS row FROM (SELECT * FROM ${quote(table)} WHERE "botIntegrationId" = ANY($1::text[])) item`
      : `SELECT row_to_json(item) AS row FROM (SELECT * FROM ${quote(table)}) item`;
    const rows = await client.query(query, hasBotIntegration ? [botIds] : []);
    data[table] = rows.rows.map(({ row }) => row);
  }

  if (!existsSync(backupDirectory)) mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  const createdAt = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const payload = JSON.stringify({ version: 1, createdAt: new Date().toISOString(), financeBotIds: botIds, data });
  const digest = createHash('sha256').update(payload).digest('hex');
  const backupPath = resolve(backupDirectory, `finance-source-${createdAt}.json.gz`);
  const checksumPath = `${backupPath}.sha256`;
  writeFileSync(backupPath, gzipSync(payload), { mode: 0o600 });
  writeFileSync(checksumPath, `${digest}  ${backupPath.split('/').at(-1)}\n`, { mode: 0o600 });
  chmodSync(backupPath, 0o600);
  chmodSync(checksumPath, 0o600);
  process.stdout.write(JSON.stringify({
    backupPath: backupPath.replace(root, '.'),
    checksumPath: checksumPath.replace(root, '.'),
    financeBots: botIds.length,
    tableCounts: Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.length])),
    sourceWritesPerformed: false,
  }, null, 2) + '\n');
} finally {
  await Promise.allSettled([client.query('ROLLBACK'), client.end()]);
}
