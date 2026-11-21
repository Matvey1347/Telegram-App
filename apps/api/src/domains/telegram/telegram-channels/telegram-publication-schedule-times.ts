import {
  utcTimeKey,
  zonedDateTimeToUtc,
} from '../telegram-ad-sales/domain/timezone';

/** Slot times are workspace-local wall-clock values and survive DST changes. */
export function publicationScheduleTimeForStorage(localTime: string) {
  return localTime;
}

export function publicationScheduleTimeForDisplay(storedTime: string) {
  return storedTime;
}

export function publicationScheduleTimeAtInstant(
  instant: Date,
  timezone: string,
) {
  return utcTimeKey(instant, timezone);
}

/** Resolves a recurring local slot to its actual instant on the requested day. */
export function publicationScheduleOccurrenceAt(
  localDate: { year: number; month: number; day: number },
  localTime: string,
  timezone: string,
) {
  const dateKey = `${String(localDate.year).padStart(4, '0')}-${String(
    localDate.month,
  ).padStart(2, '0')}-${String(localDate.day).padStart(2, '0')}`;
  return zonedDateTimeToUtc(dateKey, localTime, timezone);
}

export function publicationScheduleLocalDateFormatter(timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
export function publicationScheduleLocalDateParts(
  date: Date,
  formatter: Intl.DateTimeFormat,
) {
  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}
