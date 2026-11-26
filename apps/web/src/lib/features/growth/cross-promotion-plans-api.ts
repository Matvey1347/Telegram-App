import type {
  CreateCrossPromotionPlanPayload,
  UpdateCrossPromotionPlanDetails,
  CrossPromotionPlan,
  CrossPromotionPlanKind,
  CrossPromotionSchedulingProgress,
  PublicationConfirmationDelivery,
} from "@telegram-system/shared";
import { api, streamProgressAction } from "@/lib/api";
import { silentFeedbackConfig } from "@/lib/http/api-client";

const basePath = "/cross-promotion-plans";

export const crossPromotionPlanKeys = {
  all: ["cross-promotion-plans"] as const,
  combined: ["cross-promotion-plans", "combined"] as const,
  list: (kind: CrossPromotionPlanKind) =>
    [...crossPromotionPlanKeys.all, kind] as const,
};

export const crossPromotionPlansApi = {
  listAll: async () => (await api.get<CrossPromotionPlan[]>(basePath)).data,
  list: async (kind: CrossPromotionPlanKind) =>
    (await api.get<CrossPromotionPlan[]>(basePath, { params: { kind } })).data,
  saveDraft: async (
    kind: CrossPromotionPlanKind,
    draft: Record<string, unknown>,
    id?: string,
  ) =>
    (
      await (id
        ? api.patch<CrossPromotionPlan>(`${basePath}/${id}/draft`, {
            kind,
            draft,
          })
        : api.post<CrossPromotionPlan>(`${basePath}/drafts`, { kind, draft }))
    ).data,
  createAndSchedule: (
    payload: CreateCrossPromotionPlanPayload,
    onProgress: (
      item: CrossPromotionSchedulingProgress,
      current: number,
      total: number,
    ) => void,
  ) =>
    streamProgressAction<CrossPromotionPlan, CrossPromotionSchedulingProgress>(
      `${basePath}/schedule-stream`,
      payload,
      onProgress,
    ),
  replaceAndSchedule: (
    id: string,
    payload: CreateCrossPromotionPlanPayload,
    onProgress: (
      item: CrossPromotionSchedulingProgress,
      current: number,
      total: number,
    ) => void,
  ) =>
    streamProgressAction<CrossPromotionPlan, CrossPromotionSchedulingProgress>(
      `${basePath}/${id}/schedule-stream`,
      payload,
      onProgress,
    ),
  replaceAndPublishNow: (
    id: string,
    payload: CreateCrossPromotionPlanPayload,
    onProgress: (
      item: CrossPromotionSchedulingProgress,
      current: number,
      total: number,
    ) => void,
  ) =>
    streamProgressAction<CrossPromotionPlan, CrossPromotionSchedulingProgress>(
      `${basePath}/${id}/publish-now-stream`,
      payload,
      onProgress,
    ),
  updatePublicationInTelegram: async (
    id: string,
    publicationId: string,
    payload: CreateCrossPromotionPlanPayload,
    onProgress: (
      item: CrossPromotionSchedulingProgress,
      current: number,
      total: number,
    ) => void = () => undefined,
  ) =>
    streamProgressAction<CrossPromotionPlan, CrossPromotionSchedulingProgress>(
      `${basePath}/${id}/publications/${publicationId}/telegram`,
      payload,
      onProgress,
      { method: "PATCH" },
    ),
  updatePublicationChannelSchedule: async (
    id: string,
    publicationId: string,
    channelId: string,
    payload: CreateCrossPromotionPlanPayload,
  ) =>
    (
      await api.patch<CrossPromotionPlan>(
        `${basePath}/${id}/publications/${publicationId}/channels/${channelId}/schedule`,
        payload,
      )
    ).data,
  replacePublicationChannelSchedule: async (
    id: string,
    publicationId: string,
    channelId: string,
    payload: CreateCrossPromotionPlanPayload,
  ) =>
    (
      await api.post<CrossPromotionPlan>(
        `${basePath}/${id}/publications/${publicationId}/channels/${channelId}/replace-schedule`,
        payload,
      )
    ).data,
  replacePublicationAndPublishNow: (
    id: string,
    publicationId: string,
    payload: CreateCrossPromotionPlanPayload,
    onProgress: (
      item: CrossPromotionSchedulingProgress,
      current: number,
      total: number,
    ) => void,
  ) =>
    streamProgressAction<CrossPromotionPlan, CrossPromotionSchedulingProgress>(
      `${basePath}/${id}/publications/${publicationId}/publish-now-stream`,
      payload,
      onProgress,
    ),
  resume: (
    id: string,
    onProgress: (
      item: CrossPromotionSchedulingProgress,
      current: number,
      total: number,
    ) => void,
  ) =>
    streamProgressAction<CrossPromotionPlan, CrossPromotionSchedulingProgress>(
      `${basePath}/${id}/resume-stream`,
      undefined,
      onProgress,
    ),
  sendToBot: async (id: string) =>
    (await api.post<PublicationConfirmationDelivery>(
      `${basePath}/${id}/send-to-bot`, undefined, silentFeedbackConfig,
    )).data,
  updateCompleted: async (
    id: string,
    payload: CreateCrossPromotionPlanPayload,
  ) => (await api.patch<CrossPromotionPlan>(`${basePath}/${id}`, payload)).data,
  updateDetails: async (
    id: string,
    details: UpdateCrossPromotionPlanDetails,
  ) =>
    (await api.patch<CrossPromotionPlan>(`${basePath}/${id}/details`, details))
      .data,
  mergeHistorical: async (id: string, sourcePlanId: string) =>
    (
      await api.post<CrossPromotionPlan>(`${basePath}/${id}/merge`, {
        sourcePlanId,
      })
    ).data,
  rename: async (id: string, title: string) =>
    (await api.patch<CrossPromotionPlan>(`${basePath}/${id}/title`, { title }))
      .data,
  refreshInviteLinkData: async (id: string) =>
    (
      await api.post<CrossPromotionPlan>(
        `${basePath}/${id}/refresh-invite-links`,
      )
    ).data,
  remove: async (id: string, silent = false): Promise<{ id: string }> =>
    (
      await api.delete<{ id: string }>(`${basePath}/${id}`, {
        feedback: silent ? { mode: "silent" } : undefined,
      } as never)
    ).data,
};
