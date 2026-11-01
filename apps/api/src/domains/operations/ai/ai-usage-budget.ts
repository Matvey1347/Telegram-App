import {
  Prisma,
  type AiBudgetPeriod,
  type AiCategoryConfig,
  type AiWorkspaceConfig,
} from '@prisma/client';
import type { AiBudgetBalance, AiCategory } from '@telegram-system/shared';
import { DAY_MS, utcDay } from './ai-usage-read.helpers';

const CostDecimal = Prisma.Decimal.clone({ precision: 50 });

export function usageBudgets(
  now: Date,
  category: AiCategory | undefined,
  config: AiWorkspaceConfig | null,
  categoryConfig: AiCategoryConfig | null,
  rows: AiBudgetPeriod[],
): AiBudgetBalance[] {
  const day = utcDay(now);
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const scopes: Array<'WORKSPACE' | AiCategory> = category
    ? ['WORKSPACE', category]
    : ['WORKSPACE'];
  return scopes.flatMap((scope) =>
    (['DAY', 'MONTH'] as const).map((period) => {
      const start = period === 'DAY' ? day : month;
      const end =
        period === 'DAY'
          ? new Date(day.getTime() + DAY_MS)
          : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const row = rows.find(
        (item) =>
          item.scope === scope &&
          item.period === period &&
          item.periodStart.getTime() === start.getTime(),
      );
      const settings = scope === 'WORKSPACE' ? config : categoryConfig;
      const configuredLimit =
        (period === 'DAY' ? settings?.dailyBudget : settings?.monthlyBudget) ??
        null;
      const limit =
        configuredLimit === null
          ? null
          : new CostDecimal(configuredLimit.toString());
      const spent = new CostDecimal(row?.spent.toString() ?? 0);
      const reserved = new CostDecimal(row?.reserved.toString() ?? 0);
      const used = spent.plus(reserved);
      return {
        scope,
        period,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        limit: limit?.toFixed(12) ?? null,
        spent: spent.toFixed(12),
        reserved: reserved.toFixed(12),
        remaining: limit
          ? Prisma.Decimal.max(0, limit.minus(used)).toFixed(12)
          : null,
        warning:
          limit !== null &&
          used.gte(limit.mul(config?.warningPercent ?? 80).div(100)),
        exhausted: limit !== null && used.gte(limit),
      };
    }),
  );
}
