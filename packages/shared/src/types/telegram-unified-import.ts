import type { TelegramContentHypothesisInput } from "./telegram-content-hypotheses";
import type { TelegramPublicationSlotKind } from "./telegram-publication-schedules";

export const TELEGRAM_UNIFIED_IMPORT_VERSION = 1 as const;

export type TelegramUnifiedImportDeleteTarget = {
  id: string;
};

export type TelegramUnifiedImportManifest = {
  version: typeof TELEGRAM_UNIFIED_IMPORT_VERSION;
  groups?: Array<{
    ref: string;
    action: "CREATE" | "UPDATE" | "DELETE";
    id?: string;
    title?: string;
    icon?: string | null;
  }>;
  hypotheses?: Array<{
    ref: string;
    action: "CREATE" | "UPDATE" | "ARCHIVE" | "DELETE";
    id?: string;
    icon?: string | null;
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
  description?: string | null;
  text?: string | null;
  imageUrls?: string[];
  scheduledAt?: string | null;
  valid: boolean;
  warnings: string[];
  errors: string[];
  status?: TelegramContentHypothesisInput["status"];
  imported?: boolean;
  approved?: boolean;
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
};
