import { telegramHtmlToManagedMarkup } from '@api/telegram/shared/markup/telegram-markup';

export function preserveTelegramAiPostingReferences(text: string, original: string, config: Record<string, unknown>, feedback = '') {
  let result = text.trim();
  const removeLinks = /(?:удал|убер|видал|прибери|remove).{0,50}(?:ссыл|посилан|link)/iu.test(feedback);
  const removeTags = /(?:удал|убер|видал|прибери|remove).{0,50}(?:хеш|хэштег|тег|hashtag)/iu.test(feedback);
  const ending = typeof config.ending === 'string' ? config.ending : '';
  if (!removeLinks) {
    const endingUrls = new Set([...ending.matchAll(/\[[^\]\n]+\]\((https?:\/\/[^\s)]+)\)/giu)].map((match) => match[1]));
    const links = [...original.matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/giu)]
      .filter((match) => !endingUrls.has(match[2]) && !result.includes(match[2])).slice(0, 3);
    if (links.length) result += `\n\n${links.map((match) => `[${match[1]}](${match[2]})`).join(' ')}`;
  }
  if (!removeTags && ['start', 'end', 'ending_inline'].includes(String(config.hashtags)) && !/(?:^|\s)#[\p{L}][\p{L}\p{N}_]*/u.test(result)) {
    const withoutUrls = original.replace(/https?:\/\/[^\s)\]]+/giu, '');
    const tags = [...new Set(withoutUrls.match(/(?<![\p{L}\p{N}_])#\p{L}[\p{L}\p{N}_]*/gu) ?? [])].slice(0, config.hashtags === 'ending_inline' ? 1 : 3);
    if (tags.length) result += `\n\n${tags.join(' ')}`;
  }
  return result;
}

export function applyTelegramAiPostingTestRunFormatting(
  text: string,
  config: Record<string, any>,
) {
  const managedText = telegramHtmlToManagedMarkup(text);
  const tags = [...new Set(managedText.match(/#[\p{L}\p{N}_]+/gu) ?? [])];
  let clean = managedText
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (config.hashtags === 'ending_inline' && tags.length) {
    clean = clean.replace(/\s*\|\s*$/u, '').trimEnd();
    if (config.ending && !clean.endsWith(String(config.ending).trim()))
      clean = [clean, String(config.ending).trim()].filter(Boolean).join('\n\n');
    return [clean, tags[0]].filter(Boolean).join(config.ending ? ' | ' : '\n\n');
  }
  if (config.ending && !clean.endsWith(String(config.ending).trim()))
    clean = `${clean}\n\n${String(config.ending).trim()}`;
  if (config.hashtags === 'start' && tags.length)
    clean = `${tags.join(' ')}\n\n${clean}`;
  if (config.hashtags === 'end' && tags.length)
    clean = `${clean}\n\n${tags.join(' ')}`;
  return clean;
}
