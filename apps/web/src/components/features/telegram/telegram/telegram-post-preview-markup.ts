export const escapeTelegramPreviewHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function renderTelegramPreviewInlineMarkup(value: string) {
  return escapeTelegramPreviewHtml(value)
    .replace(/\*\*([^\n]+?)\*\*/g, "<b>$1</b>")
    .replace(/__([^\n]+?)__/g, "<i>$1</i>")
    .replace(/\+\+([^\n]+?)\+\+/g, "<u>$1</u>")
    .replace(/~~([^\n]+?)~~/g, "<s>$1</s>")
    .replace(/\|\|([^\n]+?)\|\|/g, '<span class="tg-spoiler">$1</span>')
    .replace(
      /(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu,
      '$1<span class="tg-hashtag">#$2</span>',
    );
}
