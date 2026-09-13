export type TelegramPostMediaKind = "PHOTO" | "VIDEO" | "ANIMATION";

export type TelegramPostMediaItem = {
  kind: TelegramPostMediaKind;
  url: string;
  mimeType?: string | null;
  fileName?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  sourceMessageId?: number | null;
};

const photoExtensions = new Set([
  "avif",
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "png",
  "webp",
]);
const videoExtensions = new Set(["m4v", "mov", "mp4", "webm"]);

/**
 * Resolve a direct media URL without asking the user to understand Telegram's
 * transport types. MIME metadata wins; common CDN filename/format query
 * parameters are used when the URL path itself has no extension.
 */
export function inferTelegramPostMediaKind(
  value: string,
  mimeType?: string | null,
): TelegramPostMediaKind | null {
  const mime = mimeType?.toLowerCase().split(";", 1)[0]?.trim();
  if (mime === "image/gif") return "ANIMATION";
  if (mime?.startsWith("video/")) return "VIDEO";
  if (mime?.startsWith("image/")) return "PHOTO";

  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const pathParts = url.pathname.split("/");
    const candidates = [
      pathParts[pathParts.length - 1] ?? "",
      url.searchParams.get("filename") ?? "",
      url.searchParams.get("file") ?? "",
      url.searchParams.get("format") ?? "",
      url.searchParams.get("fm") ?? "",
      url.searchParams.get("ext") ?? "",
    ];
    for (const candidate of candidates) {
      const extension = candidate
        .toLowerCase()
        .replace(/^.*\./, "")
        .replace(/[^a-z0-9].*$/, "");
      if (extension === "gif") return "ANIMATION";
      if (videoExtensions.has(extension)) return "VIDEO";
      if (photoExtensions.has(extension)) return "PHOTO";
    }
    return null;
  } catch {
    return null;
  }
}

export function normalizeTelegramPostMediaItems(
  value: unknown,
  legacyImageUrls: unknown = [],
): TelegramPostMediaItem[] {
  const items = Array.isArray(value)
    ? value.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const item = candidate as Record<string, unknown>;
        const kind = item.kind;
        const url = typeof item.url === "string" ? item.url.trim() : "";
        if (
          !url ||
          (kind !== "PHOTO" && kind !== "VIDEO" && kind !== "ANIMATION")
        ) {
          return [];
        }
        return [
          {
            kind,
            url,
            ...(typeof item.mimeType === "string"
              ? { mimeType: item.mimeType }
              : {}),
            ...(typeof item.fileName === "string"
              ? { fileName: item.fileName }
              : {}),
            ...(typeof item.width === "number" ? { width: item.width } : {}),
            ...(typeof item.height === "number" ? { height: item.height } : {}),
            ...(typeof item.durationSeconds === "number"
              ? { durationSeconds: item.durationSeconds }
              : {}),
            ...(typeof item.sourceMessageId === "number"
              ? { sourceMessageId: item.sourceMessageId }
              : {}),
          } satisfies TelegramPostMediaItem,
        ];
      })
    : [];
  if (items.length) return items;
  return Array.isArray(legacyImageUrls)
    ? legacyImageUrls.flatMap((candidate) => {
        const url = typeof candidate === "string" ? candidate.trim() : "";
        return url ? [{ kind: "PHOTO" as const, url }] : [];
      })
    : [];
}

export function telegramPostPhotoUrls(items: TelegramPostMediaItem[]) {
  return items.filter((item) => item.kind === "PHOTO").map((item) => item.url);
}
