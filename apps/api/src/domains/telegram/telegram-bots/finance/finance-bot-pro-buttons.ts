import { financeMiniAppUrl } from '../../consumer-finance/telegram-presentation/finance-telegram-menu';
import {
  t,
  type FinanceChatLocale,
} from '../../consumer-finance/i18n/finance-chat-i18n';

export function financeBotProButtons(botId: string, locale: FinanceChatLocale) {
  const url = financeMiniAppUrl(botId, undefined, 'more');
  return url ? [[{ text: t(locale, 'unlockPro'), webAppUrl: url }]] : undefined;
}
