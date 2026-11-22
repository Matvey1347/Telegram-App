import type { ResolvedEmoji } from './types/resolved-emoji';

export type ChannelEndingSignatureSource = {
  title?: string;
  username?: string | null;
  mainInviteLink?: string | null;
  publicInviteLink?: string | null;
  inviteLink?: string | null;
  description?: string | null;
  presentationIconPresentation?: ResolvedEmoji | null;
};

function validTelegramChannelLink(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!['t.me', 'telegram.me'].includes(hostname) || url.username || url.password || url.port) return null;
    const path = url.pathname.replace(/\/+$/, '');
    if (!path || /^\/(?:c|s)\//i.test(path) || !/^\/(?:[a-zA-Z0-9_]{5,32}|\+[a-zA-Z0-9_-]{1,128}|joinchat\/[a-zA-Z0-9_-]{1,128})$/i.test(path)) return null;
    return `https://t.me${path}`;
  } catch {
    return null;
  }
}

function linkFromDescription(description: string | null | undefined) {
  if (!description) return null;
  const candidates = description.match(/https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\/[^\s<>()\[\]{}"'’]+/gi) ?? [];
  for (const candidate of candidates) {
    const link = validTelegramChannelLink(candidate.replace(/[.,!?;:]+$/, ''));
    if (link) return link;
  }
  return null;
}

export function channelEndingLink(channel: ChannelEndingSignatureSource) {
  const mainInviteLink = validTelegramChannelLink(channel.mainInviteLink);
  if (mainInviteLink) return mainInviteLink;

  const publicInviteLink = validTelegramChannelLink(channel.publicInviteLink);
  if (publicInviteLink) return publicInviteLink;

  const username = channel.username?.replace(/^@/, '');
  if (username && /^[a-zA-Z0-9_]{5,32}$/.test(username)) return `https://t.me/${username}`;

  return (
    validTelegramChannelLink(channel.inviteLink) ??
    linkFromDescription(channel.description)
  );
}

export function appendChannelEndingSignature(ending: string, channel: ChannelEndingSignatureSource) {
  const link = channelEndingLink(channel);
  if (!link || ending.includes(link)) return ending;
  const icon = channel.presentationIconPresentation;
  const fallback = icon?.type === 'unicode' ? icon.value.replace(/[\]\r\n]/g, '') || '📣' : '📣';
  const emoji = icon?.type === 'unicode' && /^\d{1,20}$/.test(icon.telegramCustomEmojiId || '')
    ? `![${fallback}](tg://emoji?id=${icon.telegramCustomEmojiId})`
    : fallback;
  const title = (channel.title || channel.username || 'Канал').replace(/[\[\]\r\n]/g, ' ');
  return `${ending}${ending ? '\n\n' : ''}${emoji} [${title}](${link})`;
}
