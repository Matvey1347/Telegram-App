import type {
  TelegramAdSalesCalendarRangeMode,
  TelegramAdSalesTab,
} from "@/lib/features/growth/telegram-ad-sales";
import { channelLocalDateKey } from "@/lib/features/growth/telegram-ad-sales";

function startOfWeek(value: Date) {
  const date = new Date(value);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

export function dateKey(value: Date) {
  return channelLocalDateKey(value);
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function endOfMonth(value: Date) {
  return new Date(
    value.getFullYear(),
    value.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
}

function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

export function monthGridDays(value: Date) {
  const start = startOfWeek(startOfMonth(value));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function monthGridDaysForRange(from: Date, to: Date) {
  const start = startOfWeek(startOfMonth(from));
  const lastVisibleWeekStart = startOfWeek(addDays(endOfMonth(to), 1));
  const end = addDays(lastVisibleWeekStart, 6);
  return listDaysInRange(start, end);
}

export function rangeForCalendarMode(
  view: TelegramAdSalesCalendarRangeMode,
  cursor: Date,
) {
  if (view === "month") {
    return {
      from: startOfMonth(cursor),
      to: endOfMonth(cursor),
    };
  }
  if (view === "threeMonths") {
    return {
      from: startOfMonth(addMonths(cursor, -1)),
      to: endOfMonth(addMonths(cursor, 1)),
    };
  }
  return {
    from: startOfWeek(cursor),
    to: addDays(startOfWeek(cursor), 6),
  };
}

export function listDaysInRange(from: Date, to: Date) {
  const days: Date[] = [];
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor = addDays(cursor, 1)
  ) {
    days.push(new Date(cursor));
  }
  return days;
}

export function sameStringArray(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export const tabRouteMap: Record<TelegramAdSalesTab, string> = {
  calendar: "/ad-sales/calendar",
  sales: "/ad-sales/sales",
  clients: "/ad-sales/clients",
  analytics: "/ad-sales/analytics",
  settings: "/ad-sales/calendar",
};

export function routeTabFromPathname(pathname: string): TelegramAdSalesTab {
  if (pathname.startsWith("/ad-sales/analytics")) return "analytics";
  if (pathname.startsWith("/ad-sales/clients")) return "clients";
  if (pathname.startsWith("/ad-sales/sales")) return "sales";
  return "calendar";
}

