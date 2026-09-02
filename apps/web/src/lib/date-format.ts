function formatter(locale: string | undefined, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", options);
}

function parsedDate(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | number | Date, locale?: string) {
  const date = parsedDate(value);
  return date ? formatter(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(date) : "—";
}

export function formatDateTime(value: string | number | Date, locale?: string) {
  const date = parsedDate(value);
  return date ? formatter(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date) : "—";
}

export function formatDateWithWeekday(value: string | number | Date, locale?: string) {
  const date = parsedDate(value);
  return date ? formatter(locale, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }).format(date) : "—";
}
