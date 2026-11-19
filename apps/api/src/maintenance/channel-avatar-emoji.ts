import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import { TelegramSystemBotConfigService } from '../domains/telegram/telegram-system-bot/telegram-system-bot-config.service';
import {
  AvatarEmojiApiError,
  ChannelAvatarEmojiApi,
} from '@api/telegram/shared/emoji/channel-avatar-emoji-api';
import {
  TelegramBotApiError,
  TelegramBotApiClient,
} from '@api/telegram/shared/bot/telegram-bot-api.client';
import { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';
import { ChannelAvatarPhotoService } from '@api/telegram/shared/emoji/channel-avatar-photo.service';
import { ChannelAvatarEmojiPublisherService } from '../domains/telegram/telegram-channels/channel-avatar-emoji-publisher.service';
import { ChannelAvatarEmojiProcessorService } from '../domains/telegram/telegram-channels/channel-avatar-emoji-processor.service';
import {
  parseAvatarEmojiMaintenanceOptions,
  avatarEmojiMaintenanceEnvironment,
} from '../config/channel-avatar-emoji-maintenance';
import { runAvatarEmojiMigration } from './channel-avatar-emoji-migration';
import { runAvatarEmojiSmoke } from './channel-avatar-emoji-smoke';

async function run() {
  const options = parseAvatarEmojiMaintenanceOptions(process.argv.slice(2));
  const configuration = new ConfigService(
    avatarEmojiMaintenanceEnvironment(options),
  );
  Logger.overrideLogger(false);
  const prisma = new PrismaService();
  const bot = new TelegramBotApiClient();
  const system = new TelegramSystemBotConfigService(configuration);
  const api = new ChannelAvatarEmojiApi(configuration, bot, system);
  try {
    if (!api.configured())
      throw new Error(
        'Selected System Bot and avatar owner must be configured with distinct LOCAL/PRODUCTION tokens.',
      );
    await prisma.$connect();
    const processor = options.execute
      ? new ChannelAvatarEmojiProcessorService(
          prisma,
          new TokenEncryptionService(configuration),
          new ChannelAvatarPhotoService(new TelegramMtprotoClient()),
          new ChannelAvatarEmojiPublisherService(prisma, api),
          api,
        )
      : null;
    const report =
      options.mode === 'smoke'
        ? await runAvatarEmojiSmoke(
            prisma,
            api,
            bot,
            system,
            configuration,
            options,
            processor,
          )
        : await runAvatarEmojiMigration(prisma, api, processor, options);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (
      ('verified' in report && report.verified === false) ||
      ('counts' in report && report.counts.errors > 0)
    )
      process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}
run().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ status: 'ERROR', ...(error instanceof AvatarEmojiApiError ? { message: error.message, errorCode: error.errorCode, retryAfterSeconds: error.retryAfterSeconds } : error instanceof TelegramBotApiError ? { errorCode: error.errorCode, kind: error.kind } : { message: 'Check target environment, workspace and deployed schema.' }) })}\n`,
  );
  process.exitCode = 1;
});
