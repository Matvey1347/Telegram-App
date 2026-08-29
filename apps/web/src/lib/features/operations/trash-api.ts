import type { AxiosInstance } from "axios";
import type { PaginatedResponse } from "@telegram-system/shared";
import type { PaginationParams } from "../../api-types";

export type TrashItem = {
  id: string;
  kind: string;
  name: string;
  product: string;
  deletedAt: string;
  expiresAt: string;
  daysRemaining: number;
};

export function createTrashApi(api: AxiosInstance) {
  return {
    list: async (params: PaginationParams) =>
      (await api.get<PaginatedResponse<TrashItem>>("/trash", { params })).data,
    restore: async (kind: string, id: string) =>
      (await api.patch(`/trash/${kind}/${id}/restore`)).data,
  };
}
