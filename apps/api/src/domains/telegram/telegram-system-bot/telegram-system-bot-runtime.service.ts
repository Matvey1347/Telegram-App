import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';
import {
  TelegramSystemBotHandlerService,
  type TelegramSystemBotUpdate,
} from './telegram-system-bot-handler.service';
import { sanitizeOperationalError } from '../../../common/security/operational-error';

@Injectable()
export class TelegramSystemBotRuntimeService implements OnModuleInit {
  private readonly logger = new Logger(TelegramSystemBotRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: TelegramSystemBotConfigService,
    private readonly api: TelegramBotApiClient,
    private readonly handler: TelegramSystemBotHandlerService,
  ) {}

  async onModuleInit() {
    const environment = this.config.environment;
    const token = this.config.token;
    if (!environment) {
      this.logger.log(
        'Telegram System Bot is disabled: TELEGRAM_SYSTEM_BOT_ENVIRONMENT must explicitly select LOCAL or PRODUCTION.',
      );
      return;
    }
    const url = this.config.webhookUrl;
    const secret = this.config.expectedWebhookSecret();
    if (!token || !url || !secret) {
      this.logger.log(
        `Telegram System Bot ${environment} runtime is disabled: token, webhook URL, or webhook secret is not configured.`,
      );
      return;
    }
    try {
      await this.configureMenu(token);
      const webhookInfo = await this.api.getWebhookInfo(token);
      if (this.webhookUrl(webhookInfo) !== url) {
        await this.api.setWebhook(token, url, secret);
      }
    } catch (error) {
      this.logger.error(
        `Telegram System Bot webhook setup failed: ${sanitizeOperationalError(error)}`,
      );
    }
  }

  private async configureMenu(token: string) {
    try {
      // The System Bot uses a collapsible ReplyKeyboardMarkup. Clearing the
      // slash-command menu lets Telegram expose that keyboard through its
      // native square grid icon next to the input field.
      await this.api.deleteMyCommands(token);
      await this.api.setChatMenuButton(token, { type: 'default' });
    } catch (error) {
      this.logger.warn(
        `Telegram System Bot command setup failed: ${sanitizeOperationalError(error)}`,
      );
    }
  }

  async handleWebhook(
    secret: string | undefined,
    update: TelegramSystemBotUpdate,
  ) {
    if (!this.config.configured) return { status: 'DISABLED' };
    if (!this.config.validatesWebhookSecret(secret))
      return { status: 'UNAUTHORIZED' };
    return this.processUpdate(update);
  }

  private async processUpdate(update: TelegramSystemBotUpdate) {
    if (update.update_id === undefined || update.update_id === null)
      return { status: 'SKIPPED' };
    const updateId = String(update.update_id);
    const updateType = update.message
      ? 'message'
      : update.callback_query
        ? 'callback_query'
        : update.my_chat_member
          ? 'my_chat_member'
          : 'other';
    let log: { id: string; status: string };
    try {
      log = await this.prisma.telegramSystemBotUpdateLog.create({
        data: { environment: this.config.environment!, updateId, updateType },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const existing =
          await this.prisma.telegramSystemBotUpdateLog.findUnique({
            where: {
              environment_updateId: {
                environment: this.config.environment!,
                updateId,
              },
            },
            select: { id: true, status: true },
          });
        if (!existing) throw error;
        return { status: 'DUPLICATE' };
      } else {
        throw error;
      }
    }
    try {
      await this.handler.handle(update);
      await this.prisma.telegramSystemBotUpdateLog.update({
        where: { id: log.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      return { status: 'PROCESSED' };
    } catch (error) {
      await this.prisma.telegramSystemBotUpdateLog.update({
        where: { id: log.id },
        data: {
          status: 'FAILED',
          error: sanitizeOperationalError(error, 'System bot handler failed'),
        },
      });
      throw error;
    }
  }

  private isUniqueViolation(error: unknown) {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002',
    );
  }

  private webhookUrl(info: Record<string, unknown> | null) {
    const url = info?.url;
    return typeof url === 'string' ? url : null;
  }
}
