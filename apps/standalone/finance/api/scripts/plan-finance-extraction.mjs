import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import pg from 'pg';

const { Client } = pg;
const workspaceRoot = resolve(import.meta.dirname, '..', '..', '..', '..', '..');
const sourceProfile = resolve(workspaceRoot, '.env');
const destinationProfile = resolve(workspaceRoot, 'products', 'finance', '.env.local');
const supportingSourceTables = new Set([
  'TelegramBotIntegration',
  'TelegramBotUser',
  'BotBillingProviderConfig',
  'BotBillingEvent',
  'AiUsageEvent',
]);

function valueFromProfile(file, key) {
  const profile = parse(readFileSync(file));
  const value = profile[key];
  if (!value) throw new Error(`${file} must define ${key}.`);
  return value;
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function tables(client, source) {
  const result = await client.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  const names = result.rows.map(({ table_name: name }) => name);
  return source
    ? names.filter((name) => name.startsWith('Finance') || supportingSourceTables.has(name))
    : names.filter((name) => name.startsWith('Finance'));
}

async function describeTables(client, names) {
  const result = [];
  for (const name of names) {
    const [count, columns] = await Promise.all([
      client.query(`SELECT count(*)::text AS count FROM ${quoteIdentifier(name)}`),
      client.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position`,
        [name],
      ),
    ]);
    result.push({
      name,
      rows: Number(count.rows[0].count),
      columns: columns.rows.map(({ column_name: column }) => column),
    });
  }
  return result;
}

async function databaseIdentity(client) {
  const result = await client.query('SELECT current_database() AS name');
  return result.rows[0].name;
}

const sourceUrl = valueFromProfile(sourceProfile, 'DATABASE_URL');
const destinationUrl = valueFromProfile(destinationProfile, 'FINANCE_DATABASE_URL');
if (sourceUrl === destinationUrl) {
  throw new Error('Refusing Finance extraction plan: source and destination URLs are identical.');
}

const source = new Client({ connectionString: sourceUrl, statement_timeout: 15_000 });
const destination = new Client({ connectionString: destinationUrl, statement_timeout: 15_000 });

try {
  await Promise.all([source.connect(), destination.connect()]);
  await Promise.all([source.query('BEGIN READ ONLY'), destination.query('BEGIN READ ONLY')]);

  const [sourceIdentity, destinationIdentity, sourceNames, destinationNames] = await Promise.all([
    databaseIdentity(source),
    databaseIdentity(destination),
    tables(source, true),
    tables(destination, false),
  ]);
  const [sourceTables, destinationTables] = await Promise.all([
    describeTables(source, sourceNames),
    describeTables(destination, destinationNames),
  ]);
  const destinationByName = new Map(destinationTables.map((table) => [table.name, table]));
  const incompatibleTables = sourceTables.flatMap((table) => {
    const target = destinationByName.get(table.name);
    if (!target) return [];
    const missingColumns = table.columns.filter((column) => !target.columns.includes(column));
    return missingColumns.length ? [{ name: table.name, missingColumns }] : [];
  });

  process.stdout.write(`${JSON.stringify({
    mode: 'read-only-dry-run',
    sourceDatabase: sourceIdentity,
    destinationDatabase: destinationIdentity,
    sourceTables,
    destinationTables,
    incompatibleDestinationTables: incompatibleTables,
    writesPerformed: false,
    executionBlockedUntil: [
      'source backup reference is recorded',
      'restored staging rehearsal passes',
      'destination schema can represent every source Finance column and relation',
      'idempotent copy and reconciliation tests pass',
      'explicit production cutover approval is recorded',
    ],
  }, null, 2)}\n`);
} finally {
  await Promise.allSettled([source.query('ROLLBACK'), destination.query('ROLLBACK')]);
  await Promise.allSettled([source.end(), destination.end()]);
}
