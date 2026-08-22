import type { AxiosInstance } from "axios";
import type {
  CreateTelegramBotRuntimePayload,
  PaginatedResponse,
  SwitchTelegramBotApplicationPayload,
  TelegramBotRuntimeEnvironment,
  UpdateTelegramBotRuntimePayload,
} from "@telegram-system/shared";
import type {
  PaginationParams,
  TelegramAccountChannelImportItem,
  TelegramBot,
  TelegramChannelNetwork,
  TelegramChannelNetworkDetail,
  TelegramChannelNetworkSummary,
  TelegramSourceChannelAccess,
  TelegramUserAccount,
  TelegramUserAccountSyncDialogsResponse,
  CreateTelegramChannelNetworkPayload,
  UpdateTelegramChannelNetworkPayload,
} from "../../api-types";
import type { StreamProgressHandler } from "./telegram-channel-helpers-api";

type PaginatedGetter = <T>(
  path: string,
  params?: Record<string, unknown>,
) => Promise<PaginatedResponse<T>>;
type AllPaginatedGetter = <T>(
  path: string,
  params?: Record<string, unknown>,
) => Promise<T[]>;
type CrudFactory = <T>(path: string) => {
  list: () => Promise<T[]>;
  get: (id: string) => Promise<T>;
  create: (payload: Record<string, unknown>) => Promise<T>;
  update: (id: string, payload: Record<string, unknown>) => Promise<T>;
  remove: (id: string) => Promise<T>;
};

