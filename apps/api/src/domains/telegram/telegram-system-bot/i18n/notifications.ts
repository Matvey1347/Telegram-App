import { translateBackend } from '../../../../common/i18n/backend-translator';
import { systemBotNotificationsEn } from './notifications.en';
import { systemBotNotificationsRu } from './notifications.ru';

const catalog = {
  en: systemBotNotificationsEn,
  ru: systemBotNotificationsRu,
};

export type SystemBotNotificationKey = keyof typeof systemBotNotificationsEn;

export function translateSystemBotNotification(
  locale: string | null | undefined,
  key: SystemBotNotificationKey,
  params: Record<string, string | number | boolean | null> = {},
) {
  return translateBackend(catalog, locale, key, params);
}
