import type {
  TelegramManagedPostsImportProgressItem,
  TelegramManagedPostsImportResult,
  TelegramManagedPostsImportRow,
  ResolvedEmoji,
} from "@/lib/api";

export type ImportRowTab = "new" | "approved" | "imported";

export const gptImportPromptFormat = `Ask GPT to return only a JSON array. Each array item is one post:

[
  {
    "title": "Post title",
    "text": "Telegram-ready post text",
    "icon": "🔥",
    "urls": ["https://example.com/1.png"],
    "groupId": null,
    "scheduledAt": null,
    "imported": false,
    "approved": false,
    "imageSearch": ["mountain rest", "quiet lake", "empty viewpoint"]
  }
]

Required: \`title\`. New generated rows must use \`imported: false\` and \`approved: false\`. Use an exact groupId from the GPT context, or \`null\` for no group. \`scheduledAt\` is an ISO timestamp or null. \`imageSearch\` is shown only in this import preview for easy copying and is not saved to posts.`;

export type EditableImportRow = {
  title: string;
  text: string;
  icon: string;
  urlsText: string;
  imageSearchText: string;
  groupId: string | null | undefined;
  scheduledAt: string | null;
  imported: boolean;
  approved: boolean;
};

type ParsedImportRow = Record<string, unknown>;

function detectDelimiter(content: string, fileName?: string | null) {
  const lowerFileName = fileName?.toLocaleLowerCase() ?? "";
  if (lowerFileName.endsWith(".tsv")) return "\t";
  if (lowerFileName.endsWith(".csv")) return ",";
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  if (firstLine.includes("\t")) return "\t";
  if (firstLine.includes(",")) return ",";
  return null;
}

function parseDelimitedLine(line: string, delimiter: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values.map((value) => value.replace(/\r/g, "").trim());
}

function parseDelimitedRecords(content: string, delimiter: string) {
  const records: string[][] = [];
  let current = "";
  let inQuotes = false;
  let recordHasContent = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === '"') {
      current += char;
      recordHasContent = true;
      if (inQuotes && next === '"') {
        current += next;
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      if (recordHasContent || current.trim()) {
        records.push(parseDelimitedLine(current, delimiter));
      }
      current = "";
      recordHasContent = false;
      continue;
    }
    current += char;
    if (!/\s/.test(char)) recordHasContent = true;
  }
  if (recordHasContent || current.trim()) {
    records.push(parseDelimitedLine(current, delimiter));
  }
  return records;
}

function parseDelimitedRows(content: string, delimiter: string) {
  const records = parseDelimitedRecords(content, delimiter);
  if (!records.length) return [];
  const headerCells = records[0].map((cell) => cell.toLocaleLowerCase());
  const hasHeader = headerCells.some((cell) =>
    [
      "title",
      "text",
      "icon",
      "emoji",
      "icontext",
      "urls",
      "imagesearch",
      "groupid",
      "scheduledat",
      "approved",
      "imported",
    ].includes(cell.replace(/\s+/g, "")),
  );
  const headers = hasHeader ? headerCells : ["title", "text", "urls", "icon"];
  const startIndex = hasHeader ? 1 : 0;
  return records.slice(startIndex).map((cells) => {
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      row[header.replace(/\s+/g, "")] = cells[index] ?? "";
    });
    return row;
  });
}

function parsePlainTextRows(content: string) {
  return content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const [title = "", ...rest] = lines;
      const urlLines = rest.filter((line) => /^urls?:/i.test(line));
      const bodyLines = rest.filter((line) => !/^urls?:/i.test(line));
      return {
        title,
        text: bodyLines.join("\n"),
        urls: urlLines
          .flatMap((line) => line.replace(/^urls?:/i, "").split(/[,\s]+/))
          .map((value) => value.trim())
          .filter(Boolean),
      };
    });
}

function parseJsonRows(content: string): ParsedImportRow[] | null {
  const trimmed = content.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is ParsedImportRow =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      );
    }
    if (parsed && typeof parsed === "object") {
      if ("title" in parsed || "text" in parsed) return [parsed as ParsedImportRow];
      const rows = (parsed as { posts?: unknown }).posts;
      if (Array.isArray(rows)) {
        return rows.filter(
          (item): item is ParsedImportRow =>
            Boolean(item) && typeof item === "object" && !Array.isArray(item),
        );
      }
    }
  } catch {
    return null;
  }
  return null;
}

function importValueToString(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function importIconPresentation(value: string): ResolvedEmoji | null {
  const icon = value.trim();
  if (!icon || !/\p{Extended_Pictographic}/u.test(icon)) return null;
  return { type: "unicode", value: icon, name: icon };
}

export function cleanRepeatedMarkdownLinks(value: string) {
  return value.replace(
    /\[\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\]\(\2\)/gi,
    "[$1]($2)",
  );
}

function cleanImportImageUrl(value: string) {
  let nextValue = value.trim().replace(/^["']|["']$/g, "");
  const markdownLink = nextValue.match(/\]\((https?:\/\/[^)\s]+)\)/i);
  if (markdownLink?.[1]) nextValue = markdownLink[1];
  const bareUrl = nextValue.match(/https?:\/\/[^\s"'\])]+/i);
  return bareUrl?.[0] ?? nextValue;
}

function importUrlsToArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(importUrlsToArray).map(cleanImportImageUrl).filter(Boolean);
  }
  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n|,\s*(?=https?:\/\/)/i)
    .map(cleanImportImageUrl)
    .filter(Boolean);
}

