import { ServiceUnavailableException, Injectable } from '@nestjs/common';
import type { FinanceBot, FinanceBotRuntimeEnvironment } from '../generated/prisma';
import { FinanceRuntimeConfig, type SelectedFinanceBotConfig } from '../config/finance-runtime-config';
import { FinancePrismaService } from '../prisma/finance-prisma.service';

/**
 * Resolves Finance's one configured bot inside the Finance database. Browser
 * routes and Telegram webhook URLs intentionally never select a bot by ID.
 */
@Injectable()
export class FinancePrimaryBotService {
  constructor(
    private readonly config: FinanceRuntimeConfig,
    private readonly prisma: FinancePrismaService,
  ) {}

  async resolve(): Promise<FinanceBot> {
    const selected = this.requiredSelectedBot();
    const runtimeEnvironment = selected.environment as FinanceBotRuntimeEnvironment;
    const existing = await this.prisma.financeBot.findUnique({ where: { runtimeEnvironment } });
    if (existing && existing.telegramUsername === selected.username) return existing;

    if (existing) {
      return this.prisma.financeBot.update({
        where: { id: existing.id },
        data: { telegramUsername: selected.username },
      });
    }

    try {
      return await this.prisma.financeBot.create({
        data: { runtimeEnvironment, telegramUsername: selected.username },
      });
    } catch (error) {
      // A simultaneous first webhook may create the same primary bot. Read it
      // back instead of creating duplicate configuration rows.
      if (!isUniqueConstraint(error)) throw error;
      const resolved = await this.prisma.financeBot.findUnique({ where: { runtimeEnvironment } });
      if (!resolved) throw error;
      return resolved;
    }
  }

  webhookSecret() {
    return this.requiredSelectedBot().webhookSecret;
  }

  private requiredSelectedBot(): SelectedFinanceBotConfig {
    if (!this.config.selectedBot) {
      throw new ServiceUnavailableException('Finance Telegram bot runtime is disabled');
    }
    return this.config.selectedBot;
  }
}

function isUniqueConstraint(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
