import { NestFactory } from '@nestjs/core';
import { TelegramPostMediaBackfillService } from '../domains/telegram/telegram-channels/telegram-post-media-backfill.service';
import { TelegramPostMediaMaintenanceModule } from './telegram-post-media-maintenance.module';

function option(name: string) {
  const prefix = `--${name}=`;
  return process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

async function run() {
  const app = await NestFactory.createApplicationContext(
    TelegramPostMediaMaintenanceModule,
    {
      logger: ['error', 'warn'],
    },
  );
  try {
    const rawLimit = option('limit');
    const limit = rawLimit ? Number(rawLimit) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw new Error('--limit must be a positive integer');
    }
    const summary = await app.get(TelegramPostMediaBackfillService).run({
      workspaceId: option('workspace'),
      channelId: option('channel'),
      limit,
    });
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  process.stderr.write(
    `Telegram post media backfill failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
