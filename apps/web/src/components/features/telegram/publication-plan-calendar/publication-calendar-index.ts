import type { TelegramPublicationPlanCalendarEvent } from "@telegram-system/shared";

export type PublicationCalendarSlotRow = {
  slotId: string;
  scheduledAt: string;
  title: string;
  time: string;
};

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const timeFormatters = new Map<string, Intl.DateTimeFormat>();

export function calendarDateKey(value: string, timezone: string) {
  let formatter = dateFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    if (dateFormatters.size >= 32) dateFormatters.clear();
    dateFormatters.set(timezone, formatter);
  }
  return formatter.format(new Date(value));
}

export function calendarDisplayTime(value: string, timezone: string) {
  let formatter = timeFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    if (timeFormatters.size >= 32) timeFormatters.clear();
    timeFormatters.set(timezone, formatter);
  }
  return formatter.format(new Date(value));
}

function minuteKey(value: string) {
  return new Date(value).toISOString().slice(0, 16);
}

export function eventMatchesPublicationSlot(
  event: TelegramPublicationPlanCalendarEvent,
  slot: PublicationCalendarSlotRow,
  timezone: string,
) {
  if (minuteKey(event.scheduledAt) === minuteKey(slot.scheduledAt)) return true;

  // Slot occurrences use a canonical UTC time; external events use their exact
  // local datetime. Match the shown time across DST transitions.
  return (
    calendarDateKey(event.scheduledAt, timezone) === calendarDateKey(slot.scheduledAt, timezone) &&
    calendarDisplayTime(event.scheduledAt, timezone) === slot.time
  );
}

function relevantEvents(events: TelegramPublicationPlanCalendarEvent[]) {
  const unique = new Map<string, TelegramPublicationPlanCalendarEvent>();
  for (const event of events) {
    if (event.kind !== "CONTENT") unique.set(`${event.kind}:${event.title}`, event);
  }
  return [...unique.values()];
}

export function indexPublicationCalendarItems(
  slots: PublicationCalendarSlotRow[],
  events: TelegramPublicationPlanCalendarEvent[],
  timezone: string,
) {
  const slotsByDay = new Map<string, PublicationCalendarSlotRow[]>();
  const eventsByDay = new Map<string, TelegramPublicationPlanCalendarEvent[]>();
  for (const slot of slots) {
    const key = calendarDateKey(slot.scheduledAt, timezone);
    const daySlots = slotsByDay.get(key) ?? [];
    daySlots.push(slot);
    slotsByDay.set(key, daySlots);
  }
  for (const event of events) {
    const key = calendarDateKey(event.scheduledAt, timezone);
    const dayEvents = eventsByDay.get(key) ?? [];
    dayEvents.push(event);
    eventsByDay.set(key, dayEvents);
  }

  const days = new Map<
    string,
    {
      slots: PublicationCalendarSlotRow[];
      outsideEvents: TelegramPublicationPlanCalendarEvent[];
      eventsBySlot: Map<string, TelegramPublicationPlanCalendarEvent[]>;
    }
  >();
  for (const dayKey of new Set([...slotsByDay.keys(), ...eventsByDay.keys()])) {
    const daySlots = (slotsByDay.get(dayKey) ?? []).sort((left, right) =>
      left.scheduledAt.localeCompare(right.scheduledAt),
    );
    const dayEvents = eventsByDay.get(dayKey) ?? [];
    const matchedIds = new Set<string>();
    const eventsBySlot = new Map<string, TelegramPublicationPlanCalendarEvent[]>();
    for (const slot of daySlots) {
      const key = `${slot.slotId}:${slot.scheduledAt}`;
      const matchedEvents = dayEvents.filter(
        (event) =>
          event.slotId === slot.slotId ||
          (event.slotId === null && eventMatchesPublicationSlot(event, slot, timezone)),
      );
      matchedEvents.forEach((event) => matchedIds.add(event.id));
      eventsBySlot.set(key, relevantEvents(matchedEvents));
    }
    days.set(dayKey, {
      slots: daySlots,
      outsideEvents: relevantEvents(dayEvents.filter((event) => !matchedIds.has(event.id))),
      eventsBySlot,
    });
  }
  return days;
}
