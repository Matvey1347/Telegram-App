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

type JsonRecord = Record<string, unknown>;

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * The channel exporter commonly produces a plain array of posts. Accept it at
 * the boundary and make the equivalent v1 manifest before previewing, so the
 * canonical API keeps receiving one explicit contract.
 */
function manifestFromPostArray(
  value: unknown[],
): TelegramUnifiedImportManifest {
  const refs = new Set<string>();
  const posts = value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Публикация ${index + 1} должна быть JSON-объектом.`);
    }
    const source = item as JsonRecord;
    const title = stringValue(source.title);
    if (!title) {
      throw new Error(`У публикации ${index + 1} отсутствует title.`);
    }
    const ref = stringValue(source.ref) || `post-import-${index + 1}`;
    if (refs.has(ref)) {
      throw new Error(`Повторяющийся ref публикации: ${ref}.`);
    }
    refs.add(ref);
    const action = stringValue(source.action);
    const normalizedAction: "CREATE" | "UPDATE" | "DELETE" =
      action === "UPDATE" || action === "DELETE" ? action : "CREATE";
    return {
      ref,
      action: normalizedAction,
      ...(stringValue(source.id) ? { id: stringValue(source.id) } : {}),
      title,
      ...(typeof source.icon === "string" || source.icon === null
        ? { icon: source.icon }
        : {}),
      ...(typeof source.text === "string" || source.text === null
        ? { text: source.text }
        : {}),
      imageUrls: stringList(source.imageUrls ?? source.urls),
      imageSearch: stringList(source.imageSearch),
      ...(typeof source.groupRef === "string" || source.groupRef === null
        ? { groupRef: source.groupRef }
        : {}),
      hypothesisRefs: stringList(source.hypothesisRefs),
      imported: source.imported === true,
      approved: source.approved === true,
    };
  });
  return { version: TELEGRAM_UNIFIED_IMPORT_VERSION, posts };
}

export function parseUnifiedImportManifest(
  raw: string,
): TelegramUnifiedImportManifest {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Файл должен содержать корректный JSON.");
  }
  if (Array.isArray(value)) {
    return manifestFromPostArray(value);
  }
  if (!value || typeof value !== "object") {
    throw new Error("Корнем файла должен быть JSON-объект.");
  }
  const manifest = value as Partial<TelegramUnifiedImportManifest>;
  if (manifest.version !== TELEGRAM_UNIFIED_IMPORT_VERSION) {
    throw new Error(
      `Поддерживается только версия ${TELEGRAM_UNIFIED_IMPORT_VERSION}.`,
    );
  }
  for (const section of UNIFIED_IMPORT_SECTIONS) {
    if (manifest[section] !== undefined && !Array.isArray(manifest[section])) {
      throw new Error(`Раздел ${section} должен быть массивом.`);
    }
  }
  if (manifest.delete !== undefined) {
    if (
      !manifest.delete ||
      typeof manifest.delete !== "object" ||
      Array.isArray(manifest.delete)
    ) {
      throw new Error("Раздел delete должен быть объектом.");
    }
    for (const section of ["groups", "hypotheses", "posts"] as const) {
      if (
        manifest.delete[section] !== undefined &&
        !Array.isArray(manifest.delete[section])
      ) {
        throw new Error(`Раздел delete.${section} должен быть массивом.`);
      }
    }
  }
  return manifest as TelegramUnifiedImportManifest;
}
