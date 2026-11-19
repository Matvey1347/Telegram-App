/** System avatar packs are global infrastructure; these are workspace-owned channel settings. */
export type TelegramChannelAvatarEmojiState = {
  avatarEmojiIconId?: string | null;
  avatarEmojiStatus?: 'PENDING' | 'READY' | 'NO_AVATAR' | 'ERROR' | null;
  avatarEmojiError?: string | null;
  avatarEmojiManual?: boolean;
};
