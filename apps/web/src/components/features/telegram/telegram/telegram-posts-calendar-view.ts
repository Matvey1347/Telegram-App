export function calendarWeekdays(locale?: string) {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const monday = new Date(2024, 0, 1);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return formatter.format(day).replace(/\.$/, "");
  });
}

export function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

export function endOfMonth(value: Date) {
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

export function startOfDay(value: Date) {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    0,
    0,
    0,
    0,
  );
}

export function endOfDay(value: Date) {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    23,
    59,
    59,
    999,
  );
}

export function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

export function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

export function toLocalDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthLabel(value: Date, locale?: string) {
  return value.toLocaleDateString(locale, { month: "long", year: "numeric" });
}

export function calendarGridStart(value: Date) {
  const first = startOfMonth(value);
  const day = first.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(first);
  start.setDate(first.getDate() + diff);
  return start;
}

export function calendarGridEnd(value: Date) {
  const end = calendarGridStart(value);
  end.setDate(end.getDate() + 41);
  return end;
}

export function buildCalendarDays(value: Date) {
  const start = calendarGridStart(value);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export function sameMonth(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth()
  );
}

export function timeLabel(value?: string | null, locale?: string) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function calendarStatusTone(status: "SCHEDULED" | "PUBLISHED") {
  return status === "SCHEDULED"
    ? "bg-amber-500/18 text-amber-100 ring-1 ring-amber-400/15"
    : "bg-emerald-500/12 text-neutral-50 ring-1 ring-white/5";
}

export function calendarStatusIcon(status: "SCHEDULED" | "PUBLISHED") {
  return status === "SCHEDULED" ? "🕒" : "✅";
}
