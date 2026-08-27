const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const weekdayDateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function parsedDate(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | number | Date) {
  const date = parsedDate(value);
  return date ? dateFormatter.format(date) : "—";
}

export function formatDateTime(value: string | number | Date) {
  const date = parsedDate(value);
  return date ? dateTimeFormatter.format(date) : "—";
}

export function formatDateWithWeekday(value: string | number | Date) {
  const date = parsedDate(value);
  return date ? weekdayDateFormatter.format(date) : "—";
}
