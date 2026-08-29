import { buildDashboardTrend } from './dashboard-trend';
import {
  DASHBOARD_DAY_MS,
  dashboardIsoDay,
  dashboardPeriodDays,
  startOfDashboardDay,
} from './dashboard-period';

describe('buildDashboardTrend', () => {
  it('preserves daily signs and cumulative totals for a short range', () => {
    const rows = buildDashboardTrend({
      from: new Date('2026-01-01T00:00:00'),
      to: new Date('2026-01-02T23:59:59.999'),
      cumulativeBeforePeriod: 10,
      revenue: [
        { date: new Date('2026-01-01T12:00:00'), amountInPrimaryCurrency: 100 },
      ],
      expenses: [
        { date: new Date('2026-01-02T12:00:00'), amountInPrimaryCurrency: 30 },
      ],
      investments: [
        { date: new Date('2026-01-01T13:00:00'), amountInPrimaryCurrency: 20 },
      ],
      campaigns: [
        {
          date: new Date('2026-01-02T10:00:00'),
          priceInPrimaryCurrency: 40,
          joinedCount: 5,
        },
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        date: dashboardIsoDay(new Date('2026-01-01T00:00:00')),
        income: 100,
        expenses: 0,
        profit: 100,
        investments: 20,
        cumulativeProfitAfterInvestments: 90,
      }),
      expect.objectContaining({
        date: dashboardIsoDay(new Date('2026-01-02T00:00:00')),
        income: 0,
        expenses: 30,
        profit: -30,
        adSpend: 40,
        joined: 5,
        cumulativeProfitAfterInvestments: 60,
      }),
    ]);
  });

  it('preserves one gap-free row per day and the response shape for all time', () => {
    const from = new Date('2000-01-01T00:00:00');
    const to = new Date('2026-08-27T23:59:59.999');
    const rows = buildDashboardTrend({
      from,
      to,
      cumulativeBeforePeriod: 0,
      revenue: [
        { date: new Date('2000-01-01T12:00:00'), amountInPrimaryCurrency: 4 },
        { date: new Date('2026-08-27T12:00:00'), amountInPrimaryCurrency: 6 },
      ],
      expenses: [
        { date: new Date('2015-05-10T12:00:00'), amountInPrimaryCurrency: 3 },
      ],
      investments: [],
      campaigns: [],
    });

    expect(rows).toHaveLength(dashboardPeriodDays(from, to));
    expect(rows.length).toBeGreaterThan(400);
    expect(rows[0]).toEqual({
      date: dashboardIsoDay(startOfDashboardDay(from)),
      income: 4,
      expenses: 0,
      profit: 4,
      investments: 0,
      cumulativeProfitAfterInvestments: 4,
      adSpend: 0,
      joined: 0,
    });
    expect(rows.at(-1)).toEqual({
      date: dashboardIsoDay(startOfDashboardDay(to)),
      income: 6,
      expenses: 0,
      profit: 6,
      investments: 0,
      cumulativeProfitAfterInvestments: 7,
      adSpend: 0,
      joined: 0,
    });
    for (let index = 1; index < rows.length; index += 1) {
      expect(
        new Date(rows[index].date).getTime() -
          new Date(rows[index - 1].date).getTime(),
      ).toBe(DASHBOARD_DAY_MS);
    }
    expect(rows.reduce((sum, row) => sum + row.income, 0)).toBe(10);
    expect(rows.reduce((sum, row) => sum + row.expenses, 0)).toBe(3);
  });
});
