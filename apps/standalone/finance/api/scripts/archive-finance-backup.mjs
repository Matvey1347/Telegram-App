import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import pg from 'pg';

const { Client } = pg;
const root = resolve(import.meta.dirname, '..', '..', '..', '..', '..');
const backupDirectory = resolve(root, '.finance-backups');
const requested = process.argv[2];
const backupName = requested ?? readdirSync(backupDirectory)
  .filter((name) => name.endsWith('.json.gz'))
  .sort()
  .at(-1);
if (!backupName) throw new Error('No Finance backup bundle was found.');
const backupPath = requested ? resolve(root, requested) : resolve(backupDirectory, backupName);
const payload = gunzipSync(readFileSync(backupPath)).toString('utf8');
const checksum = createHash('sha256').update(payload).digest('hex');
const bundle = JSON.parse(payload);
if (bundle.version !== 1 || !bundle.data || typeof bundle.data !== 'object') {
  throw new Error('Invalid Finance backup bundle.');
}
const destinationUrl = parse(readFileSync(resolve(root, 'products', 'finance', '.env.local'))).FINANCE_DATABASE_URL;
if (!destinationUrl) throw new Error('Finance profile must define FINANCE_DATABASE_URL.');
const client = new Client({ connectionString: destinationUrl, statement_timeout: 30_000 });

try {
  await client.connect();
  await client.query('BEGIN');
  let copied = 0;
  for (const [sourceTable, rows] of Object.entries(bundle.data)) {
    if (!Array.isArray(rows)) throw new Error(`Invalid rows for ${sourceTable}.`);
    for (const row of rows) {
      const sourceId = row?.id;
      if (typeof sourceId !== 'string' || !sourceId) {
        throw new Error(`${sourceTable} has no stable string id.`);
      }
      await client.query(
        `INSERT INTO "FinanceLegacyArchive" ("sourceTable", "sourceId", "payload", "backupChecksum")
         VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT ("sourceTable", "sourceId") DO UPDATE
           SET "payload" = EXCLUDED."payload", "backupChecksum" = EXCLUDED."backupChecksum", "copiedAt" = CURRENT_TIMESTAMP`,
        [sourceTable, sourceId, JSON.stringify(row), checksum],
      );
      copied += 1;
    }
  }
  const verification = await client.query(
    'SELECT "sourceTable", count(*)::int AS count FROM "FinanceLegacyArchive" WHERE "backupChecksum" = $1 GROUP BY "sourceTable" ORDER BY "sourceTable"',
    [checksum],
  );
  await client.query('COMMIT');
  process.stdout.write(JSON.stringify({
    archive: 'FinanceLegacyArchive', backup: backupPath.replace(root, '.'), checksum, copied,
    verifiedCounts: verification.rows, destinationWritesPerformed: true,
  }, null, 2) + '\n');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
