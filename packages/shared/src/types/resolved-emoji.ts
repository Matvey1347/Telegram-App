export type ResolvedEmoji =
  | {
      type: "unicode";
      value: string;
      name?: string | null;
      /** Preserved when the unicode fallback represents a Telegram Premium emoji. */
      telegramCustomEmojiId?: string | null;
      telegramCustomEmojiKind?: "STATIC" | "ANIMATED" | "VIDEO" | null;
      telegramCustomEmojiAssetUrl?: string | null;
      telegramCustomEmojiRenderAssetUrl?: string | null;
    }
  | {
      type: "image";
      id: string;
      url: string;
      name?: string | null;
    };
