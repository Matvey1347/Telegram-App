import { Injectable, Logger } from '@nestjs/common';
import { TelegramBotApplicationType } from '@prisma/client';
import { sanitizeOperationalError } from '../../../../common/security/operational-error';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';
import { TelegramBotRuntimePresentationService } from './telegram-bot-runtime-presentation.service';

/**
 * Replaces chat-specific Telegram menu buttons that override the bot-wide
 * button. This is event-driven from runtime enable, refresh, and startup only.
 */
@Injectable()
export class TelegramBotRuntimeUserPresentationService {
  private readonly logger = new Logger(
    TelegramBotRuntimeUserPresentationService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly botApi: TelegramBotApiClient,
    private readonly presentation: TelegramBotRuntimePresentationService,
  ) {}

  async reconcile(input: {
    runtimeId: string;
    botIntegrationId: string;
    applicationType: TelegramBotApplicationType;
    token: string;
  }) {
    if (input.applicationType !== TelegramBotApplicationType.FINANCE) {
      return { attempted: 0, failed: 0 };
    }
    const application = this.presentation.application(input.applicationType);
    if (!application) return { attempted: 0, failed: 0 };
    const users = await this.prisma.telegramBotUser.findMany({
      where: {
        runtimeInstanceId: input.runtimeId,
        blockedAt: null,
        telegramChatId: { not: null },
      },
      select: { telegramChatId: true, languageCode: true },
      distinct: ['telegramChatId'],
    });
    let failed = 0;
    for (let index = 0; index < users.length; index += 10) {
      const batch = users.slice(index, index + 10);
      const outcomes = await Promise.allSettled(
        batch.map((user) => {
          const locale = application.resolveLocale(user.languageCode, null);
          return this.botApi.setChatMenuButton(
            input.token,
            application.menuButton(input.botIntegrationId, locale),
            user.telegramChatId!,
          );
        }),
      );
      for (const outcome of outcomes) {
        if (outcome.status !== 'rejected') continue;
        failed += 1;
        this.logger.warn(
          `Unable to reconcile a Telegram chat menu button: ${sanitizeOperationalError(outcome.reason)}`,
        );
      }
    }
    return { attempted: users.length, failed };
  }
}
