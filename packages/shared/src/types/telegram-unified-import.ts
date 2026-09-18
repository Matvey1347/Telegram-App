import type { TelegramContentHypothesisInput } from "./telegram-content-hypotheses";
import type { TelegramPublicationSlotKind } from "./telegram-publication-schedules";
import type { ResolvedEmoji } from "./resolved-emoji";

export const TELEGRAM_UNIFIED_IMPORT_VERSION = 1 as const;

export type TelegramUnifiedImportDeleteTarget = {
  id: string;
  imported?: boolean;
};

export type TelegramUnifiedImportManifest = {
  version: typeof TELEGRAM_UNIFIED_IMPORT_VERSION;
  groups?: Array<{
    ref: string;
    action: "CREATE" | "UPDATE" | "DELETE";
    id?: string;
    title?: string;
    icon?: string | null;
    imported?: boolean;
  }>;
  hypotheses?: Array<{
    ref: string;
    action: "CREATE" | "UPDATE" | "ARCHIVE" | "DELETE";
    id?: string;
    icon?: string | null;
    imported?: boolean;
    value?: Omit<TelegramContentHypothesisInput, "iconId">;
  }>;
  posts?: Array<{
    ref: string;
    action: "CREATE" | "UPDATE" | "DELETE";
    id?: string;
    title?: string;
    icon?: string | null;
    text?: string | null;
    imageUrls?: string[];
    imageSearch?: string[];
    groupRef?: string | null;
    hypothesisRefs?: string[];
    imported?: boolean;
    approved?: boolean;
  }>;
  schedule?: Array<{
    action?: "SCHEDULE" | "UNSCHEDULE";
    postRef?: string;
    postId?: string;
    slotId?: string;
    scheduledAt?: string;
    slotKind?: TelegramPublicationSlotKind;
    imported?: boolean;
  }>;
  delete?: {
    groups?: TelegramUnifiedImportDeleteTarget[];
    hypotheses?: TelegramUnifiedImportDeleteTarget[];
    posts?: TelegramUnifiedImportDeleteTarget[];
  };
};

export type TelegramUnifiedImportPreviewItem = {
  ref: string;
  entityId?: string;
  action: string;
  label: string;
  icon?: string | null;
  iconPresentation?: ResolvedEmoji | null;
  description?: string | null;
  text?: string | null;
  imageUrls?: string[];
  scheduledAt?: string | null;
  slotId?: string | null;
  slotKind?: TelegramPublicationSlotKind | null;
  slotTitle?: string | null;
  valid: boolean;
  warnings: string[];
  errors: string[];
  status?: TelegramContentHypothesisInput["status"];
  imported?: boolean;
  approved?: boolean;
  changes?: Array<{
    field: string;
    before: string | null;
    after: string | null;
  }>;
};

export type TelegramUnifiedImportPreviewSection = {
  key: "groups" | "hypotheses" | "posts" | "schedule";
  items: TelegramUnifiedImportPreviewItem[];
  validCount: number;
  invalidCount: number;
};

export type TelegramUnifiedImportPreview = {
  version: typeof TELEGRAM_UNIFIED_IMPORT_VERSION;
  manifestHash: string;
  valid: boolean;
  sections: TelegramUnifiedImportPreviewSection[];
};

export type TelegramUnifiedImportSectionResult = {
  key: TelegramUnifiedImportPreviewSection["key"];
  created: number;
  updated: number;
  deleted: number;
  scheduled: number;
  unscheduled: number;
  failed: Array<{ ref: string; error: string }>;
};

export type TelegramUnifiedImportResult = {
  manifestHash: string;
  sections: TelegramUnifiedImportSectionResult[];
  /** The same manifest annotated with the operations that were applied. */
  manifest: TelegramUnifiedImportManifest;
};

export type TelegramUnifiedImportProgressSection =
  | "groups"
  | "hypotheses"
  | "posts"
  | "schedule"
  | "deletions";

export type TelegramUnifiedImportProgressItem = {
  kind: "phase" | "operation";
  section: TelegramUnifiedImportProgressSection;
  status: "started" | "completed" | "success" | "failed" | "skipped";
  action?:
    | "CREATE"
    | "UPDATE"
    | "ARCHIVE"
    | "DELETE"
    | "SCHEDULE"
    | "UNSCHEDULE";
  ref?: string;
  label?: string;
  message: string;
};
