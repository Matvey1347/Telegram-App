import fs from 'node:fs';
import path from 'node:path';

const migrationSql = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../../../prisma/migrations/20260831200000_telegram_crm_runtime_sync/migration.sql',
  ),
  'utf8',
);

describe('Telegram CRM Stage 2 migration safety', () => {
  it('adds the bounded runtime and read-model contract', () => {
    expect(migrationSql).toContain("ADD VALUE 'IGNORED'");
    expect(migrationSql).toContain('"initialImportCursor" TEXT');
    expect(migrationSql).toContain('"telegramAccessHash" TEXT');
    expect(migrationSql).toContain('"telegramMessageIdNumeric" INTEGER');
    expect(migrationSql).toContain(
      '"TelegramCrmMessage_conversation_clientIdempotency_key"',
    );
    expect(migrationSql).toContain(
      '"TelegramCrmMessage_conversation_direction_numeric_idx"',
    );
    expect(migrationSql).toContain(
      '"TelegramAdvertiserAutomationExecution_contact_created_idx"',
    );
  });

  it('does not create domain rows or enable any automation/runtime switch', () => {
    expect(migrationSql).not.toMatch(
      /INSERT\s+INTO\s+"(?:TelegramAdvertiser|TelegramCrmPeer|TelegramCrmConversation|TelegramCrmMessage|TelegramCrmAccountSyncState|TelegramAdvertiserAutomationExecution|TelegramCrmCustomerAutomationExecution)"/i,
    );
    expect(migrationSql).not.toMatch(
      /UPDATE\s+"(?:TelegramAdvertiser|TelegramUserAccountIntegration|TelegramAdCrmWorkspaceSettings)"/i,
    );
  });
});
