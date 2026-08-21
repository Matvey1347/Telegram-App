type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsInTimeZone(value: Date, timezone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

export function financeCalendarDate(value: string | Date, timezone: string) {
  const parts = partsInTimeZone(
    typeof value === "string" ? new Date(value) : value,
    timezone,
  );
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function financeToday(timezone: string, now = new Date()) {
  return financeCalendarDate(now, timezone);
}

/** Converts a profile-local calendar date to a stable local-noon instant. */
export function financeCalendarDateToIso(date: string, timezone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("Invalid calendar date");
  const desired = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
  );
  let instant = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = partsInTimeZone(new Date(instant), timezone);
    const representedAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    instant += desired - representedAsUtc;
  }
  const iso = new Date(instant).toISOString();
  if (financeCalendarDate(iso, timezone) !== date)
    throw new Error("Calendar date cannot be represented in timezone");
  return iso;
}

export function financeOccurredAtForDate(
  date: string,
  timezone: string,
  original?: string | null,
) {
  return original && financeCalendarDate(original, timezone) === date
    ? original
    : financeCalendarDateToIso(date, timezone);
}

export function financeHistoryDateMatches(
  occurredAt: string,
  from: string | undefined,
  to: string | undefined,
  timezone: string,
) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  const calendarDate = financeCalendarDate(occurredAt, timezone);
  const instant = new Date(occurredAt).getTime();
  if (
    from &&
    (dateOnly.test(from)
      ? calendarDate < from
      : instant < new Date(from).getTime())
  )
    return false;
  if (
    to &&
    (dateOnly.test(to) ? calendarDate > to : instant > new Date(to).getTime())
  )
    return false;
  return true;
}
