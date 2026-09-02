import { translateBackend } from '../../../../common/i18n/backend-translator';
import { systemBotPostsEn } from './posts.en';
import { systemBotPostsRu } from './posts.ru';

const catalog = { en: systemBotPostsEn, ru: systemBotPostsRu };

export function translateSystemBotPosts(
  locale: string | null | undefined,
  key: keyof typeof systemBotPostsEn,
) {
  return translateBackend(catalog, locale, key);
}
