const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function normalizeTelegramFormattedHtml(html: string) {
  return html
    .replace(
      /<blockquote\s+expandable(?:=(['"])?.*?\1)?\s*>/gi,
      '<blockquote class="expandable">',
    )
    .replace(/<tg-spoiler>/gi, '<span class="tg-spoiler">')
    .replace(/<\/tg-spoiler>/gi, "</span>")
    .replace(/<span class="spoiler">/gi, '<span class="tg-spoiler">')
    .replace(
      /<pre([^>]*)>([\s\S]*?)<\/pre>/gi,
      (_match, attributes: string, inner: string) => {
        if (/data-copy-code/i.test(inner)) return _match;
        const languageFromAttr =
          attributes.match(/\slanguage=(['"])(.*?)\1/i)?.[2] ||
          attributes.match(/\slang=(['"])(.*?)\1/i)?.[2] ||
          "";
        const codeClassMatch = inner.match(
          /<code[^>]*class=(['"])(.*?)\1[^>]*>/i,
        );
        const languageFromCodeClass =
          codeClassMatch?.[2]
            ?.split(/\s+/)
            .find((value) => value.startsWith("language-"))
            ?.replace(/^language-/, "") || "";
        const label = languageFromAttr || languageFromCodeClass;
        const content = /<code[\s>]/i.test(inner)
          ? inner
          : `<code>${inner}</code>`;
        const copyButton = `<button type="button" data-copy-code aria-label="Copy code"><svg class="tg-copy-icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="6.5" y="2.5" width="10" height="12" rx="1.8"></rect><rect x="3.5" y="5.5" width="10" height="12" rx="1.8"></rect></svg></button>`;
        return label
          ? `<pre class="tg-native-pre"><span class="tg-native-pre-header"><span>${escapeHtml(label)}</span>${copyButton}</span>${content}</pre>`
          : `<pre class="tg-native-pre tg-native-pre-plain">${copyButton}${content}</pre>`;
      },
    );
}
