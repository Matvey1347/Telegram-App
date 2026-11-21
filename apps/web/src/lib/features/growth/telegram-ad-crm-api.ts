import type { AxiosInstance } from "axios";
import type {
  TelegramAdCrmAdvertiserListItem,
  TelegramAdvertiser,
  TelegramAdvertiserActivity,
  TelegramAdvertiserContact,
  TelegramAdvertiserTask,
  TelegramAdCrmMemberSettings,
  TelegramAdCrmWorkspaceSettings,
  TelegramAdCrmAdvertiserSortBy,
  TelegramAdCrmSortDirection,
} from "@telegram-system/shared";
import type { PaginatedResponse, PaginationParams } from "../../api-types";

export function createTelegramAdCrmApi(
  api: AxiosInstance,
  getPaginated: <T>(
    path: string,
    params?: Record<string, unknown>,
  ) => Promise<PaginatedResponse<T>>,
) {
  return {
    listCrmAdvertisers: async (
      params?: PaginationParams & {
        search?: string;
        status?: string;
        lifecycleStage?: string;
        ownerMemberId?: string;
        archived?: boolean;
        sortBy?: TelegramAdCrmAdvertiserSortBy;
        sortDirection?: TelegramAdCrmSortDirection;
      },
    ) =>
      getPaginated<TelegramAdCrmAdvertiserListItem>(
        "/telegram-ad-sales/crm/advertisers",
        params,
      ),
    listAdvertisers: async (
      params?: PaginationParams & {
        search?: string;
        status?: string;
        lifecycleStage?: string;
        ownerMemberId?: string;
        archived?: boolean;
      },
    ) =>
      getPaginated<TelegramAdvertiser>(
        "/telegram-ad-sales/advertisers",
        params,
      ),
    searchAdvertisers: async (params: { q: string; limit?: number }) =>
      (
        await api.get<TelegramAdvertiser[]>(
          "/telegram-ad-sales/advertisers/search",
          { params },
        )
      ).data,
    getAdvertiser: async (id: string) =>
      (
        await api.get<TelegramAdvertiser>(
          `/telegram-ad-sales/advertisers/${id}`,
        )
      ).data,
    createAdvertiser: async (payload: Record<string, unknown>) =>
      (
        await api.post<TelegramAdvertiser>(
          "/telegram-ad-sales/advertisers",
          payload,
        )
      ).data,
    updateAdvertiser: async (id: string, payload: Record<string, unknown>) =>
      (
        await api.patch<TelegramAdvertiser>(
          `/telegram-ad-sales/advertisers/${id}`,
          payload,
        )
      ).data,
    archiveAdvertiser: async (id: string) =>
      (
        await api.post<TelegramAdvertiser>(
          `/telegram-ad-sales/advertisers/${id}/archive`,
        )
      ).data,
    restoreAdvertiser: async (id: string) =>
      (
        await api.post<TelegramAdvertiser>(
          `/telegram-ad-sales/advertisers/${id}/restore`,
        )
      ).data,
    addAdvertiserContact: async (
      id: string,
      payload: Record<string, unknown>,
    ) =>
      (
        await api.post<TelegramAdvertiserContact>(
          `/telegram-ad-sales/advertisers/${id}/contacts`,
          payload,
        )
      ).data,
    setPrimaryAdvertiserContact: async (id: string, contactId: string) =>
      (
        await api.post<TelegramAdvertiserContact>(
          `/telegram-ad-sales/advertisers/${id}/contacts/${contactId}/set-primary`,
        )
      ).data,
    listAdvertiserActivities: async (id: string, params?: PaginationParams) =>
      getPaginated<TelegramAdvertiserActivity>(
        `/telegram-ad-sales/advertisers/${id}/activities`,
        params,
      ),
    createAdvertiserActivity: async (
      id: string,
      payload: Record<string, unknown>,
    ) =>
      (
        await api.post<TelegramAdvertiserActivity>(
          `/telegram-ad-sales/advertisers/${id}/activities`,
          payload,
        )
      ).data,
    createAdvertiserNote: async (
      id: string,
      payload: Record<string, unknown>,
    ) =>
      (
        await api.post<TelegramAdvertiserActivity>(
          `/telegram-ad-sales/advertisers/${id}/notes`,
          payload,
        )
      ).data,
    listCrmTasks: async (
      params?: PaginationParams & {
        advertiserId?: string;
        assignedMemberId?: string;
        status?: string;
        type?: string;
      },
    ) =>
      getPaginated<TelegramAdvertiserTask>(
        "/telegram-ad-sales/crm/tasks",
        params,
      ),
    createAdvertiserTask: async (
      id: string,
      payload: Record<string, unknown>,
    ) =>
      (
        await api.post<TelegramAdvertiserTask>(
          `/telegram-ad-sales/advertisers/${id}/tasks`,
          payload,
        )
      ).data,
    updateCrmTask: async (taskId: string, payload: Record<string, unknown>) =>
      (
        await api.patch<TelegramAdvertiserTask>(
          `/telegram-ad-sales/crm/tasks/${taskId}`,
          payload,
        )
      ).data,
    completeCrmTask: async (
      taskId: string,
      payload?: Record<string, unknown>,
    ) =>
      (
        await api.post<TelegramAdvertiserTask>(
          `/telegram-ad-sales/crm/tasks/${taskId}/complete`,
          payload ?? {},
        )
      ).data,
    getCrmWorkspaceSettings: async () =>
      (
        await api.get<TelegramAdCrmWorkspaceSettings>(
          "/telegram-ad-sales/crm/settings/workspace",
        )
      ).data,
    updateCrmWorkspaceSettings: async (payload: Record<string, unknown>) =>
      (
        await api.put<TelegramAdCrmWorkspaceSettings>(
          "/telegram-ad-sales/crm/settings/workspace",
          payload,
        )
      ).data,
    getCrmMemberSettings: async () =>
      (
        await api.get<TelegramAdCrmMemberSettings>(
          "/telegram-ad-sales/crm/settings/member",
        )
      ).data,
    updateCrmMemberSettings: async (payload: Record<string, unknown>) =>
      (
        await api.put<TelegramAdCrmMemberSettings>(
          "/telegram-ad-sales/crm/settings/member",
          payload,
        )
      ).data,
  };
}
