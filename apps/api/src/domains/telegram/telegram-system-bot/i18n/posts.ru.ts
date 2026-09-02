import type { systemBotPostsEn } from './posts.en';

export const systemBotPostsRu: Record<keyof typeof systemBotPostsEn, string> = {
  title: '📝 Публикации',
  addNew: '➕ Добавить',
  published: '✅ Опубликованные',
  scheduled: '🕒 Запланированные',
  publishedTitle: '✅ Опубликованные публикации',
  scheduledTitle: '🕒 Запланированные публикации',
  noPosts: 'Публикаций нет.',
  back: '← Публикации',
  publishedNotice: '✅ Публикация опубликована.',
  unavailable: 'Запланированная публикация недоступна',
};
