import type { PublicationNotificationChannel, PublicationNotificationLine, ResolvedEmoji } from '@telegram-system/shared';
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
  publicInviteLink?: { url: string; isRevoked: boolean } | null;
  defaultInviteLink?: { url: string; isRevoked: boolean } | null;
};

const unicode = (value: string): ResolvedEmoji => ({ type: 'unicode', value });

export function publicationNotificationChannel(channel: ChannelSource) {
  const iconPresentation = [channel.presentationIcon, channel.avatarEmojiIcon]
    .map((icon) => iconToResolvedEmoji(icon))
    .find((icon) => icon?.type === 'unicode' && icon.telegramCustomEmojiId) ?? null;
  const title = channel.title
    .replace(/[#*0-9]\uFE0F?\u20E3|[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u200D\u{E0020}-\u{E007F}]/gu, '')
    .replace(/\s+/g, ' ').trim().slice(0, 160) || 'Канал';
  const username = channel.username?.replace(/^@/, '');
  const href = [
    username && `https://t.me/${username}`,
    !channel.publicInviteLink?.isRevoked && channel.publicInviteLink?.url,
    !channel.defaultInviteLink?.isRevoked && channel.defaultInviteLink?.url,
  ].find((url): url is string => typeof url === 'string' && /^https:\/\/t\.me\/(?:\+|joinchat\/)?[A-Za-z0-9_-]+$/u.test(url));
  return { id: channel.id, title, iconPresentation, href };
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
  const line = (label: string, amount: string | null | undefined, unknown?: number) =>
    ({ icon: unicode('💳'), text: `${label} · ${money(amount, unknown)}` });
  return [
    heading,
    ...(metrics.coverageDays === null ? [{ icon: unicode('⚠️'), text: 'Сбой автопилота' }] : [
      { icon: unicode('📝'), text: `Черновики · +${metrics.generated}` },
      { icon: unicode('📅'), text: `В расписании · +${metrics.scheduled}` },
      { icon: unicode('📦'), text: `Запас · ${metrics.readyDrafts} черн. · ${metrics.coverageDays} дн.` },
    ]),
    ...(metrics.errorCount ? [
      line('Готовые публикации', costs?.successful, costs?.unknownByBucket.successful),
      line('Публикации с ошибками', costs?.failed, costs?.unknownByBucket.failed),
      ...(costs && (Number(costs.shared) || costs.unknownByBucket.shared)
        ? [line('Общее планирование', costs.shared, costs.unknownByBucket.shared)] : []),
      line('Всего', metrics.totalCost, metrics.unknownCosts),
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
  return lines.map(({ text, icon, href, strong }) => {
    const alt = icon?.type === 'unicode' ? escape(icon.value) : '';
    const custom = icon?.type === 'unicode' && icon.telegramCustomEmojiId;
    const prefix = custom && /^\d+$/u.test(custom) ? `<tg-emoji emoji-id="${custom}">${alt}</tg-emoji>` : alt;
    const title = escape(text);
    const content = href ? `<a href="${escape(href)}">${title}</a>` : title;
    return `${prefix ? prefix + ' ' : ''}${strong ? `<b>${content}</b>` : content}`;
  }).join('\n');
}
