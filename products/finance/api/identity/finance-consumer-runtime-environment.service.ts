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

  /** Optional LOCAL profile selector. Authentication uses the selected DB runtime credential. */
  browserLoginBotUsername(): string | null {
    const value = this.config
      .get<string>("FINANCE_BROWSER_LOGIN_BOT_USERNAME")
      ?.trim();
    if (!value || !/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value)) return null;
    return value.replace(/^@/u, "").toLowerCase();
  }
}
