import type { TelegramContentHypothesisInput } from "./telegram-content-hypotheses";
import type { TelegramPublicationSlotKind } from "./telegram-publication-schedules";

export const TELEGRAM_UNIFIED_IMPORT_VERSION = 1 as const;

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
    action: "CREATE" | "UPDATE" | "ARCHIVE";
    id?: string;
    value?: TelegramContentHypothesisInput;
  }>;
  posts?: Array<{
    ref: string;
    action: "CREATE" | "UPDATE" | "DELETE";
    id?: string;
    title?: string;
    text?: string | null;
    imageUrls?: string[];
    groupRef?: string | null;
    hypothesisRefs?: string[];
  }>;
  schedule?: Array<{
    postRef: string;
    slotId: string;
    scheduledAt: string;
    slotKind?: TelegramPublicationSlotKind;
  }>;
};

export type TelegramUnifiedImportPreviewItem = {
  ref: string;
  action: string;
  label: string;
  valid: boolean;
  warnings: string[];
  errors: string[];
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
  failed: Array<{ ref: string; error: string }>;
};

export type TelegramUnifiedImportResult = {
  manifestHash: string;
  sections: TelegramUnifiedImportSectionResult[];
};
