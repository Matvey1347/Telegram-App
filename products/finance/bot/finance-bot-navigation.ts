import type { FinanceChatLocale } from '@consumer-finance/api/i18n/finance-chat-i18n';
import { financeMiniAppUrl } from '@consumer-finance/api/telegram-presentation/finance-telegram-menu';
import { financeStandaloneWebOrigin } from '@api/config/deployment-config';

const copy = {
  en: {
    analytics: 'Your charts and spending breakdowns are in Finance.',
    analyticsButton: 'Open analytics',
    plus: 'Review your PLUS access, billing period and payment history in Finance. Purchases are unavailable inside Telegram.',
    plusButton: 'View PLUS status',
    support: 'For Finance help or payment issues, email matveybogdantg@gmail.com. Include your Telegram username and a short description; never send card details.',
    terms: 'Read the Finance terms and privacy policy:',
    termsButton: 'Terms of service',
    privacyButton: 'Privacy policy',
    unavailable: 'Finance Web is temporarily unavailable. Please try again later.',
  },
  uk: {
    analytics: 'Графіки та розподіл витрат доступні у Finance.',
    analyticsButton: 'Відкрити аналітику',
    plus: 'Перегляньте доступ PLUS, термін підписки та історію платежів у Finance. Купівля всередині Telegram недоступна.',
    plusButton: 'Переглянути PLUS',
    support: 'Щодо Finance або оплати пишіть на matveybogdantg@gmail.com. Додайте Telegram-ім’я та короткий опис; не надсилайте дані картки.',
    terms: 'Умови користування й політика приватності Finance:',
    termsButton: 'Умови користування',
    privacyButton: 'Приватність',
    unavailable: 'Finance Web тимчасово недоступний. Спробуйте пізніше.',
  },
  ru: {
    analytics: 'Графики и структура расходов доступны в Finance.',
    analyticsButton: 'Открыть аналитику',
    plus: 'Посмотрите доступ PLUS, срок подписки и историю платежей в Finance. Покупка внутри Telegram недоступна.',
    plusButton: 'Посмотреть PLUS',
    support: 'По вопросам Finance и оплаты пишите на matveybogdantg@gmail.com. Укажите Telegram-имя и кратко опишите вопрос; не отправляйте данные карты.',
    terms: 'Условия использования и политика приватности Finance:',
    termsButton: 'Условия использования',
    privacyButton: 'Приватность',
    unavailable: 'Finance Web временно недоступен. Попробуйте позже.',
  },
} as const;

export function financeBotNavigation(
  botId: string,
  locale: FinanceChatLocale,
  destination: 'analytics' | 'plus' | 'support' | 'terms',
) {
  const labels = copy[locale];
  if (destination === 'support') return { text: labels.support };
  if (destination === 'terms') {
    const origin = financeStandaloneWebOrigin();
    return {
      text: origin ? labels.terms : `${labels.terms}\n${labels.support}`,
      ...(origin ? { inlineButtons: [[
        { text: labels.termsButton, url: `${origin}/terms` },
        { text: labels.privacyButton, url: `${origin}/privacy` },
      ]] } : {}),
    };
  }
  const home = financeMiniAppUrl(botId);
  if (!home) return { text: labels.unavailable };
  const url = financeMiniAppUrl(botId, undefined, destination === 'plus' ? 'billing' : 'analytics');
  return {
    text: labels[destination],
    inlineButtons: url ? [[{ text: destination === 'plus' ? labels.plusButton : labels.analyticsButton, webAppUrl: url }]] : undefined,
  };
}
