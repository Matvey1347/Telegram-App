import fs from 'node:fs';
import path from 'node:path';

const migrationSql = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../prisma/migrations/20261017010000_retire_simple_finance_runtime/migration.sql',
  ),
  'utf8',
);

describe('Simple Finance runtime retirement migration', () => {
  it('retires only legacy Simple Finance integrations without deleting retained data', () => {
    expect(migrationSql).toContain('UPDATE "TelegramBotIntegration"');
    expect(migrationSql).toContain("'SIMPLE_FINANCE'::\"TelegramBotApplicationType\"");
    expect(migrationSql).toContain("'NONE'::\"TelegramBotApplicationType\"");
    expect(migrationSql).not.toMatch(/^\s*(?:DROP|DELETE)\b/im);
    expect(migrationSql).not.toContain('"SimpleFinanceProfile"');
    expect(migrationSql).not.toContain('"SimpleFinanceAccount"');
    expect(migrationSql).not.toContain('"SimpleFinanceCategory"');
    expect(migrationSql).not.toContain('"SimpleFinanceEntry"');
  });
});
