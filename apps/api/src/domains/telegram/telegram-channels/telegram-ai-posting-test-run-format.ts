import { telegramHtmlToManagedMarkup } from '@api/telegram/shared/markup/telegram-markup';

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
  if (config.ending && !clean.endsWith(String(config.ending).trim()))
    clean = `${clean}\n\n${String(config.ending).trim()}`;
  if (config.hashtags === 'start' && tags.length)
    clean = `${tags.join(' ')}\n\n${clean}`;
  if (config.hashtags === 'end' && tags.length)
    clean = `${clean}\n\n${tags.join(' ')}`;
  return clean;
}
