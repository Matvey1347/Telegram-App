import type { AxiosInstance } from "axios";
import type {
  TelegramContentHypothesis,
  TelegramContentHypothesisInput,
  TelegramContentHypothesisPostOption,
  TelegramManagedPostHypothesesInput,
} from "@telegram-system/shared";

export function createTelegramContentHypothesesApi(api: AxiosInstance) {
  return {
    list: async (channelId: string) =>
      (
        await api.get<TelegramContentHypothesis[]>(
          `/telegram-channels/${channelId}/content-hypotheses`,
        )
      ).data,
    postOptions: async (channelId: string) =>
      (
        await api.get<TelegramContentHypothesisPostOption[]>(
          `/telegram-channels/${channelId}/content-hypotheses/post-options`,
        )
      ).data,
    create: async (
      channelId: string,
      payload: TelegramContentHypothesisInput,
    ) =>
      (
        await api.post<TelegramContentHypothesis>(
          `/telegram-channels/${channelId}/content-hypotheses`,
          payload,
        )
      ).data,
    update: async (
      channelId: string,
      hypothesisId: string,
      payload: TelegramContentHypothesisInput,
    ) =>
      (
        await api.patch<TelegramContentHypothesis>(
          `/telegram-channels/${channelId}/content-hypotheses/${hypothesisId}`,
          payload,
        )
      ).data,
    remove: async (channelId: string, hypothesisId: string) =>
      (
        await api.delete<TelegramContentHypothesis>(
          `/telegram-channels/${channelId}/content-hypotheses/${hypothesisId}`,
        )
      ).data,
    assignToPost: async (
      channelId: string,
      postId: string,
      payload: TelegramManagedPostHypothesesInput,
    ) =>
      (
        await api.put<TelegramContentHypothesis[]>(
          `/telegram-channels/${channelId}/managed-posts/${postId}/hypotheses`,
          payload,
        )
      ).data,
  };
}
