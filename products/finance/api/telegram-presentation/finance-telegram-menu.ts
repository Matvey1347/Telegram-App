import type { TelegramChatMenuButton } from '@api/telegram/shared/bot/telegram-bot-api.client';
import { financeStandaloneWebOrigin, isProductionEnvironment, publicWebOrigin } from '@api/config/deployment-config';
import { t, type FinanceChatLocale } from '@consumer-finance/api/i18n/finance-chat-i18n';
import type { ConsumerFinanceAssistantScreen } from '@telegram-system/shared';

const FINANCE_PRODUCTION_WEB_ORIGIN = 'https://groshly.nexeloq.com';

function financeWebOrigin() {
  return (
    financeStandaloneWebOrigin() ??
    (isProductionEnvironment()
      ? FINANCE_PRODUCTION_WEB_ORIGIN
      : publicWebOrigin())
  );
}

export function financeMiniAppUrl(
  botId: string,
  base = financeWebOrigin(),
  screen?: ConsumerFinanceAssistantScreen | 'settings',
  transfer = false,
) {
  const normalized = base?.trim().replace(/\/$/u, '');
  if (!normalized) return null;
  // Finance is served from its standalone root. The bot context is resolved
  // by the Finance API, so Telegram links must not send users to the legacy
  // /finance/:botId compatibility route.
  void botId;
  const query = new URLSearchParams();
  if (screen) query.set('screen', screen);
  if (transfer) query.set('transfer', '1');
  const suffix = query.size ? `?${query.toString()}` : '';
  return `${normalized}/${suffix}`;
}

export function financeCheckoutReturnUrl(
  botId: string,
  checkout: 'success' | 'cancelled',
  base = financeWebOrigin(),
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
  void botId;
  return [
    [{ text: t(locale, 'menuAssistant') }],
    [{ text: t(locale, 'menuExpense') }, { text: t(locale, 'menuIncome') }],
    [{ text: t(locale, 'menuRecent') }, { text: t(locale, 'menuAccounts') }],
    [
      { text: t(locale, 'menuCategories') },
      { text: t(locale, 'menuTransfer') },
    ],
    [{ text: t(locale, 'menuSettings') }, { text: t(locale, 'menuHelp') }],
  ];
}
