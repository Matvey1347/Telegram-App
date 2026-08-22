import type { TelegramChatMenuButton } from '../../../../telegram/shared/telegram-bot-api.client';
import { publicWebOrigin } from '../../../../config/deployment-config';
import { t, type FinanceChatLocale } from '../i18n/finance-chat-i18n';

export function financeMiniAppUrl(
  botId: string,
  base = publicWebOrigin(),
  screen?: 'accounts' | 'transactions' | 'more',
  transfer = false,
) {
  const normalized = base?.trim().replace(/\/$/u, '');
  if (!normalized) return null;
  const query = new URLSearchParams();
  if (screen) query.set('screen', screen);
  if (transfer) query.set('transfer', '1');
  const suffix = query.size ? `?${query.toString()}` : '';
  return `${normalized}/finance/${encodeURIComponent(botId)}${suffix}`;
}

export function financeCheckoutReturnUrl(
  botId: string,
  checkout: 'success' | 'cancelled',
  base = publicWebOrigin(),
) {
  const applicationUrl = financeMiniAppUrl(botId, base);
  if (!applicationUrl) return null;
  const url = new URL(applicationUrl);
  url.searchParams.set('checkout', checkout);
  return url.toString();
}

export function financeChatMenuButton(
  botId: string,
  locale: FinanceChatLocale = 'en',
): TelegramChatMenuButton {
  const webAppUrl = financeMiniAppUrl(botId);
  return webAppUrl
    ? {
        type: 'web_app',
        text: t(locale, 'menuOpen').replace(/^📱\s*/u, ''),
        webAppUrl,
      }
    : { type: 'commands' };
}

export function financeMainMenu(
  botId: string,
  locale: FinanceChatLocale = 'en',
) {
  const webAppUrl = financeMiniAppUrl(botId);
  return [
    [{ text: t(locale, 'menuExpense') }, { text: t(locale, 'menuIncome') }],
    [
      { text: t(locale, 'menuOpen'), ...(webAppUrl ? { webAppUrl } : {}) },
      { text: t(locale, 'menuRecent') },
    ],
    [
      { text: t(locale, 'menuAccounts') },
      { text: t(locale, 'menuCategories') },
    ],
    [{ text: t(locale, 'menuTransfer') }, { text: t(locale, 'menuSettings') }],
    [{ text: t(locale, 'menuHelp') }],
  ];
}
