import fs from 'node:fs';
import path from 'node:path';

const migrationSql = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../../../prisma/migrations/20260903090000_remove_telegram_crm_customer_automations/migration.sql',
  ),
  'utf8',
);
const schema = fs.readFileSync(
  path.resolve(__dirname, '../../../../prisma/schema.prisma'),
  'utf8',
);

describe('Telegram CRM customer automation removal', () => {
  it('removes every persisted source of future customer-message delivery', () => {
    expect(migrationSql).toContain('DELETE FROM "ScheduledTaskConfig"');
    expect(migrationSql).toContain("'telegram_crm.customer_automations'");
    expect(migrationSql).toContain(
      'DROP TABLE IF EXISTS "TelegramCrmCustomerAutomationExecution"',
    );
    expect(migrationSql).toContain(
      'DROP COLUMN IF EXISTS "automatedMessagesEnabled"',
    );
    expect(migrationSql).toContain(
      'WHERE "origin" = \'AUTOMATION\'::"TelegramCrmMessageOrigin"',
    );
  });

  it('does not retain the runtime queue or opt-in fields in the Prisma contract', () => {
    expect(schema).not.toContain(
      'model TelegramCrmCustomerAutomationExecution',
    );
    expect(schema).not.toContain('automatedMessagesEnabled');
    expect(schema).not.toContain('customerTelegramAutomationsEnabled');
    expect(schema).not.toContain('customerAutomationEligibleAt');
  });
});
