import {
  TELEGRAM_UNIFIED_IMPORT_VERSION,
  type TelegramUnifiedImportManifest,
} from "@telegram-system/shared";

export const UNIFIED_IMPORT_SECTIONS = [
  "groups",
  "hypotheses",
  "posts",
  "schedule",
] as const;

export function parseUnifiedImportManifest(raw: string): TelegramUnifiedImportManifest {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Файл должен содержать корректный JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Корнем файла должен быть JSON-объект.");
  }
  const manifest = value as Partial<TelegramUnifiedImportManifest>;
  if (manifest.version !== TELEGRAM_UNIFIED_IMPORT_VERSION) {
    throw new Error(`Поддерживается только версия ${TELEGRAM_UNIFIED_IMPORT_VERSION}.`);
  }
  for (const section of UNIFIED_IMPORT_SECTIONS) {
    if (manifest[section] !== undefined && !Array.isArray(manifest[section])) {
      throw new Error(`Раздел ${section} должен быть массивом.`);
    }
  }
  return manifest as TelegramUnifiedImportManifest;
}

export const unifiedImportPrompt = `Создай один JSON-манифест TelegramUnifiedImport версии 1.
Корневые разделы: groups, hypotheses, posts, schedule. Каждый объект имеет стабильный ref,
чтобы другие разделы могли ссылаться на него. Порядок применения: группы, гипотезы,
посты (CREATE/UPDATE/DELETE), затем schedule. Не выдумывай id существующих объектов.
Для groups используй action CREATE|UPDATE|DELETE; для hypotheses CREATE|UPDATE|ARCHIVE;
для posts CREATE|UPDATE|DELETE. schedule содержит postRef, slotId, scheduledAt ISO-8601
и необязательный slotKind. Верни только JSON без markdown.`;
