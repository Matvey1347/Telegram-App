export type TelegramPostButtonStyle =
  | "default"
  | "primary"
  | "success"
  | "danger";

export type TelegramPostButton = {
  text: string;
  url: string;
  style: TelegramPostButtonStyle;
  /** Telegram Bot API custom emoji rendered before the button label. */
  iconCustomEmojiId?: string;
};

export type TelegramPostButtonRows = TelegramPostButton[][];
