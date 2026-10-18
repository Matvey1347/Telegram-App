import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { TelegramBotRuntimeEnvironment } from "@prisma/client";
import { configuredTelegramBotRuntimeEnvironment } from "@api/domains/telegram/telegram-bots/core/telegram-bot-runtime-environment.service";

/** Selects the one exact runtime accepted by Finance consumer authentication. */
@Injectable()
export class FinanceConsumerRuntimeEnvironmentService {
  constructor(private readonly config: ConfigService) {}

  current(): TelegramBotRuntimeEnvironment | null {
    return configuredTelegramBotRuntimeEnvironment();
  }

  /**
   * The local Finance profile is the source of truth for the bot a browser
   * login opens. Runtime database data is still used for token validation,
   * but its cached username must not send a user to a replaced bot.
   */
  browserLoginBotUsername(): string | null {
    const value = this.config
      .get<string>("FINANCE_BROWSER_LOGIN_BOT_USERNAME")
      ?.trim();
    if (!value || !/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value)) return null;
    return value.replace(/^@/u, "").toLowerCase();
  }
}
