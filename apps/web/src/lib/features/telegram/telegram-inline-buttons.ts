import type { TelegramPostButtonRows } from "@telegram-system/shared";

/** Keeps incomplete inline-keyboard drafts out of mutation and preview requests. */
export function hasInvalidTelegramInlineButtons(
  rows: TelegramPostButtonRows,
) {
  return rows.some((row) =>
    row.some((button) => {
      const text = button.text.trim();
      const url = button.url.trim();
      if (!text && !url) return false;
      if (!text || !url) return true;
      try {
        return !["http:", "https:", "tg:"].includes(new URL(url).protocol);
      } catch {
        return true;
      }
    }),
  );
}
