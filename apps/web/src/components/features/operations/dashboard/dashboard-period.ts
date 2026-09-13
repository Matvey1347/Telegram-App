export type DashboardPeriod = {
  dateFrom: string;
  dateTo: string;
};

export function formatDashboardDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function currentCalendarMonthPeriod(now = new Date()): DashboardPeriod {
  return {
    dateFrom: formatDashboardDate(
      new Date(now.getFullYear(), now.getMonth(), 1),
    ),
    dateTo: formatDashboardDate(
      new Date(now.getFullYear(), now.getMonth() + 1, 0),
    ),
  };
}
