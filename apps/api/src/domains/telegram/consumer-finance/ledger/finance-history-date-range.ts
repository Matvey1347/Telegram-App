import { BadRequestException } from '@nestjs/common';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;
const MAX_RANGE_MS = 367 * 86400000;

export type FinanceAnalyticsPeriod =
  | 'CURRENT_MONTH'
  | 'PREVIOUS_MONTH'
  | 'LAST_3_MONTHS'
  | 'CUSTOM';

export function financeHistoryDateRange(
  fromRaw?: string,
  toRaw?: string,
  timezone = 'UTC',
) {
  const from = fromRaw
    ? DATE_ONLY.test(fromRaw)
      ? zonedStartOfDay(fromRaw, timezone)
      : new Date(fromRaw)
    : undefined;
  const dateOnlyTo = Boolean(toRaw && DATE_ONLY.test(toRaw));
  const to = toRaw
    ? dateOnlyTo
      ? zonedStartOfDay(nextCalendarDate(toRaw), timezone)
      : new Date(toRaw)
    : undefined;
  if (
    (from && Number.isNaN(from.getTime())) ||
    (to && Number.isNaN(to.getTime())) ||
    (from && to && (to <= from || to.getTime() - from.getTime() > MAX_RANGE_MS))
  )
    throw new BadRequestException('Invalid or unbounded history date range');
  return { from, to, toExclusive: dateOnlyTo };
}

function nextCalendarDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
}

export function zonedStartOfDay(value: string, timezone: string) {
  const [year, month, day] = value.split('-').map(Number);
  const desired = Date.UTC(year, month - 1, day);
  let instant = desired;
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date(instant));
      const read = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((part) => part.type === type)?.value);
      const represented = Date.UTC(
        read('year'),
        read('month') - 1,
        read('day'),
        read('hour'),
        read('minute'),
        read('second'),
      );
      instant += desired - represented;
    }
  } catch {
    throw new BadRequestException('Unknown timezone');
  }
  return new Date(instant);
}

export function financeAnalyticsDateRange(
  input: { period: FinanceAnalyticsPeriod; from?: string; to?: string },
  timezone: string,
  now = new Date(),
) {
  if (input.period === 'CUSTOM') {
    if (!input.from || !input.to)
      throw new BadRequestException(
        'Custom analytics requires both from and to dates',
      );
    const range = financeHistoryDateRange(input.from, input.to, timezone);
    if (!range.from || !range.to)
      throw new BadRequestException('Invalid analytics date range');
    return { from: range.from, to: range.to };
  }

  let year: number;
  let month: number;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(now);
    year = Number(parts.find((part) => part.type === 'year')?.value);
    month = Number(parts.find((part) => part.type === 'month')?.value);
  } catch {
    throw new BadRequestException('Unknown timezone');
  }
  const monthDate = (offset: number) => {
    const value = new Date(Date.UTC(year, month - 1 + offset, 1));
    return zonedStartOfDay(value.toISOString().slice(0, 10), timezone);
  };
  if (input.period === 'CURRENT_MONTH')
    return { from: monthDate(0), to: monthDate(1) };
  if (input.period === 'PREVIOUS_MONTH')
    return { from: monthDate(-1), to: monthDate(0) };
  return { from: monthDate(-2), to: monthDate(1) };
}

export function financeOccurredAtFilter(
  range: ReturnType<typeof financeHistoryDateRange>,
) {
  return range.from || range.to
    ? {
        occurredAt: {
          ...(range.from ? { gte: range.from } : {}),
          ...(range.to
            ? range.toExclusive
              ? { lt: range.to }
              : { lte: range.to }
            : {}),
        },
      }
    : {};
}
