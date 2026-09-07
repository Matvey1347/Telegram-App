import fs from 'node:fs';
import path from 'node:path';

const migrationSql = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../../../prisma/migrations/20260906190000_add_crm_reply_attention_compacts/migration.sql',
  ),
  'utf8',
);

describe('Telegram CRM reply-attention compact migration', () => {
  it('adds persisted Conversation counters and the Contact mute timestamp', () => {
    expect(migrationSql).toContain('"replyAlertMutedAt" TIMESTAMP(3)');
    expect(migrationSql).toContain(
      '"inboundMessageCount" INTEGER NOT NULL DEFAULT 0',
    );
    expect(migrationSql).toContain(
      '"outboundMessageCount" INTEGER NOT NULL DEFAULT 0',
    );
  });

  it('backfills both counters with one grouped Message scan', () => {
    expect(migrationSql).toContain('FROM "TelegramCrmMessage"');
    expect(migrationSql).toContain('GROUP BY "conversationId"');
    expect(migrationSql).toContain(
      'COUNT(*) FILTER (WHERE "direction" = \'INBOUND\')',
    );
    expect(migrationSql).toContain(
      'COUNT(*) FILTER (WHERE "direction" = \'OUTBOUND\')',
    );
    expect(
      migrationSql.match(/UPDATE "TelegramCrmConversation"/g),
    ).toHaveLength(1);
  });

  it('does not create runtime work or Message and Conversation rows', () => {
    expect(migrationSql).not.toMatch(/CREATE\s+(?:TRIGGER|FUNCTION)/i);
    expect(migrationSql).not.toMatch(
      /INSERT\s+INTO\s+"TelegramCrm(?:Conversation|Message)"/i,
    );
  });
});
