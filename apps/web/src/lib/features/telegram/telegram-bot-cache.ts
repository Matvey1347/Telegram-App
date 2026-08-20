import type { QueryClient } from "@tanstack/react-query";
import type { TelegramBot } from "@/lib/api";
import { telegramAccountKeys } from "@/lib/query-keys";

export function reconcileTelegramBotCache(
  queryClient: QueryClient,
  bot: TelegramBot,
) {
  queryClient.setQueryData<TelegramBot[]>(
    telegramAccountKeys.bots(),
    (current) => {
      if (!current) return [bot];
      const exists = current.some((item) => item.id === bot.id);
      return exists
        ? current.map((item) => (item.id === bot.id ? bot : item))
        : [bot, ...current];
    },
  );
}

export function removeTelegramBotFromCache(
  queryClient: QueryClient,
  botId: string,
) {
  queryClient.setQueryData<TelegramBot[]>(
    telegramAccountKeys.bots(),
    (current) => current?.filter((item) => item.id !== botId),
  );
}
