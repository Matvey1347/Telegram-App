import {
  DASHBOARD_DAY_MS,
  dashboardIsoDay,
  dashboardPeriodDays,
  startOfDashboardDay,
} from './dashboard-period';

type AmountRow = { date: Date; amountInPrimaryCurrency: unknown };
type CampaignRow = {
  date: Date;
  priceInPrimaryCurrency: unknown;
  joinedCount: number;
};

function dashboardCalendarDay(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function buildDashboardTrend(input: {
  from: Date;
  to: Date;
  cumulativeBeforePeriod: number;
  revenue: AmountRow[];
  expenses: AmountRow[];
  investments: AmountRow[];
  campaigns: CampaignRow[];
}) {
  const periodDays = dashboardPeriodDays(input.from, input.to);
  const periodStart = startOfDashboardDay(input.from);
  const periodStartCalendarDay = dashboardCalendarDay(periodStart);
  const rows = Array.from({ length: periodDays }, (_, index) => {
    const date = new Date(periodStart);
    date.setDate(date.getDate() + index);
    return {
      date: dashboardIsoDay(date),
      income: 0,
      expenses: 0,
      profit: 0,
      investments: 0,
      cumulativeProfitAfterInvestments: 0,
      adSpend: 0,
      joined: 0,
    };
  });
  const rowFor = (date: Date) => {
    const dayOffset = Math.round(
      (dashboardCalendarDay(date) - periodStartCalendarDay) / DASHBOARD_DAY_MS,
    );
    return rows[dayOffset];
  };

  for (const transaction of input.revenue) {
    const row = rowFor(transaction.date);
    if (row) row.income += Number(transaction.amountInPrimaryCurrency ?? 0);
  }
  for (const transaction of input.expenses) {
    const row = rowFor(transaction.date);
    if (row) row.expenses += Number(transaction.amountInPrimaryCurrency ?? 0);
  }
  for (const investment of input.investments) {
    const row = rowFor(investment.date);
    if (row) {
      row.investments += Number(investment.amountInPrimaryCurrency ?? 0);
    }
  }
  for (const campaign of input.campaigns) {
    const row = rowFor(campaign.date);
    if (!row) continue;
    row.adSpend += Number(campaign.priceInPrimaryCurrency ?? 0);
    row.joined += campaign.joinedCount;
  }

  let cumulative = input.cumulativeBeforePeriod;
  for (const row of rows) {
    row.profit = row.income - row.expenses;
    cumulative += row.profit - row.investments;
    row.cumulativeProfitAfterInvestments = cumulative;
  }
  return rows;
}
