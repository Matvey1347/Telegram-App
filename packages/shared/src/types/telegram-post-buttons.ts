export type TelegramPostButtonStyle =
  | "default"
  | "primary"
  | "success"
  | "danger";

export type TelegramPostButton = {
  text: string;
  url: string;
  style: TelegramPostButtonStyle;
};

export type TelegramPostButtonRows = TelegramPostButton[][];
