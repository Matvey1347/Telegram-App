export type SmartLimitForecast = {
  elapsedDays: number;
  daysInPeriod: number;
  dailySpendPace: number;
  projectedTotal: number;
  remainingBudget: number;
  requiredDailyPace: number | null;
  projectedOverage: number;
};

/** Deterministic month forecast. Amounts are minor units to avoid float drift. */
export function forecastMonthlyLimit(input: {
  spentMinor: number;
  limitMinor: number;
  dayOfMonth: number;
  daysInMonth: number;
}): SmartLimitForecast {
  const elapsedDays = Math.max(1, Math.min(input.daysInMonth, input.dayOfMonth));
  const dailySpendPace = input.spentMinor / elapsedDays;
  const projectedTotal = Math.round(dailySpendPace * input.daysInMonth);
  const remainingBudget = input.limitMinor - input.spentMinor;
  const daysRemaining = Math.max(0, input.daysInMonth - elapsedDays);
  return {
    elapsedDays,
    daysInPeriod: input.daysInMonth,
    dailySpendPace,
    projectedTotal,
    remainingBudget,
    requiredDailyPace: daysRemaining ? Math.max(0, remainingBudget) / daysRemaining : null,
    projectedOverage: Math.max(0, projectedTotal - input.limitMinor),
  };
}
