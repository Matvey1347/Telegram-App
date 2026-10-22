export type PublicationConfirmationChannel = {
  id: string;
  title: string;
  publicInviteLink: { url: string } | null;
  defaultInviteLink: { url: string } | null;
  presentationIcon: { emoji: string | null } | null;
};

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

/** Shared Telegram System Bot presentation for every scheduled publication flow. */
export function renderPublicationConfirmation(input: {
  state: 'scheduled' | 'published';
  groups: PublicationConfirmationGroup[];
  channels: PublicationConfirmationChannel[];
  /** IANA timezone of the workspace receiving this confirmation. */
  timezone: string;
}) {
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
  const sections = visibleGroups
    .map((group) =>
      renderGroup(
        group.title,
        group.placements,
        channels,
        input.state,
        input.timezone,
      ),
    )
    .filter((section): section is string => Boolean(section));
  return [
    input.state === 'published'
      ? '✅ <b>Пости опубліковано</b>'
      : '✅ <b>Пост заплановано</b>',
    `🕓 Часовий пояс: <b>${escapeHtml(input.timezone)}</b>`,
    ...sections,
  ].join('\n\n');
}

function renderGroup(
  title: string,
  placements: PublicationConfirmationPlacement[],
  channels: Map<string, PublicationConfirmationChannel>,
  state: 'scheduled' | 'published',
  timezone: string,
) {
  const timing = placements.map((placement) => placementTiming(placement, state));
  const shared = timing.every((value) =>
    sameTiming(value, timing[0], timezone),
  );
  const heading =
    `<b>Пост «${escapeHtml(title)}»:</b>`;
  const common = shared && timing[0]?.publishedOrScheduledAt
      ? timingLines(timing[0], timezone)
      : null;
  const channelHeading = state === 'published'
    ? '<b>✅ Опубліковано в каналах:</b>'
    : '<b>🗓️ Заплановано в каналах:</b>';
  return [
    heading,
    ...(common ?? []),
    channelHeading,
    ...placements.map((placement, index) =>
      line(
        placement,
        channels.get(placement.telegramChannelId),
        state,
        timezone,
        common !== null ? null : timing[index],
      ),
    ),
  ].join('\n');
}

function line(
  placement: PublicationConfirmationPlacement,
  channel: PublicationConfirmationChannel | undefined,
  state: 'scheduled' | 'published',
  timezone: string,
  timing: PublicationTiming | null,
) {
  const postLinks =
    state === 'published'
      ? (placement.telegramMessageUrls ?? []).map(
          (url, index, urls) =>
            `<a href="${escapeHtml(url)}">${urls.length === 1 ? 'Пост' : `Пост ${index + 1}`}</a>`,
        )
      : [];
  return [
    `${channelPresentation(channel)}${postLinks.length ? ` — ${postLinks.join(', ')}` : ''}`,
    ...(timing ? timingLines(timing, timezone).map((value) => `   ${value}`) : []),
  ]
    .filter(Boolean)
    .join('\n');
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

function timingLines(timing: PublicationTiming, timezone: string) {
  const date = timing.publishedOrScheduledAt;
  if (!date) return [];
  const format = timingFormat(timing);
  const { dayMonth, hourMinute } = formatDateParts(date, timezone);
  return [
    `📅 Дата — <b>${dayMonth}</b>; 🕒 Час — <b>${hourMinute}</b>`,
    ...(format ? [`🗑️ Формат — <b>${escapeHtml(format)}</b>`] : []),
  ]
    .filter(Boolean)
    .map(String);
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

function channelPresentation(
  channel: PublicationConfirmationChannel | undefined,
) {
  const icon = escapeHtml(channel?.presentationIcon?.emoji || '📢');
  const title = `<b>${escapeHtml(stripTitleEmoji(channel?.title ?? 'Недоступний канал'))}</b>`;
  const url = channel?.publicInviteLink?.url ?? channel?.defaultInviteLink?.url;
  return url
    ? `<a href="${escapeHtml(url)}">${icon} ${title}</a>`
    : `${icon} ${title}`;
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

function stripTitleEmoji(value: string) {
  return value
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>]/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]!,
  );
}
