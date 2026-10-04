import { financeMiniAppUrl } from '@finance-pro/api/telegram-presentation/finance-telegram-menu';
import {
  t,
  type FinanceChatLocale,
} from '@finance-pro/api/i18n/finance-chat-i18n';

export function financeBotProButtons(botId: string, locale: FinanceChatLocale) {
  const url = financeMiniAppUrl(botId, undefined, 'more');
  return url ? [[{ text: t(locale, 'unlockPro'), webAppUrl: url }]] : undefined;
}
