import type {
  CreateCrossPromotionPlanPayload,
  CrossPromotionPlan,
  CrossPromotionPlanKind,
  CrossPromotionSchedulingProgress,
} from "@telegram-system/shared";
import { api, streamProgressAction } from "@/lib/api";

const basePath = "/cross-promotion-plans";

export const crossPromotionPlanKeys = {
  all: ["cross-promotion-plans"] as const,
  list: (kind: CrossPromotionPlanKind) =>
    [...crossPromotionPlanKeys.all, kind] as const,
};

export const crossPromotionPlansApi = {
  list: async (kind: CrossPromotionPlanKind) =>
    (await api.get<CrossPromotionPlan[]>(basePath, { params: { kind } })).data,
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
  remove: async (id: string, silent = false): Promise<{ id: string }> =>
    (
      await api.delete<{ id: string }>(`${basePath}/${id}`, {
        feedback: silent ? { mode: "silent" } : undefined,
      } as never)
    ).data,
};
