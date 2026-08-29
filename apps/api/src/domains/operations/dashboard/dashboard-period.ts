const DAY = 24 * 60 * 60 * 1000;

export function startOfDashboardDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDashboardDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function parseDashboardDate(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dashboardIsoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function dashboardDateRange(input?: {
  dateFrom?: string;
  dateTo?: string;
}) {
  if (!input?.dateFrom && !input?.dateTo) {
    return {
      from: startOfDashboardDay(new Date(2000, 0, 1)),
      to: endOfDashboardDay(new Date()),
    };
  }
  const fallbackTo = startOfDashboardDay(new Date());
  const fallbackFrom = new Date(fallbackTo.getTime() - 29 * DAY);
  const from = startOfDashboardDay(
    parseDashboardDate(input?.dateFrom) ?? fallbackFrom,
  );
  const to = endOfDashboardDay(parseDashboardDate(input?.dateTo) ?? fallbackTo);
  return from <= to
    ? { from, to }
    : {
        from: startOfDashboardDay(to),
        to: endOfDashboardDay(from),
      };
}

export function dashboardPeriodDays(from: Date, to: Date) {
  return (
    Math.max(
      0,
      Math.round(
        (startOfDashboardDay(to).getTime() -
          startOfDashboardDay(from).getTime()) /
          DAY,
      ),
    ) + 1
  );
}

export { DAY as DASHBOARD_DAY_MS };
