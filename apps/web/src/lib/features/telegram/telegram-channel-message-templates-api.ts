import type {
  TelegramChannelMessageTemplate,
  TelegramChannelMessageTemplatePayload,
  TelegramMessageTemplateSourceResponse,
  TelegramMessageTemplateSourcePayload,
} from "@telegram-system/shared";
import { api } from "@/lib/api";

const basePath = "/telegram-channel-message-templates";

export const telegramMessageTemplateKeys = {
  all: ["telegram-channel-message-templates"] as const,
  list: () => ["telegram-channel-message-templates", "list"] as const,
  source: (channelIds: string[]) =>
    ["telegram-channel-message-templates", "source", ...channelIds] as const,
};

export const telegramChannelMessageTemplatesApi = {
  list: async () =>
    (await api.get<TelegramChannelMessageTemplate[]>(basePath)).data,
  create: async (payload: TelegramChannelMessageTemplatePayload) =>
    (await api.post<TelegramChannelMessageTemplate>(basePath, payload)).data,
  update: async (id: string, payload: TelegramChannelMessageTemplatePayload) =>
    (
      await api.patch<TelegramChannelMessageTemplate>(
        `${basePath}/${id}`,
        payload,
      )
    ).data,
  remove: async (id: string) =>
    (await api.delete<{ success: boolean }>(`${basePath}/${id}`)).data,
  source: async (input: string[] | TelegramMessageTemplateSourcePayload) =>
    (
      await api.post<TelegramMessageTemplateSourceResponse>(
        `${basePath}/source`,
        Array.isArray(input) ? { channelIds: input } : input,
      )
    ).data,
};
