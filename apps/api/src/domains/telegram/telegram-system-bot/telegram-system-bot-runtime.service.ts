import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';
import {
  TelegramSystemBotHandlerService,
  type TelegramSystemBotUpdate,
} from './telegram-system-bot-handler.service';
import { sanitizeOperationalError } from '../../../common/security/operational-error';
import { SYSTEM_BOT_COMMANDS } from './telegram-system-bot-menu';

const SYSTEM_BOT_UPDATE_RECLAIM_AFTER_MS = 5 * 60_000;
const SYSTEM_BOT_COMMAND_LOCALES = ['en', 'ru', 'uk', 'pl'] as const;
const SYSTEM_BOT_PRIVATE_CHAT_SCOPE = {
  type: 'all_private_chats',
} as const;

type SystemBotUpdateResult = {
  status: 'SKIPPED' | 'DUPLICATE' | 'PROCESSED';
};

type ClaimedSystemBotUpdateResult = {
  status: 'DUPLICATE' | 'PROCESSED';
};

@Injectable()
export class TelegramSystemBotRuntimeService implements OnModuleInit {
  // A static registry covers every Nest service instance in this Node process
  // without adding a timer or database heartbeat for active handlers.
  private static readonly inFlightUpdates = new Map<
    string,
    Promise<ClaimedSystemBotUpdateResult>
  >();

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
      const commands = [...SYSTEM_BOT_COMMANDS];
      await Promise.all([
        this.api.setMyCommands(token, commands),
        this.api.setMyCommands(
          token,
          commands,
          undefined,
          SYSTEM_BOT_PRIVATE_CHAT_SCOPE,
        ),
        ...SYSTEM_BOT_COMMAND_LOCALES.flatMap((locale) => [
          this.api.setMyCommands(token, commands, locale),
          this.api.setMyCommands(
            token,
            commands,
            locale,
            SYSTEM_BOT_PRIVATE_CHAT_SCOPE,
          ),
        ]),
      ]);
      await this.api.setChatMenuButton(token, { type: 'commands' });
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

  private processUpdate(
    update: TelegramSystemBotUpdate,
  ): Promise<SystemBotUpdateResult> {
    if (update.update_id === undefined || update.update_id === null)
      return Promise.resolve({ status: 'SKIPPED' });
    const updateId = String(update.update_id);
    const environment = this.config.environment!;
    const inFlightKey = `${environment}\u0000${updateId}`;
    if (TelegramSystemBotRuntimeService.inFlightUpdates.has(inFlightKey)) {
      return Promise.resolve({ status: 'DUPLICATE' });
    }

    const execution = this.processClaimedUpdate(update, environment, updateId);
    TelegramSystemBotRuntimeService.inFlightUpdates.set(inFlightKey, execution);
    return execution.finally(() => {
      if (
        TelegramSystemBotRuntimeService.inFlightUpdates.get(inFlightKey) ===
        execution
      ) {
        TelegramSystemBotRuntimeService.inFlightUpdates.delete(inFlightKey);
      }
    });
  }

  private async processClaimedUpdate(
    update: TelegramSystemBotUpdate,
    environment: NonNullable<TelegramSystemBotConfigService['environment']>,
    updateId: string,
  ): Promise<ClaimedSystemBotUpdateResult> {
    const updateType = update.message
      ? 'message'
      : update.callback_query
        ? 'callback_query'
        : update.my_chat_member
          ? 'my_chat_member'
          : 'other';
    let logId: string;
    let attemptStartedAt = new Date(Date.now());
    try {
      const log = await this.prisma.telegramSystemBotUpdateLog.create({
        data: {
          environment,
          updateId,
          updateType,
          updatedAt: attemptStartedAt,
        },
      });
      logId = log.id;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const existing =
          await this.prisma.telegramSystemBotUpdateLog.findUnique({
            where: {
              environment_updateId: {
                environment,
                updateId,
              },
            },
            select: { id: true, status: true, updatedAt: true },
          });
        if (!existing) throw error;
        if (existing.status !== 'PROCESSING') return { status: 'DUPLICATE' };
        const reclaimStartedAt = new Date(Date.now());
        if (
          existing.updatedAt.getTime() >=
          reclaimStartedAt.getTime() - SYSTEM_BOT_UPDATE_RECLAIM_AFTER_MS
        ) {
          return { status: 'DUPLICATE' };
        }
        attemptStartedAt = reclaimStartedAt;
        // `updatedAt` is the attempt generation: reclaim and both terminal
        // writes must still own the exact generation they observed or created.
        const reclaimed =
          await this.prisma.telegramSystemBotUpdateLog.updateMany({
            where: {
              id: existing.id,
              status: 'PROCESSING',
              updatedAt: existing.updatedAt,
            },
            data: {
              processedAt: null,
              error: null,
              updatedAt: attemptStartedAt,
            },
          });
        if (reclaimed.count !== 1) return { status: 'DUPLICATE' };
        logId = existing.id;
      } else {
        throw error;
      }
    }
    try {
      await this.handler.handle(update);
    } catch (error) {
      await this.prisma.telegramSystemBotUpdateLog.updateMany({
        where: {
          id: logId,
          status: 'PROCESSING',
          updatedAt: attemptStartedAt,
        },
        data: {
          status: 'FAILED',
          error: sanitizeOperationalError(error, 'System bot handler failed'),
        },
      });
      throw error;
    }
    const finalized = await this.prisma.telegramSystemBotUpdateLog.updateMany({
      where: {
        id: logId,
        status: 'PROCESSING',
        updatedAt: attemptStartedAt,
      },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });
    return {
      status: finalized.count === 1 ? 'PROCESSED' : 'DUPLICATE',
    };
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