export function createTelegramSourcesApi({
  api,
  crud,
  getPaginated,
  getAllPaginatedItems,
  streamProgressAction,
}: {
  api: AxiosInstance;
  crud: CrudFactory;
  getPaginated: PaginatedGetter;
  getAllPaginatedItems: AllPaginatedGetter;
  streamProgressAction: <TResult, TItem = { message?: string }>(
    path: string,
    payload: unknown,
    onProgress: StreamProgressHandler<TItem>,
  ) => Promise<TResult>;
}) {
  const telegramChannelNetworksApi = {
    listPage: async (params?: PaginationParams) =>
      getPaginated<TelegramChannelNetwork>(
        "/telegram-channel-networks",
        params,
      ),
    list: async () =>
      getAllPaginatedItems<TelegramChannelNetwork>(
        "/telegram-channel-networks",
      ),
    get: async (id: string) =>
      (
        await api.get<TelegramChannelNetworkDetail>(
          `/telegram-channel-networks/${id}`,
        )
      ).data,
    create: async (payload: CreateTelegramChannelNetworkPayload) =>
      (
        await api.post<TelegramChannelNetworkDetail>(
          "/telegram-channel-networks",
          payload,
        )
      ).data,
    update: async (id: string, payload: UpdateTelegramChannelNetworkPayload) =>
      (
        await api.patch<TelegramChannelNetworkDetail>(
          `/telegram-channel-networks/${id}`,
          payload,
        )
      ).data,
    remove: async (id: string) =>
      (
        await api.delete<{ success: boolean }>(
          `/telegram-channel-networks/${id}`,
        )
      ).data,
    summary: async (id: string) =>
      (
        await api.get<TelegramChannelNetworkSummary>(
          `/telegram-channel-networks/${id}/summary`,
        )
      ).data,
  };
  const telegramUserAccountsApi = {
    ...crud<TelegramUserAccount>("/telegram-user-accounts"),
    startLogin: async (id: string, phone?: string) =>
      (await api.post(`/telegram-user-accounts/${id}/login/start`, { phone }))
        .data,
    confirmCode: async (id: string, code: string) =>
      (await api.post(`/telegram-user-accounts/${id}/login/code`, { code }))
        .data,
    confirmPassword: async (id: string, password: string) =>
      (
        await api.post(`/telegram-user-accounts/${id}/login/password`, {
          password,
        })
      ).data,
    check: async (id: string) =>
      (await api.post(`/telegram-user-accounts/${id}/check`)).data,
    syncDialogs: async (id: string) =>
      (
        await api.post<TelegramUserAccountSyncDialogsResponse>(
          `/telegram-user-accounts/${id}/sync-dialogs`,
        )
      ).data,
    syncDialogsWithProgress: async (
      id: string,
      onProgress: StreamProgressHandler<{ message?: string }>,
    ) =>
      streamProgressAction<
        TelegramUserAccountSyncDialogsResponse,
        { message?: string }
      >(`/telegram-user-accounts/${id}/sync-dialogs-stream`, {}, onProgress),
    importChannels: async (
      id: string,
      channels: TelegramAccountChannelImportItem[],
    ) =>
      (
        await api.post<TelegramUserAccountSyncDialogsResponse>(
          `/telegram-user-accounts/${id}/channels/import`,
          { channels },
        )
      ).data,
    importChannelsWithProgress: async (
      id: string,
      channels: TelegramAccountChannelImportItem[],
      onProgress: StreamProgressHandler<{ message?: string }>,
    ) =>
      streamProgressAction<
        TelegramUserAccountSyncDialogsResponse,
        { message?: string }
      >(
        `/telegram-user-accounts/${id}/channels/import-stream`,
        { channels },
        onProgress,
      ),
    channels: async (id: string) =>
      (
        await api.get<TelegramSourceChannelAccess[]>(
          `/telegram-user-accounts/${id}/channels`,
        )
      ).data,
  };
  const telegramBotsApi = {
    ...crud<TelegramBot>("/telegram-bots"),
    connectRuntime: async (
      id: string,
      payload: CreateTelegramBotRuntimePayload,
    ) =>
      (
        await api.post<TelegramBot>(
          `/telegram-bots/${id}/runtimes/${payload.environment}`,
          { botToken: payload.botToken },
        )
      ).data,
    updateRuntime: async (
      id: string,
      environment: TelegramBotRuntimeEnvironment,
      payload: UpdateTelegramBotRuntimePayload,
    ) =>
      (
        await api.post<TelegramBot>(
          `/telegram-bots/${id}/runtimes/${environment}`,
          payload,
        )
      ).data,
    checkRuntime: async (
      id: string,
      environment: TelegramBotRuntimeEnvironment,
    ) =>
      (
        await api.post<TelegramBot>(
          `/telegram-bots/${id}/runtimes/${environment}/check`,
        )
      ).data,
    updateRuntimeProfile: async (
      id: string,
      environment: TelegramBotRuntimeEnvironment,
      payload: { name?: string; avatar?: File },
    ) => {
      const form = new FormData();
      if (payload.name?.trim()) form.append("name", payload.name.trim());
      if (payload.avatar) form.append("avatar", payload.avatar);
      form.append("confirmTelegramUpdate", "true");
      return (
        await api.patch<TelegramBot>(
          `/telegram-bots/${id}/runtimes/${environment}/profile`,
          form,
        )
      ).data;
    },
    enableRuntime: async (
      id: string,
      environment: TelegramBotRuntimeEnvironment,
    ) =>
      (
        await api.post<TelegramBot>(
          `/telegram-bots/${id}/runtimes/${environment}/enable`,
        )
      ).data,
    disableRuntime: async (
      id: string,
      environment: TelegramBotRuntimeEnvironment,
    ) =>
      (
        await api.post<TelegramBot>(
          `/telegram-bots/${id}/runtimes/${environment}/disable`,
        )
      ).data,
    removeRuntime: async (
      id: string,
      environment: TelegramBotRuntimeEnvironment,
    ) =>
      (
        await api.delete<TelegramBot>(
          `/telegram-bots/${id}/runtimes/${environment}`,
        )
      ).data,
    switchApplication: async (
      id: string,
      payload: SwitchTelegramBotApplicationPayload,
    ) =>
      (await api.post<TelegramBot>(`/telegram-bots/${id}/application`, payload))
        .data,
    channels: async (id: string) =>
      (
        await api.get<TelegramSourceChannelAccess[]>(
          `/telegram-bots/${id}/channels`,
        )
      ).data,
  };

  return {
    telegramChannelNetworksApi,
    telegramUserAccountsApi,
    telegramBotsApi,
  };
}
