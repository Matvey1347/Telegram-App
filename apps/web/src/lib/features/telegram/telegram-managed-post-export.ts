import type { TelegramManagedPost } from "@/lib/api";
import type { TelegramPostEngagementMetrics } from "@telegram-system/shared";

function metric(value: number | null) {
  return value == null ? "н/д" : String(value);
}

function rate(value: number | null) {
  return value == null ? "н/д" : `${value.toFixed(2)}%`;
}

function formatTelegramPostEngagementForExport(
  engagement: TelegramPostEngagementMetrics,
  index: number,
  total: number,
) {
  const lines = [
    total > 1
      ? `Сообщение ${index + 1} (Telegram ID: ${engagement.telegramMessageId}):`
      : "Статистика Telegram:",
    `Просмотры: ${metric(engagement.viewsCount)} (скорректированные: ${engagement.adjustedViewsCount})`,
    `Реакции: ${metric(engagement.reactionsCount)} (скорректированные: ${engagement.adjustedReactionsCount})`,
    `Комментарии: ${metric(engagement.commentsCount)}`,
    `Пересылки: ${metric(engagement.forwardsCount)}`,
    `Подписчики на момент расчёта: ${metric(engagement.subscriberCount)}`,
    `ERR: ${rate(engagement.err)}`,
    `Reaction rate: ${rate(engagement.reactionRate)}`,
    `Comment rate: ${rate(engagement.commentRate)}`,
    `Forward rate: ${rate(engagement.forwardRate)}`,
  ];
  if (engagement.reactions?.length) {
    lines.push(
      `Реакции по типам: ${engagement.reactions.map(({ reaction, count }) => `${reaction} ${count}`).join(", ")}`,
    );
  }
  return lines.join("\n");
}

export function buildManagedPostsTextExport(posts: TelegramManagedPost[]) {
  const instructions = [
    "ИНСТРУКЦИЯ ПО ВНУТРЕННИМ ССЫЛКАМ",
    "",
    "Managed-посты ниже начинаются со стабильного идентификатора tg-post:<id>.",
    "Синхронизированные read-only посты имеют reference telegram-source-post:<id> и служат только аналитическим контекстом.",
    "Только tg-post:<id> можно использовать, чтобы связать один managed post с другим.",
    "",
    "Формат ссылки внутри текста:",
    "[видимый текст](tg-post:<id>)",
    "",
    "Не заменяйте tg-post:<id> заголовком: заголовок может измениться, а id остаётся стабильным.",
    "",
    "============================================================",
  ].join("\n");
  const postsContent = posts
    .map((post) =>
      [
        post.readOnlyTelegramPost && post.telegramPostId
          ? `telegram-source-post:${post.telegramPostId} — ${post.title}`
          : `tg-post:${post.id} — ${post.title}`,
        post.primaryTelegramMessageUrl
          ? `Telegram: ${post.primaryTelegramMessageUrl}`
          : null,
        post.engagementMetrics?.length
          ? post.engagementMetrics
              .map((metricItem, index, metrics) =>
                formatTelegramPostEngagementForExport(
                  metricItem,
                  index,
                  metrics.length,
                ),
              )
              .join("\n\n")
          : null,
        "",
        post.text || "[Пост без текста]",
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
    )
    .join(
      "\n\n------------------------------------------------------------\n\n",
    );
  return `${instructions}\n\n${postsContent}\n`;
}
