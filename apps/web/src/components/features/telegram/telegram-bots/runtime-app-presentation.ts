import type { TelegramBotApplicationType } from "@telegram-system/shared";

const presentation: Record<TelegramBotApplicationType, { label: string; emoji: string }> = {
  NONE: { label: "Access", emoji: "🤖" },
  GREETER: { label: "Greeter", emoji: "👋" },
  FINANCE: { label: "Finance", emoji: "💰" },
};

export function runtimeAppPresentation(type: TelegramBotApplicationType) {
  return presentation[type];
}
