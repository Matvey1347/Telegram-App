import type {
  CreateMutualPromotionFolderPayload,
  CreateMutualPromotionPostPayload,
  ImportMutualPromotionInviteLinkPayload,
  MutualPromotionActivationResult,
  MutualPromotionActivationProgress,
  MutualPromotionExpensePayload,
  MutualPromotionFolderDetail,
  MutualPromotionFolderListItem,
  MutualPromotionInviteLinkOption,
  PaginatedResponse,
  UpdateMutualPromotionFolderPayload,
  UpdateMutualPromotionFolderTitlePayload,
  UpdateMutualPromotionInviteLinksPayload,
  UpdateMutualPromotionPostPayload,
} from "@telegram-system/shared";
import { api, streamProgressAction } from "@/lib/api";

const basePath = "/mutual-promotion-folders";

export const mutualPromotionFoldersApi = {
  list: async (params?: { page?: number; pageSize?: number }) =>
    (
      await api.get<PaginatedResponse<MutualPromotionFolderListItem>>(
        basePath,
        { params },
      )
    ).data,
  get: async (id: string) =>
    (await api.get<MutualPromotionFolderDetail>(`${basePath}/${id}`)).data,
  create: async (payload: CreateMutualPromotionFolderPayload) =>
    (await api.post<MutualPromotionFolderDetail>(basePath, payload)).data,
  update: async (id: string, payload: UpdateMutualPromotionFolderPayload) =>
    (await api.patch<MutualPromotionFolderDetail>(`${basePath}/${id}`, payload))
      .data,
  updateTitle: async (
    id: string,
    payload: UpdateMutualPromotionFolderTitlePayload,
  ) =>
    (
      await api.patch<MutualPromotionFolderDetail>(
        `${basePath}/${id}/title`,
        payload,
      )
    ).data,
  refreshInviteLinkData: async (id: string) =>
    (
      await api.post<MutualPromotionFolderDetail>(
        `${basePath}/${id}/refresh-invite-links`,
      )
    ).data,
  remove: async (id: string) =>
    (await api.delete<{ id: string }>(`${basePath}/${id}`)).data,
  updateInviteLinks: async (
    id: string,
    payload: UpdateMutualPromotionInviteLinksPayload,
  ) =>
    (
      await api.patch<MutualPromotionFolderDetail>(
        `${basePath}/${id}/invite-links`,
        payload,
      )
    ).data,
  activate: async (
    id: string,
    onProgress: (
      item: MutualPromotionActivationProgress,
      current: number,
      total: number,
    ) => void,
  ) =>
    streamProgressAction<
      MutualPromotionActivationResult,
      MutualPromotionActivationProgress
    >(`${basePath}/${id}/activate`, {}, onProgress),
  cancel: async (id: string) =>
    (await api.post<MutualPromotionFolderDetail>(`${basePath}/${id}/cancel`))
      .data,
  addPost: async (id: string, payload: CreateMutualPromotionPostPayload) =>
    (
      await api.post<MutualPromotionFolderDetail>(
        `${basePath}/${id}/posts`,
        payload,
      )
    ).data,
  updatePost: async (
    id: string,
    postId: string,
    payload: UpdateMutualPromotionPostPayload,
  ) =>
    (
      await api.patch<MutualPromotionFolderDetail>(
        `${basePath}/${id}/posts/${postId}`,
        payload,
      )
    ).data,
  removePost: async (id: string, postId: string) =>
    (
      await api.delete<MutualPromotionFolderDetail>(
        `${basePath}/${id}/posts/${postId}`,
      )
    ).data,
  upsertExpense: async (
    id: string,
    participantId: string,
    payload: MutualPromotionExpensePayload,
  ) =>
    (
      await api.put<MutualPromotionFolderDetail>(
        `${basePath}/${id}/participants/${participantId}/expense`,
        payload,
      )
    ).data,
  inviteLinkOptions: async (params: {
    channelIds: string[];
    startsAt?: string;
    endsAt: string;
    folderId?: string;
    initial?: boolean;
  }) =>
    (
      await api.get<MutualPromotionInviteLinkOption[]>(
        `${basePath}/invite-link-options`,
        {
          params: {
            ...params,
            channelIds: params.channelIds.join(","),
          },
        },
      )
    ).data,
  importInviteLink: async (payload: ImportMutualPromotionInviteLinkPayload) =>
    (
      await api.post<MutualPromotionInviteLinkOption>(
        `${basePath}/invite-link-options/import`,
        payload,
      )
    ).data,
};
