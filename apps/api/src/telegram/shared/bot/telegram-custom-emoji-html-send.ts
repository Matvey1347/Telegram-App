import { TelegramBotApiError } from './telegram-bot-api.client';
import { telegramCustomEmojiHtmlFallback } from './telegram-bot-icon-source';

/** Retry only a confirmed custom-emoji rejection, retaining Unicode ALT and other HTML. */
export async function sendTelegramCustomEmojiHtml<TResult>(
  html: string,
  send: (text: string) => Promise<TResult>,
): Promise<TResult> {
  try {
    return await send(html);
  } catch (error) {
    const fallback = telegramCustomEmojiHtmlFallback(html);
    // No retry for ambiguous outcomes, rate limits, or unrelated rejections.
    if (
      fallback === html ||
      !(error instanceof TelegramBotApiError) ||
      !error.explicitRejected ||
      error.errorCode !== 400 ||
      !/custom[_ ]emoji|tg-emoji/i.test(error.message)
    )
      throw error;
    return send(fallback);
  }
}
