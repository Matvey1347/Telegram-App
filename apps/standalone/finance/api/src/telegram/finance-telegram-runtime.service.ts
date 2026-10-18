import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FinanceRuntimeConfig } from '../config/finance-runtime-config';
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
      await this.primaryBot.resolve();
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

function configuredWebhookUrl(info: FinanceTelegramWebhookInfo | null | undefined) {
  return typeof info?.url === 'string' ? info.url.replace(/\/$/, '') : undefined;
}
