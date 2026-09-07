/** Serializable Custom Emoji contracts. Telegram document identifiers are strings
 * because Telegram uses signed 64-bit identifiers. */
export type TelegramCustomEmojiKind = "STATIC" | "ANIMATED" | "VIDEO";

export interface TelegramCustomEmoji {
  id: string;
  documentId: string;
  alt: string;
  mimeType: string | null;
  kind: TelegramCustomEmojiKind;
  isFree: boolean;
  needsRepainting: boolean;
  position: number;
  assetUrl: string | null;
  /** Browser-readable Lottie JSON derived from the original .tgs asset. */
  renderAssetUrl: string | null;
}

export interface TelegramCustomEmojiPackSummary {
  id: string;
  shortName: string;
  title: string;
  telegramLink: string;
  emojis: TelegramCustomEmoji[];
}

export interface TelegramWorkspaceCustomEmojiPacksResponse {
  packs: TelegramCustomEmojiPackSummary[];
}

export interface ImportTelegramCustomEmojiPackInput {
  source: string;
}
