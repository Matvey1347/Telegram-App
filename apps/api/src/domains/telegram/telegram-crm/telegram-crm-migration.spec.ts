import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  __dirname,
  '../../../../prisma/migrations/20260831160000_telegram_crm_foundation/migration.sql',
);
const migrationSql = fs.readFileSync(migrationPath, 'utf8');

describe('Telegram CRM foundation migration safety', () => {
  it('creates no customer message, execution, sync-state, or Conversation rows', () => {
    expect(migrationSql).not.toMatch(
      /INSERT INTO "TelegramCrm(?:Conversation|Message|AccountSyncState|CustomerAutomationExecution)"/,
    );
    expect(migrationSql).not.toMatch(
      /INSERT INTO "TelegramAdvertiserAutomationExecution"/,
    );
  });

  it('backfills peers only from stable Telegram user IDs', () => {
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "TelegramCrmPeer_workspaceId_telegramUserId_key"',
    );
    expect(migrationSql).toContain('COUNT(DISTINCT "contactId") = 1');
    expect(migrationSql).not.toMatch(/GROUP BY "workspaceId",\s*"username"/);
  });

  it('keeps CRM sync/send disabled while preserving MTProto publishing', () => {
    expect(migrationSql).toMatch(
      /UPDATE "TelegramUserAccountIntegration"[\s\S]*"crmSyncEnabled" = false,[\s\S]*"crmSendEnabled" = false,[\s\S]*"mtprotoPublishingEnabled" = true/,
    );
  });

  it('does not grant new sensitive CRM permissions through DENYLIST roles', () => {
    expect(migrationSql).toContain("('adSales.crm.viewAny')");
    expect(migrationSql).toContain("('adSales.crm.sendManualMessages')");
    expect(migrationSql).toContain('r."systemKey" IS DISTINCT FROM \'OWNER\'');
    expect(migrationSql).toContain(
      'DO UPDATE SET "effect" = EXCLUDED."effect"',
    );
  });

  it('uses workspace-scoped foreign keys for CRM account and Contact links', () => {
    expect(migrationSql).toContain(
      'FOREIGN KEY ("defaultCrmSenderAccountId", "workspaceId")',
    );
    expect(migrationSql).toContain('FOREIGN KEY ("contactId", "workspaceId")');
  });
});
