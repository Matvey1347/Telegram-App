import type { readBotAdCreative } from './bot-ads-read';

const placeholder = '{{invite_link}}';
const webLink =
  /(?:https?:\/\/|tg:\/\/|(?:www\.|t\.me\/|telegram\.me\/))[^\s<>()[\]"']+/giu;
// Keep attachment sources intact. Managed text uses Markdown links and can
// also contain imported Telegram HTML.
const protectedMarkup = /!\[[^\]\n]*\]\([^\n)]*\)|<[^>]+>/gu;
const titleLink = /\bhref=(["'])(.*?)\1/giu;

export function buildPlacementCreative(
  creative: ReturnType<typeof readBotAdCreative>,
  url: string,
) {
  let replaced = false;
  const destination = () => {
    replaced = true;
    return url;
  };
  const replaceText = (text: string) =>
    text.replaceAll(placeholder, destination).replace(webLink, (value) => {
      if (value === url) {
        replaced = true;
        return value;
      }
      const suffix = value.match(/[.,!?;:]+$/u)?.[0] ?? '';
      return destination() + suffix;
    });
  const source =
    creative.text || creative.formattedHtml || creative.plainText || '';
  let text = '';
  let start = 0;
  for (const match of source.matchAll(protectedMarkup)) {
    text += replaceText(source.slice(start, match.index));
    text += /^<a\s/iu.test(match[0])
      ? match[0].replace(
          titleLink,
          (_value, quote: string) => `href=${quote}${destination()}${quote}`,
        )
      : /^<(?:https?:|tg:)/iu.test(match[0])
        ? replaceText(match[0])
        : match[0];
    start = match.index + match[0].length;
  }
  text += replaceText(source.slice(start));
  const buttonRows = creative.buttonRows.map((row) =>
    row.map((button) => ({
      ...button,
      url: destination(),
    })),
  );
  return {
    text: replaced ? text : [text, url].filter(Boolean).join('\n\n'),
    buttonRows,
    imageUrls: creative.imageUrls,
    mediaItems: creative.mediaItems,
  };
}
