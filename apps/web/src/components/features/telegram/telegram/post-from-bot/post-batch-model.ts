import type {
  TelegramPostBatch,
  TelegramPostBatchAction,
  TelegramPostBatchChannelOverride,
  TelegramPostBatchLifetimeHours,
  TelegramPostBatchPost,
  UpdateTelegramPostBatchPayload,
} from "@telegram-system/shared";

export function localScheduleParts(value: string | null) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return { date: "", time: "" };
  return {
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
  };
}

export function scheduleIso(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    return null;
  const value = new Date(`${date}T${time}:00`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

export function defaultScheduleIso() {
  const next = new Date(Date.now() + 60 * 60 * 1_000);
  next.setMinutes(Math.ceil(next.getMinutes() / 5) * 5, 0, 0);
  return next.toISOString();
}

export function setPostSchedule(
  post: TelegramPostBatchPost,
  action: TelegramPostBatchAction,
) {
  return {
    ...post,
    action,
    scheduledAt:
      action === "SCHEDULE" ? (post.scheduledAt ?? defaultScheduleIso()) : null,
  };
}

export function setOverrideSchedule(
  override: TelegramPostBatchChannelOverride,
  action: TelegramPostBatchAction,
) {
  return {
    ...override,
    action,
    scheduledAt:
      action === "SCHEDULE"
        ? (override.scheduledAt ?? defaultScheduleIso())
        : null,
  };
}

export function applyLifetime(
  batch: TelegramPostBatch,
  lifetime: TelegramPostBatchLifetimeHours,
) {
  return {
    ...batch,
    defaultDeleteAfterHours: lifetime,
    posts: batch.posts.map((post) => ({
      ...post,
      deleteAfterHours: lifetime,
    })),
  };
}

export function selectBatchChannels(
  batch: TelegramPostBatch,
  channelIds: string[],
) {
  const selectedChannelIds = new Set(channelIds);
  return {
    ...batch,
    channelIds,
    posts: batch.posts.map((post) => ({
      ...post,
      channelOverrides: post.channelOverrides.filter((override) =>
        selectedChannelIds.has(override.telegramChannelId),
      ),
    })),
  };
}

export function updatePayload(
  batch: TelegramPostBatch,
): UpdateTelegramPostBatchPayload {
  return {
    expectedVersion: batch.version,
    title: batch.title.trim(),
    channelIds: batch.channelIds,
    defaultDeleteAfterHours: batch.defaultDeleteAfterHours,
    posts: batch.posts.map((post) => ({
      id: post.id,
      title: post.title,
      text: post.text,
      imageUrls: post.imageUrls,
      mediaItems: post.mediaItems,
      buttonRows: post.buttonRows,
      action: post.action,
      scheduledAt: post.scheduledAt,
      deleteAfterHours: post.deleteAfterHours,
      longTextMode: post.longTextMode,
      channelOverrides: post.channelOverrides,
    })),
  };
}

export function validateBatch(batch: TelegramPostBatch) {
  if (!batch.title.trim()) return "title";
  if (!batch.channelIds.length) return "channels";
  for (const post of batch.posts) {
    if (!post.title.trim()) return "postTitle";
    if (post.action === "SCHEDULE" && !post.scheduledAt) return "schedule";
    if (
      post.channelOverrides.some(
        (override) => override.action === "SCHEDULE" && !override.scheduledAt,
      )
    )
      return "schedule";
  }
  return null;
}
