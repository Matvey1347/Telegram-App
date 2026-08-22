import { financeMiniAppUrl } from './finance-bot-chat-responder.service';
import { t, type FinanceChatLocale } from './i18n/finance-chat-i18n';

export function financeBotProButtons(botId: string, locale: FinanceChatLocale) {
  const url = financeMiniAppUrl(botId, undefined, 'more');
  return url ? [[{ text: t(locale, 'unlockPro'), webAppUrl: url }]] : undefined;
}
