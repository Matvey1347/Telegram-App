import fs from 'node:fs';
import path from 'node:path';

const migrationSql = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../prisma/migrations/20261017000000_retire_greeter_runtime/migration.sql',
  ),
  'utf8',
);

describe('Greeter runtime retirement migration', () => {
  it('cancels only active Greeter-linked delivery work without deleting history', () => {
    const deliveryUpdate = migrationSql.match(
      /UPDATE "TelegramBotDelivery" AS "delivery"[\s\S]*?;/,
    )?.[0];
    expect(deliveryUpdate).toBeDefined();
    expect(deliveryUpdate).toContain("'PENDING'::\"TelegramBotDeliveryStatus\"");
    expect(deliveryUpdate).toContain("'PROCESSING'::\"TelegramBotDeliveryStatus\"");
    expect(deliveryUpdate).toContain("'RETRY'::\"TelegramBotDeliveryStatus\"");
    expect(deliveryUpdate).toContain("'CANCELLED'::\"TelegramBotDeliveryStatus\"");
    expect(deliveryUpdate).toContain("'GREETER'::\"TelegramBotApplicationType\"");
    expect(deliveryUpdate).toContain('"GreeterSequenceStepExecution"');
    expect(deliveryUpdate).toContain('"GreeterBroadcastRecipient"');
    expect(deliveryUpdate).toContain('"GreeterJoinRequest"');
    expect(migrationSql).not.toMatch(/^\s*(?:DROP|DELETE)\b/im);
  });

  it('retires integrations and disarms every removed task without deleting audit rows', () => {
    expect(migrationSql).toContain('UPDATE "TelegramBotIntegration"');
    expect(migrationSql).toContain("'NONE'::\"TelegramBotApplicationType\"");
    expect(migrationSql).toContain('UPDATE "ScheduledTaskConfig"');
    expect(migrationSql).toContain("'greeter.expire_pending'");
    expect(migrationSql).toContain("'greeter.broadcasts.dispatch'");
    expect(migrationSql).toContain("'greeter.automations.repair'");
    expect(migrationSql).toContain('"enabled" = FALSE');
  });
});
