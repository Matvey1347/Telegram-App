import { utcTimeKey, zonedDateTimeToUtc } from '../telegram-ad-sales/domain/timezone';

function dateKeyInTimezone(timezone: string, reference: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(reference);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** Converts a workspace-local editor value to the canonical UTC slot time. */
export function publicationScheduleTimeToUtc(
  localTime: string,
  timezone: string,
  reference = new Date(),
) {
  return utcTimeKey(
    zonedDateTimeToUtc(dateKeyInTimezone(timezone, reference), localTime, timezone),
    'UTC',
  );
}

/** Presents the canonical UTC slot time in the workspace timezone. */
export function publicationScheduleTimeInTimezone(
  utcTime: string,
  timezone: string,
  reference = new Date(),
) {
  const [hour, minute] = utcTime.split(':').map(Number);
  const [year, month, day] = dateKeyInTimezone(timezone, reference)
    .split('-')
    .map(Number);
  return utcTimeKey(new Date(Date.UTC(year, month - 1, day, hour, minute)), timezone);
}

/** A UTC slot recurs at the same instant-of-day; its displayed day is workspace-local. */
export function publicationScheduleOccurrenceAt(
  localDate: { year: number; month: number; day: number },
  utcTime: string,
) {
  const [hour, minute] = utcTime.split(':').map(Number);
  return new Date(
    Date.UTC(localDate.year, localDate.month - 1, localDate.day, hour, minute),
  );
}
