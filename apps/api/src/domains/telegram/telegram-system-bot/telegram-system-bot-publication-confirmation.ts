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
  deleteAt?: string | Date | null;
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
}) {
  const channels = new Map(input.channels.map((channel) => [channel.id, channel]));
  const sections = input.groups
    .map((group) => {
      const placements = group.placements.filter((placement) =>
        input.state === 'published'
          ? placement.telegramMessageUrls?.length
          : true,
      );
      if (!placements.length) return null;
      const heading = input.state === 'published'
        ? `<b>Пост «${escapeHtml(group.title)}» опубліковано в каналах:</b>`
        : `<b>Пост «${escapeHtml(group.title)}» буде опубліковано в каналах:</b>`;
      return [
        heading,
        ...placements.map((placement) => line(placement, channels.get(placement.telegramChannelId), input.state)),
      ].join('\n');
    })
    .filter((section): section is string => Boolean(section));
  return [
    input.state === 'published'
      ? '✅ <b>Пости опубліковано</b>'
      : '✅ <b>Пост заплановано</b>',
    ...sections,
  ].join('\n\n');
}

function line(
  placement: PublicationConfirmationPlacement,
  channel: PublicationConfirmationChannel | undefined,
  state: 'scheduled' | 'published',
) {
  const scheduled = placement.scheduledAt ? new Date(placement.scheduledAt) : null;
  const postLinks = state === 'published'
    ? (placement.telegramMessageUrls ?? []).map((url, index, urls) =>
        `<a href="${escapeHtml(url)}">${urls.length === 1 ? 'Опублікований пост' : `Опублікований пост ${index + 1}`}</a>`,
      )
    : [];
  return [
    `${channelPresentation(channel)}${scheduled ? ` — <b>${formatDate(scheduled)}</b>` : ''}`,
    ...postLinks.map((link) => `   ${link}`),
    scheduled ? deletionLine(placement.deleteAt, scheduled) : '',
  ].filter(Boolean).join('\n');
}

function channelPresentation(channel: PublicationConfirmationChannel | undefined) {
  const icon = escapeHtml(channel?.presentationIcon?.emoji || '📢');
  const title = `<b>${escapeHtml(stripTitleEmoji(channel?.title ?? 'Недоступний канал'))}</b>`;
  const url = channel?.publicInviteLink?.url ?? channel?.defaultInviteLink?.url;
  return url ? `<a href="${escapeHtml(url)}">${icon} ${title}</a>` : `${icon} ${title}`;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', hour12: false,
  }).format(value).replace(',', '');
}

function deletionLine(value: string | Date | null | undefined, scheduled: Date) {
  const deletedAt = value ? new Date(value) : null;
  if (!deletedAt || deletedAt.getTime() <= scheduled.getTime()) return '';
  const minutes = Math.round((deletedAt.getTime() - scheduled.getTime()) / 60_000);
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  const duration = [hours ? `${hours} год` : '', remaining ? `${remaining} хв` : ''].filter(Boolean).join(' ') || 'менше хвилини';
  return `   Автовидалення: <b>через ${duration}</b>`;
}

function stripTitleEmoji(value: string) {
  return value.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/\s{2,}/g, ' ').trim();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]!);
}
