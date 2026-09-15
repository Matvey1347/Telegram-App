import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Telegram channel short-description storage', () => {
  const schema = readFileSync(
    resolve(__dirname, '../../../../prisma/schema.prisma'),
    'utf8',
  );
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../../../prisma/migrations/20260915143000_separate_channel_short_description/migration.sql',
    ),
    'utf8',
  );

  it('stores presentation copy separately and preserves existing user copy', () => {
    const telegramChannelModel = schema.match(
      /model TelegramChannel \{[\s\S]*?\n\}/,
    )?.[0];
    const transactionModel = schema.match(
      /model Transaction \{[\s\S]*?\n\}/,
    )?.[0];

    expect(telegramChannelModel).toContain('shortDescription');
    expect(transactionModel).not.toContain('shortDescription');
    expect(migration).toContain('ADD COLUMN "shortDescription" TEXT');
    expect(migration).toContain('SET "shortDescription" = "description"');
  });
});
