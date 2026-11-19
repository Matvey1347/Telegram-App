import type { ResolvedEmoji } from "@telegram-system/shared";

export type ChannelEndingSignatureSource = {
  title?: string;
  username?: string | null;
  inviteLink?: string | null;
  presentationIconPresentation?: ResolvedEmoji | null;
};

export function channelEndingLink(channel: ChannelEndingSignatureSource) {
  const username = channel.username?.replace(/^@/, "");
  if (username && /^[a-zA-Z0-9_]+$/.test(username)) return `https://t.me/${username}`;
  return /^https:\/\/t\.me\/[a-zA-Z0-9_+/-]+$/.test(channel.inviteLink || "")
    ? channel.inviteLink!
    : null;
}

/** Explicit insertion preserves all user text and is idempotent for this channel link. */
export function appendChannelEndingSignature(ending: string, channel: ChannelEndingSignatureSource) {
  const link = channelEndingLink(channel);
  if (!link || ending.includes(link)) return ending;
  const icon = channel.presentationIconPresentation;
  const fallback = icon?.type === "unicode" ? icon.value.replace(/[\]\r\n]/g, "") || "📣" : "📣";
  const emoji = icon?.type === "unicode" && /^\d{1,20}$/.test(icon.telegramCustomEmojiId || "")
    ? `![${fallback}](tg://emoji?id=${icon.telegramCustomEmojiId})`
    : fallback;
  const title = (channel.title || channel.username || "Канал").replace(/[[\]\r\n]/g, " ");
  return `${ending}${ending ? "\n\n" : ""}${emoji} [${title}](${link})`;
}
