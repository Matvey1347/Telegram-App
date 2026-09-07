import type {
  CreateMutualPromotionFolderPayload,
  CreateMutualPromotionPostPayload,
  MutualPromotionActivationResult,
  MutualPromotionActivationProgress,
  MutualPromotionExpensePayload,
  MutualPromotionFolderDetail,
  MutualPromotionFolderListItem,
  MutualPromotionInviteLinkOption,
  PaginatedResponse,
  UpdateMutualPromotionFolderPayload,
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
};
