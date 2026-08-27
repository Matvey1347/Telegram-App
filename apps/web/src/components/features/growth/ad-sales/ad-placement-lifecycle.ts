import type { TelegramAdSalePlacement } from "@telegram-system/shared";
import { formatDateTime } from "@/lib/date-format";

function durationLabel(remaining: number) {
  const seconds = Math.floor(remaining / 1_000);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  return `${days ? `${days}d ` : ""}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function placementTimer(
  placement: TelegramAdSalePlacement,
  now: number,
): { phase: "publication" | "deletion" | "complete"; label: string } | null {
  if (placement.deletedAt) {
    return { phase: "complete", label: "Automatically deleted" };
  }
  if (placement.managedPost?.telegramRemoteStatus === "MISSING") {
    return { phase: "complete", label: "Post deleted" };
  }
  if (!placement.publishedAt) {
    const remaining = new Date(placement.scheduledAt).getTime() - now;
    return {
      phase: "publication",
      label:
        remaining > 0
          ? `Publishes in ${durationLabel(remaining)}`
          : "Publication pending",
    };
  }
  if (!placement.plannedDeleteAt) return null;
  const remaining = new Date(placement.plannedDeleteAt).getTime() - now;
  return {
    phase: "deletion",
    label:
      remaining > 0
        ? `Auto-delete in ${durationLabel(remaining)}`
        : "Automatic deletion pending",
  };
}

export function placementDeletionLabel(
  placement: TelegramAdSalePlacement,
  now: number,
) {
  const timer = placementTimer(placement, now);
  if (!timer) return null;
  return timer.label
    .replace(/^Publishes in /, "")
    .replace(/^Auto-delete in /, "");
}

export function placementRunWindow(placement: TelegramAdSalePlacement) {
  if (!placement.publishedAt || !placement.plannedDeleteAt) return null;
  const lifecycleStartedAt = placement.publishedAt;
  const lifecycleEndedAt = placement.deletedAt ?? placement.plannedDeleteAt;
  return `${formatDateTime(lifecycleStartedAt)} → ${formatDateTime(lifecycleEndedAt)}`;
}

export function placementFormatLabel(placement: TelegramAdSalePlacement) {
  const topMinutes = placement.topDurationMinutesSnapshot;
  const feedHours = placement.feedDurationHoursSnapshot;
  if (topMinutes == null && feedHours == null) {
    return placement.isPermanentSnapshot ? "Permanent" : null;
  }
  const top =
    topMinutes == null
      ? null
      : topMinutes % 60 === 0
        ? String(topMinutes / 60)
        : `${topMinutes}m`;
  const feed = placement.isPermanentSnapshot
    ? "∞"
    : feedHours == null
      ? null
      : String(feedHours);
  return top && feed ? `${top}/${feed}` : (top ?? feed);
}
