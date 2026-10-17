import type { TelegramBotApplicationType } from "@telegram-system/shared";

const presentation = {
  NONE: { label: "Access", emoji: "🤖" },
  FINANCE: { label: "Finance", emoji: "💰" },
} as const;

export function runtimeAppPresentation(type: TelegramBotApplicationType) {
  return presentation[type as keyof typeof presentation] ?? presentation.NONE;
}
