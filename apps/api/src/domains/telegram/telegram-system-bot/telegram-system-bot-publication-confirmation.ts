import type { PublicationNotificationLine, PublicationNotificationPart } from '@telegram-system/shared';
import {
  publicationNotificationChannel,
  publicationNotificationHtml,
} from '../../operations/notifications/publication-notification-message';

export type PublicationConfirmationChannel = Parameters<typeof publicationNotificationChannel>[0];

export type PublicationConfirmationPlacement = {
  telegramChannelId: string;
  scheduledAt?: string | Date;
  /** Confirmed Telegram publication instant; never substitute the requested schedule for it. */
  publishedAt?: string | Date | null;
  deleteAt?: string | Date | null;
  /** Persisted product format, including an explicit no-auto-delete choice. */
  formatLabel?: string | null;
  telegramMessageUrls?: string[];
};

export type PublicationConfirmationGroup = {
  title: string;
  placements: PublicationConfirmationPlacement[];
};

type PublicationConfirmation = {
  state: 'scheduled' | 'published';
  groups: PublicationConfirmationGroup[];
  channels: PublicationConfirmationChannel[];
  /** IANA timezone of the workspace receiving this confirmation. */
  timezone: string;
};

export function renderPublicationConfirmation(input: PublicationConfirmation) {
  return publicationNotificationHtml(publicationConfirmationLines(input));
}

/** One presentation for the website preview and every System Bot confirmation. */
export function publicationConfirmationLines(input: PublicationConfirmation): PublicationNotificationLine[] {
  const channels = new Map(
    input.channels.map((channel) => [channel.id, channel]),
  );
  const visibleGroups = input.groups
    .map((group) => ({
      ...group,
      placements: group.placements.filter((placement) =>
        input.state === 'published'
          ? placement.telegramMessageUrls?.length
          : true,
      ),
    }))
    .filter((group) => group.placements.length);
  return [
    {
      text: '',
      parts: [
        { text: '✅ ' },
        { text: input.state === 'published' ? 'Пости опубліковано' : 'Пост заплановано', strong: true },
      ],
    },
    { text: '' },
    { text: '', parts: [{ text: '🕓 Часовий пояс: ' }, { text: input.timezone, strong: true }] },
    ...visibleGroups.flatMap((group) => [
      { text: '' },
      ...renderGroup(group.title, group.placements, channels, input.state, input.timezone),
    ]),
  ];
}

function renderGroup(
  title: string,
  placements: PublicationConfirmationPlacement[],
  channels: Map<string, PublicationConfirmationChannel>,
  state: 'scheduled' | 'published',
  timezone: string,
) {
  const timing = placements.map((placement) =>
    placementTiming(placement, state),
  );
  const shared = timing.every((value) =>
    sameTiming(value, timing[0], timezone),
  );
  const common = shared && timing[0]?.publishedOrScheduledAt
    ? timingLines(timing[0], timezone)
    : null;
  const channelHeading = state === 'published'
    ? '✅ Опубліковано в каналах:'
    : '🗓️ Заплановано в каналах:';
  return [
    { text: `Пост «${title}»:`, strong: true },
    ...(common ?? []),
    { text: channelHeading, strong: true },
    ...placements.flatMap((placement, index) => [
      channelLine(placement, channels.get(placement.telegramChannelId), state),
      ...(common ? [] : timingLines(timing[index], timezone, '   ')),
    ]),
  ];
}

function channelLine(
  placement: PublicationConfirmationPlacement,
  channel: PublicationConfirmationChannel | undefined,
  state: 'scheduled' | 'published',
): PublicationNotificationLine {
  const { iconPresentation, title, href } = publicationNotificationChannel(
    channel ?? { id: placement.telegramChannelId, title: 'Недоступний канал' },
    true,
  );
  const parts: PublicationNotificationPart[] = [{ text: title, href, strong: true }];
  const urls = state === 'published' ? placement.telegramMessageUrls ?? [] : [];
  for (const [index, url] of urls.entries()) {
    parts.push({ text: index === 0 ? ' — ' : ', ' }, {
      text: urls.length === 1 ? 'Пост' : `Пост ${index + 1}`,
      href: /^https:\/\/t\.me\//u.test(url) ? url : undefined,
    });
  }
  return {
    text: '',
    icon: iconPresentation ?? { type: 'unicode', value: '📢' },
    iconFallback: '📢',
    parts,
  };
}

type PublicationTiming = {
  publishedOrScheduledAt: Date | null;
  deleteAt: Date | null;
  formatLabel: string | null;
};

function placementTiming(
  placement: PublicationConfirmationPlacement,
  state: 'scheduled' | 'published',
): PublicationTiming {
  return {
    publishedOrScheduledAt: dateOrNull(
      state === 'published' ? placement.publishedAt : placement.scheduledAt,
    ),
    deleteAt: dateOrNull(placement.deleteAt),
    formatLabel: placement.formatLabel?.trim() || null,
  };
}

function sameTiming(
  left: PublicationTiming,
  right: PublicationTiming,
  timezone: string,
) {
  const leftDate = left.publishedOrScheduledAt
    ? formatDateParts(left.publishedOrScheduledAt, timezone)
    : null;
  const rightDate = right.publishedOrScheduledAt
    ? formatDateParts(right.publishedOrScheduledAt, timezone)
    : null;
  return (
    leftDate?.year === rightDate?.year &&
    leftDate?.dayMonth === rightDate?.dayMonth &&
    leftDate?.hourMinute === rightDate?.hourMinute &&
    timingFormat(left) === timingFormat(right)
  );
}

function timingLines(timing: PublicationTiming, timezone: string, indent = ''): PublicationNotificationLine[] {
  const date = timing.publishedOrScheduledAt;
  if (!date) return [];
  const format = timingFormat(timing);
  const { dayMonth, hourMinute } = formatDateParts(date, timezone);
  return [
    { text: '', parts: [
      { text: `${indent}📅 Дата — ` }, { text: dayMonth, strong: true },
      { text: '; 🕒 Час — ' }, { text: hourMinute, strong: true },
    ] },
    ...(format ? [{ text: '', parts: [
      { text: `${indent}🗑️ Формат — ` }, { text: format, strong: true },
    ] }] : []),
  ];
}

function timingFormat(timing: PublicationTiming) {
  if (timing.formatLabel) return timing.formatLabel;
  const date = timing.publishedOrScheduledAt;
  const deletion = date ? deletionFormat(timing.deleteAt, date) : '';
  return deletion ? `Автовидалення ${deletion}` : null;
}

function dateOrNull(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('uk-UA', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return {
    dayMonth: `${part('day')}.${part('month')}`,
    hourMinute: `${part('hour')}:${part('minute')}`,
    year: part('year'),
  };
}

function deletionFormat(
  value: string | Date | null | undefined,
  scheduled: Date,
) {
  const deletedAt = value ? new Date(value) : null;
  if (!deletedAt || deletedAt.getTime() <= scheduled.getTime()) return '';
  const minutes = Math.round(
    (deletedAt.getTime() - scheduled.getTime()) / 60_000,
  );
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  const duration =
    [hours ? formatHours(hours) : '', remaining ? `${remaining} хв` : '']
      .filter(Boolean)
      .join(' ') || 'менше хвилини';
  return `через ${duration}`;
}

function formatHours(hours: number) {
  const lastTwo = hours % 100;
  const last = hours % 10;
  const unit =
    lastTwo >= 11 && lastTwo <= 14
      ? 'годин'
      : last === 1
        ? 'годину'
        : last >= 2 && last <= 4
          ? 'години'
          : 'годин';
  return `${hours} ${unit}`;
}
