import fs from 'node:fs';
import path from 'node:path';

const migrationSql = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../../../prisma/migrations/20260901120000_telegram_crm_customer_automations/migration.sql',
  ),
  'utf8',
);

describe('CRM customer automation Stage 4 migration safety', () => {
  it('does not materialize historical business facts or customer messaging rows', () => {
    expect(migrationSql).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(migrationSql).not.toMatch(/\bUPDATE\s+"TelegramAdSale"\b/i);
    expect(migrationSql).not.toMatch(/\bUPDATE\s+"TelegramAdvertiser"\b/i);
  });

  it('leaves Contact locale nullable for workspace fallback and workspace locale explicit', () => {
    expect(migrationSql).toContain(
      'ADD COLUMN "automationLocale" VARCHAR(2) NOT NULL DEFAULT \'en\'',
    );
    expect(migrationSql).toMatch(
      /ALTER TABLE "TelegramAdvertiser"\s+ADD COLUMN "automationLocale" VARCHAR\(2\),/,
    );
  });

  it('uses indexed due ordering and preserves workspace-scoped Deal references', () => {
    expect(migrationSql).toContain('("status", "nextAttemptAt", "id")');
    expect(migrationSql).toContain('("status", "leaseExpiresAt", "id")');
    expect(migrationSql).toMatch(
      /CustomerAutomationExecution_saleId_fkey"[\s\S]*FOREIGN KEY \("telegramAdSaleId", "workspaceId"\)[\s\S]*ON DELETE RESTRICT/,
    );
    expect(migrationSql).toMatch(
      /CustomerAutomationExecution_placementId_fkey"[\s\S]*FOREIGN KEY \("placementId", "workspaceId"\)[\s\S]*ON DELETE RESTRICT/,
    );
  });
});
