import type { TelegramContentHypothesisStatus } from "@telegram-system/shared";

export const CONTENT_HYPOTHESIS_STATUSES: TelegramContentHypothesisStatus[] = [
  "ACTIVE",
  "SUCCESSFUL",
  "FAILED",
  "ARCHIVED",
];

export const CONTENT_HYPOTHESIS_STATUS_TONE: Record<
  TelegramContentHypothesisStatus,
  string
> = {
  ACTIVE: "border-blue-700 bg-blue-950/60 text-blue-200",
  SUCCESSFUL: "border-emerald-700 bg-emerald-950/60 text-emerald-200",
  FAILED: "border-rose-700 bg-rose-950/60 text-rose-200",
  ARCHIVED: "border-amber-800 bg-amber-950/50 text-amber-200",
};
