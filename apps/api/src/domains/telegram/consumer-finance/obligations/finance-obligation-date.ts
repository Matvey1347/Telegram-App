import { BadRequestException } from '@nestjs/common';
import type { FinanceRecurringPaymentRecurrence } from '@prisma/client';
import { zonedStartOfDay } from '../ledger/finance-history-date-range';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/u;

type CalendarDate = { year: number; month: number; day: number };

function parseCalendarDate(value: string): CalendarDate {
  const match = DATE_ONLY.exec(value);
  if (!match) throw new BadRequestException('Invalid local calendar date');
  const [, yearValue, monthValue, dayValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const verified = new Date(Date.UTC(year, month - 1, day));
  if (
    verified.getUTCFullYear() !== year ||
    verified.getUTCMonth() + 1 !== month ||
    verified.getUTCDate() !== day
  ) {
    throw new BadRequestException('Invalid local calendar date');
  }
  return { year, month, day };
}

function calendarDateValue({ year, month, day }: CalendarDate) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function financeLocalCalendarDate(instant: Date, timezone: string) {
  try {
    const values = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(instant)
        .map((part) => [part.type, part.value]),
    );
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    throw new BadRequestException('Unknown timezone');
  }
}

export function financeObligationDate(value: string, timezone: string) {
  parseCalendarDate(value);
  return zonedStartOfDay(value, timezone);
}

export function financeRecurrenceAnchor(
  value: string,
  recurrence: FinanceRecurringPaymentRecurrence,
) {
  const date = parseCalendarDate(value);
  if (recurrence === 'WEEKLY') {
    const weekday = new Date(
      Date.UTC(date.year, date.month - 1, date.day),
    ).getUTCDay();
    return { anchorDay: weekday || 7, anchorMonth: null };
  }
  return {
    anchorDay: date.day,
    anchorMonth: recurrence === 'YEARLY' ? date.month : null,
  };
}

export function nextFinanceOccurrence(input: {
  current: Date;
  recurrence: FinanceRecurringPaymentRecurrence;
  anchorDay: number;
  anchorMonth: number | null;
  timezone: string;
}) {
  const current = parseCalendarDate(
    financeLocalCalendarDate(input.current, input.timezone),
  );
  let next: CalendarDate;
  if (input.recurrence === 'WEEKLY') {
    const value = new Date(
      Date.UTC(current.year, current.month - 1, current.day + 7),
    );
    next = {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    };
  } else if (input.recurrence === 'MONTHLY') {
    const monthValue = new Date(Date.UTC(current.year, current.month, 1));
    const year = monthValue.getUTCFullYear();
    const month = monthValue.getUTCMonth() + 1;
    next = {
      year,
      month,
      day: Math.min(input.anchorDay, daysInMonth(year, month)),
    };
  } else {
    const year = current.year + 1;
    const month = input.anchorMonth ?? current.month;
    next = {
      year,
      month,
      day: Math.min(input.anchorDay, daysInMonth(year, month)),
    };
  }
  return financeObligationDate(calendarDateValue(next), input.timezone);
}

export function financeDebtIsOverdue(
  dueAt: Date,
  _timezone: string,
  now = new Date(),
) {
  return dueAt < now;
}

export function financeRegularPaymentIsDue(
  nextOccurrenceAt: Date,
  _timezone: string,
  now = new Date(),
) {
  return nextOccurrenceAt <= now;
}
