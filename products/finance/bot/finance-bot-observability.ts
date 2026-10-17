import { Logger } from '@nestjs/common';

const logger = new Logger('FinanceBotService');

export function warnSlowFinanceContext(runtimeId: string, latencyMs: number) {
  if (latencyMs >= 500)
    logger.warn(
      JSON.stringify({
        event: 'finance_bot.slow_context',
        runtimeId,
        latencyMs,
      }),
    );
}
