import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, parse } from 'node:path';
import { FinanceRuntimeConfig } from '../config/finance-runtime-config';
import { FinancePrismaService } from '../prisma/finance-prisma.service';
import { FinancePrimaryBotService } from './finance-primary-bot.service';
import {
  FinanceTelegramBotApiClient,
  type FinanceTelegramWebhookInfo,
} from './finance-telegram-bot-api.client';

/** One bounded startup operation for the explicitly selected Finance bot. */
@Injectable()
export class FinanceTelegramRuntimeService implements OnModuleInit {
  private readonly logger = new Logger(FinanceTelegramRuntimeService.name);

  constructor(
    private readonly config: FinanceRuntimeConfig,
    private readonly primaryBot: FinancePrimaryBotService,
    private readonly api: FinanceTelegramBotApiClient,
    private readonly prisma: FinancePrismaService,
  ) {}

  async onModuleInit() {
    const selected = this.config.selectedBot;
    const webhookUrl = this.webhookUrl();
    if (!selected || !webhookUrl) return;

    try {
      const info = await this.api.getWebhookInfo(selected.token);
      if (configuredWebhookUrl(info) !== webhookUrl) {
        await this.api.setWebhook(selected.token, webhookUrl, selected.webhookSecret);
      }
      const bot = await this.primaryBot.resolve();
      const image = readBrandPhoto(selected.environment);
      const assetHash = createHash('sha256').update(image).digest('hex');
      if (bot.profileAssetHash !== assetHash) {
        await this.api.setMyProfilePhoto(selected.token, image, 'image/png');
        await this.prisma.financeBot.update({
          where: { id: bot.id },
          data: { avatarImage: Uint8Array.from(image), avatarMimeType: 'image/png', avatarFetchedAt: new Date(), profileAssetHash: assetHash },
        });
      }
    } catch {
      // Do not log token, secret, response body, or retry in a loop. A later
      // deployment/restart performs the next bounded reconciliation attempt.
      this.logger.error('Finance Telegram webhook reconciliation failed.');
    }
  }

  private webhookUrl() {
    const baseUrl = this.config.apiPublicUrl;
    if (!baseUrl || !baseUrl.startsWith('https://')) return undefined;
    return `${baseUrl}/api/telegram/finance/webhook`;
  }
}

function readBrandPhoto(environment: 'LOCAL' | 'PRODUCTION') {
  const name = environment === 'LOCAL' ? 'groshly-dev-icon.png' : 'groshly-icon.png';
  let directory = process.cwd();
  while (true) {
    try {
      return readFileSync(join(directory, 'products', 'finance', 'assets', name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (directory === parse(directory).root) throw new Error(`Finance brand asset ${name} is missing`);
    directory = dirname(directory);
  }
}

function configuredWebhookUrl(info: FinanceTelegramWebhookInfo | null | undefined) {
  return typeof info?.url === 'string' ? info.url.replace(/\/$/, '') : undefined;
}
