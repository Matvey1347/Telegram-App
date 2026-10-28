import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramBotRuntimeEnvironment } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import sharp from 'sharp';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramBotApiClient } from '../../../../telegram/shared/bot/telegram-bot-api.client';

/** Reconcile the selected environment-managed System bot photo once per asset version. */
@Injectable()
export class SystemBotBrandingStartupService implements OnModuleInit {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly botApi: TelegramBotApiClient,
  ) {}

  async onModuleInit() {
    const workspaceId = this.config.get<string>('TELEGRAM_SYSTEM_BOT_DASHBOARD_WORKSPACE_ID')?.trim();
    const selected = this.config.get<string>('TELEGRAM_SYSTEM_BOT_ENVIRONMENT');
    if (!workspaceId || (selected !== 'LOCAL' && selected !== 'PRODUCTION')) return;
    const username = this.config.get<string>(`TELEGRAM_SYSTEM_BOT_${selected}_USERNAME`)?.trim();
    const token = this.config.get<string>(`TELEGRAM_SYSTEM_BOT_${selected}_TOKEN`)?.trim();
    if (!username || !token) return;

    const name = selected === 'LOCAL' ? 'telegram-system-dev.png' : 'telegram-system.png';
    const image = await sharp(readBrandSource(name))
      .resize(512, 512, { fit: 'contain', background: '#ffffff' })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 92 }).toBuffer();
    const hash = createHash('sha256').update(image).digest('hex');
    const key = { workspaceId, kind: 'SYSTEM' as const, environment: selected as TelegramBotRuntimeEnvironment };
    const cached = await this.prisma.telegramConfiguredBotAvatar.findUnique({
      where: { workspaceId_kind_environment: key }, select: { profileAssetHash: true },
    });
    if (cached?.profileAssetHash === hash) return;
    try {
      await this.botApi.setMyProfilePhoto(token, image);
      await this.prisma.telegramConfiguredBotAvatar.upsert({
        where: { workspaceId_kind_environment: key },
        create: { ...key, username, image: Uint8Array.from(image), mimeType: 'image/jpeg', profileAssetHash: hash },
        update: { username, image: Uint8Array.from(image), mimeType: 'image/jpeg', profileAssetHash: hash },
      });
    } catch {
      // Retry once on the next process start; no background polling.
    }
  }
}

function readBrandSource(name: string) {
  let directory = process.cwd();
  while (true) {
    const candidate = join(directory, 'apps', 'web', 'public', 'brand', name);
    try { return readFileSync(candidate); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (directory === parse(directory).root) throw new Error(`System bot asset ${name} is missing`);
    directory = dirname(directory);
  }
}
