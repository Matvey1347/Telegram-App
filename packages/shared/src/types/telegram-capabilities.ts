export type TelegramAccountCapabilities = {
  isPremium: boolean;
  captionLengthMax: number;
  messageLengthMax: number;
  maxUploadFileSizeMb: number;
  supportsCustomEmoji: boolean;
  checkedAt: string;
  limitsSource: "telegram_config" | "fallback";
};

export type TelegramPublishingCapabilities = {
  source: {
    sourceId: string;
    sourceType: "MTPROTO" | "BOT";
    displayName: string;
    avatarUrl?: string | null;
    isPremium: boolean;
  } | null;
  captionLengthMax: number;
  messageLengthMax: number;
  maxUploadFileSizeMb: number | null;
  supportsCustomEmoji: boolean;
  /** Inline keyboards require an active Bot API source with posting access. */
  canPublishInlineButtons: boolean;
  checkedAt: string | null;
  isFallback: boolean;
};
