import type { TelegramPostBatchLifetimeHours } from "@telegram-system/shared";

export const POST_BATCH_FORMAT_OPTIONS = [
  { value: "24", label: "1/24" },
  { value: "48", label: "2/48" },
  { value: "72", label: "3/72" },
  { value: "permanent", label: "No auto-delete" },
] as const;

export function postBatchFormatValue(
  lifetime: TelegramPostBatchLifetimeHours,
) {
  return lifetime?.toString() ?? "permanent";
}

export function postBatchLifetimeFromFormat(
  value: string,
): TelegramPostBatchLifetimeHours {
  return value === "permanent" ? null : (Number(value) as 24 | 48 | 72);
}

export function postBatchFormatLabel(
  lifetime: TelegramPostBatchLifetimeHours,
) {
  return (
    POST_BATCH_FORMAT_OPTIONS.find(
      (option) => option.value === postBatchFormatValue(lifetime),
    )?.label ?? "No auto-delete"
  );
}
