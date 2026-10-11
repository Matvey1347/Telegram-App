import type { TelegramChannelTrafficAttributionPreview } from "@telegram-system/shared";

export function formatTrafficAttributionPeriod(
  period: TelegramChannelTrafficAttributionPreview["attributionPeriod"],
) {
  if (!period?.startsAt) return null;
  const startsAt = new Date(period.startsAt);
  const endsAt = period.endsAt ? new Date(period.endsAt) : null;
  if (
    Number.isNaN(startsAt.getTime()) ||
    (endsAt && Number.isNaN(endsAt.getTime()))
  )
    return null;
  const shortFormatter = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  });
  const fullFormatter = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return {
    label: endsAt
      ? `${shortFormatter.format(startsAt)} – ${shortFormatter.format(endsAt)}`
      : `Since ${shortFormatter.format(startsAt)}`,
    title: endsAt
      ? `Attribution period: ${fullFormatter.format(startsAt)} – ${fullFormatter.format(endsAt)}`
      : `Attribution period: ${fullFormatter.format(startsAt)} – now`,
  };
}
