export type ChannelBookingSchedule = {
  futureScheduledTotal: number;
  draftTotal?: number;
  pendingJoinRequests?: number;
  lastScheduledAt: string | null;
  nextAvailableDate?: string | null;
  bookedThroughDate?: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function calendarDayNumber(value: Date) {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
}

function calendarDate(value?: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : null;
}

export function getChannelBookingIndicator(
  schedule?: ChannelBookingSchedule,
  now = new Date(),
) {
  const nextAvailableDate = calendarDate(schedule?.nextAvailableDate);
  const bookedThroughDate = calendarDate(schedule?.bookedThroughDate);
  const date = (value: Date) =>
    value.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (nextAvailableDate) {
    const daysAhead = Math.max(
      0,
      Math.round(
        (calendarDayNumber(nextAvailableDate) - calendarDayNumber(now)) /
          DAY_MS,
      ),
    );
    return {
      label: bookedThroughDate
        ? `Booked to ${date(bookedThroughDate)} · write for ${date(nextAvailableDate)}`
        : `⚠️ Free ${date(nextAvailableDate)} · write now`,
      compactLabel: bookedThroughDate
        ? date(bookedThroughDate)
        : `Free ${date(nextAvailableDate)}`,
      tone:
        daysAhead <= 3
          ? "text-rose-300"
          : daysAhead <= 7
            ? "text-amber-300"
            : "text-neutral-500",
      daysAhead,
    };
  }
  const lastScheduledAt = schedule?.lastScheduledAt
    ? new Date(schedule.lastScheduledAt)
    : null;
  if (!lastScheduledAt || Number.isNaN(lastScheduledAt.getTime())) {
    return {
      label: "⚠️ Free today",
      compactLabel: "Free today",
      tone: "text-rose-300",
      daysAhead: 0,
    };
  }

  const daysAhead = Math.max(
    0,
    Math.round(
      (calendarDayNumber(lastScheduledAt) - calendarDayNumber(now)) / DAY_MS,
    ),
  );
  const writeFrom = new Date(lastScheduledAt);
  writeFrom.setDate(writeFrom.getDate() + 1);
  return {
    label: `Booked to ${date(lastScheduledAt)} · write from ${date(writeFrom)}`,
    compactLabel: date(lastScheduledAt),
    tone:
      daysAhead <= 3
        ? "text-rose-300"
        : daysAhead <= 7
          ? "text-amber-300"
          : "text-neutral-500",
    daysAhead,
  };
}
