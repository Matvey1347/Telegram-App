import type { PublicationNotificationChannel, PublicationNotificationLine, PublicationNotificationPart, ResolvedEmoji } from '@telegram-system/shared';
import { iconToResolvedEmoji, type ResolvedEmojiIconSource } from '../../../common/icons/resolved-emoji';

const iconSelect = { id: true, type: true, name: true, emoji: true, imageUrl: true } as const;

export const publicationNotificationChannelSelect = {
  id: true,
  title: true,
  username: true,
  avatarEmojiIcon: { select: iconSelect },
  presentationIcon: { select: iconSelect },
  publicInviteLink: { select: { url: true, isRevoked: true } },
  defaultInviteLink: { select: { url: true, isRevoked: true } },
} as const;

type ChannelSource = {
  id: string;
  title: string;
  username?: string | null;
  avatarEmojiIcon?: ResolvedEmojiIconSource | null;
  presentationIcon?: ResolvedEmojiIconSource | null;
  publicInviteLink?: { url: string; isRevoked?: boolean } | null;
  defaultInviteLink?: { url: string; isRevoked?: boolean } | null;
};

const unicode = (value: string): ResolvedEmoji => ({ type: 'unicode', value });

export function publicationNotificationChannel(channel: ChannelSource, includeOtherIcons = false) {
  const icons = [channel.presentationIcon, channel.avatarEmojiIcon]
    .map((icon) => iconToResolvedEmoji(icon));
  const iconPresentation = icons.find((icon) => icon?.type === 'unicode' && icon.telegramCustomEmojiId)
    ?? (includeOtherIcons ? icons.find((icon) => icon !== null) : null)
    ?? null;
  const title = channel.title
    .replace(/[#*0-9]\uFE0F?\u20E3|[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u200D\u{E0020}-\u{E007F}]/gu, '')
    .replace(/\s+/g, ' ').trim().slice(0, 160) || 'Канал';
  const username = channel.username?.replace(/^@/, '');
  const href = [
    username && `https://t.me/${username}`,
    !channel.publicInviteLink?.isRevoked && channel.publicInviteLink?.url,
    !channel.defaultInviteLink?.isRevoked && channel.defaultInviteLink?.url,
  ].find((url): url is string => typeof url === 'string' && /^https:\/\/t\.me\/(?:\+|joinchat\/)?[A-Za-z0-9_-]+$/u.test(url));
  return {
    id: channel.id,
    title,
    iconPresentation: iconPresentation ? { ...iconPresentation, name: title } : null,
    href,
  };
}

export type AutopilotReportMetrics = {
  generated: number;
  scheduled: number;
  coverageDays: number | null;
  readyDrafts: number;
  errorCount: number;
  totalCost?: string | null;
  unknownCosts?: number;
  costBreakdown?: {
    successful: string;
    failed: string;
    shared: string;
    unknownByBucket: Record<'successful' | 'failed' | 'shared', number>;
  };
};

export function autopilotReportLines(
  channel: PublicationNotificationChannel & { href?: string },
  metrics?: AutopilotReportMetrics,
): PublicationNotificationLine[] {
  const heading = { text: channel.title, href: channel.href, icon: channel.iconPresentation, strong: true };
  if (!metrics) return [heading, { icon: unicode('⚠️'), text: 'Сбой автопилота' }];
  const costs = metrics.costBreakdown;
  const money = (amount: string | null | undefined, unknown = 0) =>
    amount == null ? 'уточняется' :
      `$${amount}${unknown ? ' · есть неподтверждённые расходы' : ''}`;
  const costLine = (label: string, amount: string | null | undefined, unknown?: number, icon?: string) => ({
    ...(icon && { icon: unicode(icon) }),
    text: `${label} · ${money(amount, unknown)}`,
    indent: true,
  });
  return [
    heading,
    ...(metrics.coverageDays === null ? [{ icon: unicode('⚠️'), text: 'Сбой автопилота' }] : [
      { icon: unicode('📝'), text: `Черновики · +${metrics.generated}` },
      { icon: unicode('📅'), text: `В расписании · +${metrics.scheduled}` },
      { icon: unicode('📦'), text: `Запас · ${metrics.readyDrafts} черн. · ${metrics.coverageDays} дн.` },
    ]),
    ...(metrics.errorCount ? [
      { text: '' },
      { icon: unicode('💳'), text: 'Расходы', strong: true },
      costLine('Готовые публикации', costs?.successful, costs?.unknownByBucket.successful, '✅'),
      costLine('Публикации с ошибками', costs?.failed, costs?.unknownByBucket.failed, '❌'),
      ...(costs && (Number(costs.shared) || costs.unknownByBucket.shared)
        ? [costLine('Общее планирование', costs.shared, costs.unknownByBucket.shared, '🧩')] : []),
      { ...costLine('Всего', metrics.totalCost, metrics.unknownCosts), strong: true },
    ] :
      metrics.totalCost || metrics.unknownCosts ? [{ icon: unicode('💳'), text: money(metrics.totalCost, metrics.unknownCosts) }] : []),
    ...(metrics.errorCount ? [{ icon: unicode('⚠️'), text: `Ошибки · ${metrics.errorCount}` }] : []),
  ];
}

export function coverageNotificationLines(days: number, channels: PublicationNotificationChannel[]): PublicationNotificationLine[] {
  return [
    { icon: unicode(days === 0 ? '⚠️' : '📅'), text: days === 0 ? 'Сегодня нет публикаций' : `Запас публикаций · ${days} дн.`, strong: true },
    ...channels.map(({ title, iconPresentation }) => ({ text: title, icon: iconPresentation })),
  ];
}

function escape(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]!);
}

export function publicationNotificationHtml(lines: PublicationNotificationLine[]) {
  return lines.map(({ text, icon, iconFallback, href, strong, parts, indent }) => {
    const alt = escape(icon?.type === 'unicode' ? icon.value : iconFallback ?? '');
    const custom = icon?.type === 'unicode' && icon.telegramCustomEmojiId;
    const prefix = custom && /^\d+$/u.test(custom) ? `<tg-emoji emoji-id="${custom}">${alt}</tg-emoji>` : alt;
    const content = parts ? parts.map(partHtml).join('') : lineContent(text, href, strong);
    return `${indent ? '   ' : ''}${prefix ? prefix + ' ' : ''}${content}`;
  }).join('\n');
}

function lineContent(text: string, href?: string, strong?: boolean) {
  const content = partHtml({ text, href });
  return strong ? `<b>${content}</b>` : content;
}

function partHtml({ text, href, strong }: PublicationNotificationPart) {
  const escaped = escape(text);
  const content = strong ? `<b>${escaped}</b>` : escaped;
  return href ? `<a href="${escape(href)}">${content}</a>` : content;
}
