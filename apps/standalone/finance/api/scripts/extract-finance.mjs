import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import pg from 'pg';

const { Client } = pg;
const root = resolve(import.meta.dirname, '..', '..', '..');
const sourceUrl = parse(readFileSync(resolve(root, '.env'))).DATABASE_URL;
const destinationUrl = parse(readFileSync(resolve(root, 'products/finance/.env.local'))).FINANCE_DATABASE_URL;
if (!sourceUrl || !destinationUrl || sourceUrl === destinationUrl) throw new Error('Source and dedicated Finance database URLs must be distinct.');

const execute = process.argv.includes('--execute');
const support = new Set(['TelegramBotIntegration', 'TelegramBotUser', 'BotBillingProviderConfig', 'BotBillingEvent', 'BotSubscriptionPlan', 'BotSubscription', 'BotCoupon', 'BotCouponRedemption', 'BotProviderCustomer', 'AiUsageEvent']);
const quote = (name) => `"${name.replaceAll('"', '""')}"`;

async function tableNames(client) {
  const { rows } = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name");
  return rows.map((row) => row.table_name);
}

async function primaryKeys(client, table) {
  const { rows } = await client.query(`SELECT a.attname AS name FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=ANY(i.indkey) WHERE n.nspname='public' AND c.relname=$1 AND i.indisprimary ORDER BY array_position(i.indkey,a.attnum)`, [table]);
  return rows.map((row) => row.name);
}

async function foreignKeys(client) {
  const { rows } = await client.query(`SELECT tc.table_name AS source_table,kcu.column_name AS source_column,ccu.table_name AS target_table,ccu.column_name AS target_column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'`);
  return rows.map((row) => ({ sourceTable: row.source_table, sourceColumn: row.source_column, targetTable: row.target_table, targetColumn: row.target_column }));
}

async function collect(source) {
  const names = await tableNames(source);
  const selected = names.filter((name) => name.startsWith('Finance') || support.has(name));
  const financeBots = (await source.query('SELECT "id" FROM "TelegramBotIntegration" WHERE "applicationType"=$1', ['FINANCE'])).rows.map((row) => row.id);
  const records = new Map();
  for (const table of selected) {
    if (table.startsWith('Finance')) records.set(table, (await source.query(`SELECT * FROM ${quote(table)}`)).rows);
    else if (table === 'TelegramBotIntegration') records.set(table, (await source.query(`SELECT * FROM ${quote(table)} WHERE "id"=ANY($1::text[])`, [financeBots])).rows);
    else {
      const hasBot = (await source.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='botIntegrationId'", [table])).rowCount;
      records.set(table, hasBot ? (await source.query(`SELECT * FROM ${quote(table)} WHERE "botIntegrationId"=ANY($1::text[])`, [financeBots])).rows : []);
    }
  }
  const [fks, pkEntries] = await Promise.all([foreignKeys(source), Promise.all(names.map(async (name) => [name, await primaryKeys(source, name)]))]);
  const pks = new Map(pkEntries);
  const seen = new Map();
  const queue = [];
  const add = (table, row) => {
    const keys = pks.get(table) ?? []; if (!keys.length) return false;
    const key = JSON.stringify(keys.map((column) => row[column]));
    const set = seen.get(table) ?? new Set(); seen.set(table, set);
    if (set.has(key)) return false;
    set.add(key); const rows = records.get(table) ?? []; rows.push(row); records.set(table, rows); queue.push({ table, row }); return true;
  };
  for (const [table, rows] of records) { records.set(table, []); for (const row of rows) add(table, row); }
  while (queue.length) {
    const { table, row } = queue.shift();
    for (const fk of fks.filter((item) => item.sourceTable === table && row[item.sourceColumn] != null)) {
      // Nearly every Finance relation targets an `id` primary key. Avoid a
      // round-trip for every transaction/category when that parent is known.
      const targetKeys = pks.get(fk.targetTable) ?? [];
      const knownParent = targetKeys.length === 1 && targetKeys[0] === fk.targetColumn
        ? seen.get(fk.targetTable)?.has(JSON.stringify([row[fk.sourceColumn]]))
        : false;
      if (knownParent) continue;
      const parent = await source.query(`SELECT * FROM ${quote(fk.targetTable)} WHERE ${quote(fk.targetColumn)}=$1`, [row[fk.sourceColumn]]);
      for (const candidate of parent.rows) add(fk.targetTable, candidate);
    }
  }
  return { records, fks, financeBots };
}

function order(records, fks) {
  const pending = new Map([...records.keys()].map((table) => [table, new Set(fks.filter((fk) => fk.sourceTable === table && fk.targetTable !== table && records.has(fk.targetTable)).map((fk) => fk.targetTable))]));
  const result = [];
  while (pending.size) {
    const ready = [...pending].filter(([, dependencies]) => [...dependencies].every((item) => !pending.has(item))).map(([table]) => table).sort();
    if (!ready.length) throw new Error(`Foreign-key cycle in Finance migration: ${[...pending.keys()].join(', ')}`);
    for (const table of ready) { pending.delete(table); result.push(table); }
  }
  return result;
}

async function copy(destination, records, fks) {
  const destinationTables = new Set(await tableNames(destination));
  const copied = {};
  for (const table of order(records, fks)) {
    const rows = records.get(table) ?? []; copied[table] = rows.length;
    if (!rows.length) continue;
    if (!destinationTables.has(table)) throw new Error(`Destination schema is missing ${table}. Apply the complete Finance schema first.`);
    const columns = Object.keys(rows[0]);
    const targetColumns = new Set((await destination.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table])).rows.map((row) => row.column_name));
    const missing = columns.filter((column) => !targetColumns.has(column));
    if (missing.length) throw new Error(`Destination ${table} is incompatible: ${missing.join(', ')}`);
    const sql = `INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT DO NOTHING`;
    for (const row of rows) await destination.query(sql, columns.map((column) => row[column]));
  }
  return copied;
}

const source = new Client({ connectionString: sourceUrl, statement_timeout: 30_000 });
const destination = new Client({ connectionString: destinationUrl, statement_timeout: 30_000 });
try {
  await Promise.all([source.connect(), destination.connect()]);
  const { records, fks, financeBots } = await collect(source);
  const plannedCounts = Object.fromEntries([...records].map(([table, rows]) => [table, rows.length]));
  if (!execute) process.stdout.write(`${JSON.stringify({ mode: 'dry-run', financeBots, plannedCounts, writesPerformed: false }, null, 2)}\n`);
  else {
    await destination.query('BEGIN'); const copiedCounts = await copy(destination, records, fks); await destination.query('COMMIT');
    process.stdout.write(`${JSON.stringify({ mode: 'execute', financeBots, copiedCounts, sourceWritesPerformed: false, destinationWritesPerformed: true }, null, 2)}\n`);
  }
} catch (error) { await destination.query('ROLLBACK').catch(() => undefined); throw error; }
finally { await Promise.allSettled([source.end(), destination.end()]); }
