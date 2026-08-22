import { forecastMonthlyLimit } from './finance-smart-limits';

describe('forecastMonthlyLimit', () => {
  it('projects an overrun from the current deterministic daily pace', () => {
    expect(forecastMonthlyLimit({ spentMinor: 420_000, limitMinor: 1_000_000, dayOfMonth: 8, daysInMonth: 31 }))
      .toMatchObject({ projectedTotal: 1_627_500, projectedOverage: 627_500, remainingBudget: 580_000 });
  });

  it('handles zero spend and the final day without division errors', () => {
    expect(forecastMonthlyLimit({ spentMinor: 0, limitMinor: 100, dayOfMonth: 1, daysInMonth: 31 }))
      .toMatchObject({ projectedTotal: 0, requiredDailyPace: 100 / 30 });
    expect(forecastMonthlyLimit({ spentMinor: 100, limitMinor: 100, dayOfMonth: 28, daysInMonth: 28 }))
      .toMatchObject({ requiredDailyPace: null, projectedOverage: 0 });
  });
});
