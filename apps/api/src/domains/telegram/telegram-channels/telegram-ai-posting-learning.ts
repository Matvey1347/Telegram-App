import { visibleTelegramText } from './telegram-post-performance-math';

export type TelegramAiPostingLearningPost = {
  origin: string;
  score24h: number | null;
  scoreFinal: number | null;
  publishedAt: Date;
  text: string | null;
  formattedText: string | null;
  excludedFromNorm: boolean;
  lengthBand: string;
  hasMedia: boolean;
  endsWithQuestion: boolean;
};

const INELIGIBLE_ORIGINS = new Set(['AD', 'MUTUAL_PROMO']);

function visibleText(post: TelegramAiPostingLearningPost) {
  return visibleTelegramText(post.text ?? post.formattedText).replace(/\s+/g, ' ').trim();
}
function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function score(post: TelegramAiPostingLearningPost) {
  return post.scoreFinal ?? post.score24h;
}

function cleanSnippet(text: string, limit: number) {
  return text.slice(0, limit).trimEnd() + (text.length > limit ? '…' : '');
}

export function buildTelegramAiPostingLearningBlock(
  posts: TelegramAiPostingLearningPost[],
  options: { historyMode?: string; historyFrom?: string; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const from = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  if (options.historyMode === 'since' && options.historyFrom) {
    const configuredFrom = new Date(options.historyFrom);
    if (!Number.isNaN(configuredFrom.getTime()) && configuredFrom > from)
      from.setTime(configuredFrom.getTime());
  }
  const eligible = posts
    .filter(
      (post) =>
        post.publishedAt >= from &&
        post.publishedAt <= now &&
        !post.excludedFromNorm &&
        !INELIGIBLE_ORIGINS.has(post.origin) &&
        Boolean(visibleText(post)) &&
        score(post) != null &&
        Number.isFinite(score(post)),
    )
    .map((post) => ({ post, score: score(post)!, text: visibleText(post) }));
  if (options.historyMode === 'none' || eligible.length < 8)
    return 'ЧТО РАБОТАЕТ В КАНАЛЕ\nДанных пока мало.';

  const ranked = [...eligible].sort((a, b) => b.score - a.score);
  const best = ranked.slice(0, 8);
  const worst = ranked.slice(-5).reverse();
  const breakdown = (
    title: string,
    value: (post: TelegramAiPostingLearningPost) => string,
  ) => {
    const buckets = new Map<string, number[]>();
    for (const item of eligible) {
      const key = value(item.post);
      const bucket = buckets.get(key) ?? [];
      bucket.push(item.score);
      buckets.set(key, bucket);
    }
    return [...buckets]
      .filter(([, values]) => values.length >= 8)
      .map(([key, values]) => `${title} ${key} ×${median(values)!.toFixed(2)} (n=${values.length})`);
  };
  const findings = [
    ...breakdown('Длина', (post) => ({ short: 'короткие', medium: 'средние', long: 'длинные' }[post.lengthBand] ?? post.lengthBand)),
    ...breakdown('Медиа', (post) => (post.hasMedia ? 'с медиа' : 'без медиа')),
    ...breakdown('Завершение', (post) => (post.endsWithQuestion ? 'вопросом' : 'без вопроса')),
  ];
  const lines = [
    'ЧТО РАБОТАЕТ В КАНАЛЕ (кодовый анализ за период до 60 дней)',
    `Лучшие посты:\n${best.map((item, index) => `${index + 1}. ×${item.score.toFixed(2)} — ${cleanSnippet(item.text, 600)}`).join('\n')}`,
    `Антипримеры:\n${worst.map((item, index) => `${index + 1}. ×${item.score.toFixed(2)} — ${cleanSnippet(item.text, 300)}`).join('\n')}`,
    findings.length ? `Разбивки (медианный скор):\n${findings.join('\n')}` : 'Для разбивок пока мало данных.',
  ];
  return lines.join('\n\n').slice(0, 8_000);
}

export function recentTelegramAiPostingHistory<T extends { text?: string | null }>(
  history: T[],
) {
  return history.slice(0, 30).map((post) => ({
    ...post,
    text: typeof post.text === 'string' ? post.text.slice(0, 500) : '',
  }));
}