export function importImageSearchToArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap(importImageSearchToArray)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value !== "string") return [];
  return value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

export function urlsTextToArray(value: string) {
  return value.split(/\r?\n/).map(cleanImportImageUrl).filter(Boolean);
}

export function normalizeImportRows(
  content: string,
  fileName?: string | null,
): TelegramManagedPostsImportRow[] {
  const jsonRows = parseJsonRows(content);
  const rows: ParsedImportRow[] = jsonRows ?? (
    detectDelimiter(content, fileName)
      ? parseDelimitedRows(content, detectDelimiter(content, fileName) as string)
      : parsePlainTextRows(content)
  );
  return rows.map((row) => ({
    title: row.title,
    text: row.text,
    icon: row.icon,
    emoji: row.emoji,
    iconText: row.icontext ?? row.iconText,
    urls: row.urls ?? row.imageUrls ?? row.images,
    imageSearch: row.imagesearch ?? row.imageSearch,
    groupId: row.groupid ?? row.groupId,
    scheduledAt: row.scheduledat ?? row.scheduledAt,
    imported: row.imported,
    approved: row.approved,
  }));
}

export function rowToEditable(row: TelegramManagedPostsImportRow): EditableImportRow {
  const icon =
    importValueToString(row.icon) ||
    importValueToString(row.emoji) ||
    importValueToString(row.iconText);
  return {
    title: cleanRepeatedMarkdownLinks(importValueToString(row.title)),
    text: cleanRepeatedMarkdownLinks(importValueToString(row.text)),
    icon,
    urlsText: importUrlsToArray(row.urls ?? row.imageUrls ?? row.images).join("\n"),
    imageSearchText: importImageSearchToArray(row.imageSearch).join("\n"),
    groupId:
      row.groupId === undefined
        ? undefined
        : typeof row.groupId === "string"
          ? row.groupId
          : null,
    scheduledAt: typeof row.scheduledAt === "string" ? row.scheduledAt : null,
    imported: row.imported === true || row.imported === "true",
    approved: row.approved === true || row.approved === "true",
  };
}

export function editableRowToImportRow(
  row: EditableImportRow,
): TelegramManagedPostsImportRow {
  return {
    title: row.title,
    text: row.text,
    icon: row.icon,
    urls: urlsTextToArray(row.urlsText),
    groupId: row.groupId,
    scheduledAt: row.scheduledAt,
    imported: row.imported,
    approved: row.approved,
  };
}

export function editableRowsToJsonContent(rows: EditableImportRow[]) {
  return JSON.stringify(
    rows.map((row) => {
      const imageSearch = importImageSearchToArray(row.imageSearchText);
      return {
        title: row.title,
        text: row.text,
        icon: row.icon,
        urls: urlsTextToArray(row.urlsText),
        ...(row.groupId !== undefined ? { groupId: row.groupId } : {}),
        scheduledAt: row.scheduledAt,
        imported: row.imported,
        approved: row.approved,
        ...(imageSearch.length ? { imageSearch } : {}),
      };
    }),
    null,
    2,
  );
}

export function removeEditableImportRow(rows: EditableImportRow[], index: number) {
  return rows.filter((_, rowIndex) => rowIndex !== index);
}

export function importRowTab(row: EditableImportRow): ImportRowTab {
  if (row.imported) return "imported";
  if (row.approved) return "approved";
  return "new";
}

export function rowIndicesForTab(rows: EditableImportRow[], tab: ImportRowTab) {
  return rows.flatMap((row, index) => (importRowTab(row) === tab ? [index] : []));
}

export function isSuccessfulImportStatus(
  status: TelegramManagedPostsImportProgressItem["status"],
) {
  return status === "created" || status === "scheduled" || status === "alreadyExists";
}

export function isFailedImportStatus(
  status: TelegramManagedPostsImportProgressItem["status"],
) {
  return status === "failed" || status === "skipped" || status === "scheduleFailed";
}

export function summarizeImportProgress(
  rows: Array<Pick<TelegramManagedPostsImportProgressItem, "status">>,
) {
  return {
    successful: rows.filter((row) => isSuccessfulImportStatus(row.status)).length,
    failed: rows.filter((row) => isFailedImportStatus(row.status)).length,
  };
}

export function summarizeResult(result: TelegramManagedPostsImportResult | null) {
  if (!result) return { created: 0, skipped: 0, errors: 0 };
  const progress = summarizeImportProgress(result.rows);
  return {
    created: progress.successful,
    skipped: result.rows.filter((row) => row.status === "skipped").length,
    errors: progress.failed,
  };
}
