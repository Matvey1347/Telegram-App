import type { Prisma } from '@prisma/client';
import type { TelegramPostEngagementMetrics } from '@telegram-system/shared';
import { buildStableTelegramPostUrl } from '../../../telegram/shared/telegram-post-url';

export const telegramPostEngagementSelect = {
  id: true,
  telegramMessageId: true,
  text: true,
  formattedText: true,
  hasMedia: true,
  mediaKind: true,
  postDate: true,
  viewsCount: true,
  forwardsCount: true,
  reactionsCount: true,
  commentsCount: true,
  manualOwnViews: true,
  manualOwnReactions: true,
  reactions: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type TelegramPostEngagementRow = {
  id: string;
  telegramMessageId: string;
  text: string | null;
  formattedText: string | null;
  hasMedia: boolean;
  mediaKind: string | null;
  postDate: Date;
  viewsCount: number | null;
  forwardsCount: number | null;
  reactionsCount: number | null;
  commentsCount: number | null;
  manualOwnViews: number;
  manualOwnReactions: number;
  reactions: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TelegramPostEngagementChannel = {
  username?: string | null;
  telegramChatId?: string | null;
  currentSubscribersCount?: number | null;
  ownViewsPerPost?: number | null;
  ownReactionsPerPost?: number | null;
};

function rate(numerator: number | null, denominator: number) {
  if (numerator == null || denominator <= 0) return null;
  return (Math.max(0, numerator) / denominator) * 100;
}

function normalizeReactions(value: Prisma.JsonValue | null) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const rows = value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const reaction = 'reaction' in item ? item.reaction : null;
      const count = 'count' in item ? Number(item.count) : Number.NaN;
      return typeof reaction === 'string' && Number.isFinite(count)
        ? [{ reaction, count: Math.max(0, count) }]
        : [];
    });
    return rows.length ? rows : null;
  }
  if (typeof value !== 'object') return null;
  const rows = Object.entries(value).flatMap(([reaction, rawCount]) => {
    const count = Number(rawCount);
    return Number.isFinite(count)
      ? [{ reaction, count: Math.max(0, count) }]
      : [];
  });
  return rows.length ? rows : null;
}

export function telegramPostUrl(
  channel: TelegramPostEngagementChannel,
  telegramMessageId: string,
) {
  const username = String(channel.username || '')
    .trim()
    .replace(/^@/, '');
  if (/^[a-zA-Z0-9_]{5,}$/.test(username)) {
    return `https://t.me/${username}/${telegramMessageId}`;
  }
  return buildStableTelegramPostUrl({
    telegramChatId: channel.telegramChatId,
    messageId: telegramMessageId,
  });
}

export function telegramPostEngagementMetrics(
  post: TelegramPostEngagementRow,
  channel: TelegramPostEngagementChannel,
  subscriberCountAtPublication?: number | null,
): TelegramPostEngagementMetrics {
  const adjustedViewsCount = Math.max(
    0,
    Number(post.viewsCount ?? 0) -
      Math.max(0, Number(channel.ownViewsPerPost ?? 0)) -
      Math.max(0, Number(post.manualOwnViews ?? 0)),
  );
  const adjustedReactionsCount = Math.max(
    0,
    Number(post.reactionsCount ?? 0) -
      Math.max(0, Number(channel.ownReactionsPerPost ?? 0)) -
      Math.max(0, Number(post.manualOwnReactions ?? 0)),
  );
  const subscriberCount =
    subscriberCountAtPublication === undefined
      ? (channel.currentSubscribersCount ?? null)
      : subscriberCountAtPublication;

  return {
    telegramPostId: post.id,
    telegramMessageId: post.telegramMessageId,
    viewsCount: post.viewsCount,
    forwardsCount: post.forwardsCount,
    reactionsCount: post.reactionsCount,
    commentsCount: post.commentsCount,
    adjustedViewsCount,
    adjustedReactionsCount,
    subscriberCount,
    err: rate(adjustedViewsCount, Number(subscriberCount ?? 0)),
    reactionRate: rate(adjustedReactionsCount, adjustedViewsCount),
    forwardRate: rate(post.forwardsCount, Number(post.viewsCount ?? 0)),
    commentRate: rate(post.commentsCount, Number(post.viewsCount ?? 0)),
    reactions: normalizeReactions(post.reactions),
  };
}

export function telegramPostTitle(post: TelegramPostEngagementRow) {
  const firstLine = String(post.text || post.formattedText || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (firstLine) {
    return firstLine.length > 100 ? `${firstLine.slice(0, 97)}...` : firstLine;
  }
  const media = post.mediaKind ? ` (${post.mediaKind})` : '';
  return `Telegram post #${post.telegramMessageId}${media}`;
}
