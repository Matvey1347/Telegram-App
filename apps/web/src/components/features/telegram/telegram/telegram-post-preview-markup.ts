import { normalizeTelegramManagedFormattingRuns } from "@telegram-system/shared";

export const escapeTelegramPreviewHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function renderTelegramPreviewInlineMarkup(value: string) {
  const escapedTokens: string[] = [];
  const protectedValue = value.replace(
    /\\([\\`*_[\]()#+~|>:])/g,
    (_match, literal: string) => {
      const index = escapedTokens.push(escapeTelegramPreviewHtml(literal)) - 1;
      return `\uE100${index}\uE101`;
    },
  );
  const normalized = normalizeTelegramManagedFormattingRuns(protectedValue);
  return escapeTelegramPreviewHtml(normalized)
    .replace(/\*\*([\s\S]+?)\*\*/g, "<b>$1</b>")
    .replace(/__([\s\S]+?)__/g, "<i>$1</i>")
    .replace(/\+\+([\s\S]+?)\+\+/g, "<u>$1</u>")
    .replace(/~~([\s\S]+?)~~/g, "<s>$1</s>")
    .replace(/\|\|([\s\S]+?)\|\|/g, '<span class="tg-spoiler">$1</span>')
    .replace(
      /(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu,
      '$1<span class="tg-hashtag">#$2</span>',
    )
    .replace(
      /\uE100(\d+)\uE101/g,
      (_match, index: string) => escapedTokens[Number(index)] ?? "",
    );
}

/** Visible Telegram text, excluding URLs and managed-markup delimiters. */
export function telegramPreviewPlainText(raw: string) {
  const literals: string[] = [];
  let value = raw.replace(
    /\\([\\`*_[\]()#+~|>:])/g,
    (_match, literal: string) => {
      const index = literals.push(literal) - 1;
      return `\uE200${index}\uE201`;
    },
  );
  value = value.replace(
    /```([^\n\r`]*)((?:\r\n|[\n\r])?)([\s\S]*?)```/g,
    (_match, info: string, lineBreak: string, code: string) =>
      info.trim() ? code : `${info}${lineBreak}${code}`,
  );
  value = value.replace(/`([^`\n]+)`/g, "$1");
  for (let pass = 0; pass < 4; pass += 1) {
    const next = value.replace(
      /!?\[([^\]]*)\]\((?:https?:\/\/|tg:\/\/)[^\s)]*(?:%28[^\s)]*%29[^\s)]*)?\)/gi,
      "$1",
    );
    if (next === value) break;
    value = next;
  }
  value = value
    .replace(/^:::(?:quote|pullquote|table)(?:[^\n]*)$/gm, "")
    .replace(/^:::$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>>?\s?/gm, "")
    .replace(/\*\*|__|\+\+|~~|\|\|/g, "")
    .replace(
      /\uE200(\d+)\uE201/g,
      (_match, index: string) => literals[Number(index)] ?? "",
    );
  return value;
}
