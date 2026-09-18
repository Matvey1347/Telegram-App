import type {
  CreateTelegramPostBatchPayload,
  CreateAndDispatchTelegramPostBatchPayload,
  TelegramPostBatch,
  TelegramPostBatchDeliveryPage,
  TelegramPostBatchDispatchResult,
  TelegramPostBatchListResponse,
  UpdateTelegramPostBatchPayload,
} from "@telegram-system/shared";
import type { AxiosInstance } from "axios";
import { api } from "@/lib/api";

const batchPath = "/telegram-post-batches";
const silentFeedback = { feedback: { mode: "silent" } } as never;

export function createTelegramPostBatchesApi(client: AxiosInstance) {
  return {
    createAndDispatch: async (
      payload: CreateAndDispatchTelegramPostBatchPayload,
    ) =>
      (
        await client.post<TelegramPostBatchDispatchResult>(
          `${batchPath}/dispatch`,
          payload,
        )
      ).data,
    create: async (payload: CreateTelegramPostBatchPayload) =>
      (await client.post<TelegramPostBatch>(batchPath, payload, silentFeedback))
        .data,
    importWorkflow: async (workflowId: string) =>
      (
        await client.post<TelegramPostBatch>(
          `${batchPath}/import`,
          { workflowId },
          silentFeedback,
        )
      ).data,
    importPost: async (
      batchId: string,
      postId: string,
      workflowId: string,
      expectedVersion: number,
    ) =>
      (
        await client.post<TelegramPostBatch>(
          `${batchPath}/${batchId}/posts/${postId}/import`,
          { workflowId, expectedVersion },
          silentFeedback,
        )
      ).data,
    list: async (params: { page: number; pageSize: number }) =>
      (await client.get<TelegramPostBatchListResponse>(batchPath, { params }))
        .data,
    detail: async (batchId: string) =>
      (await client.get<TelegramPostBatch>(`${batchPath}/${batchId}`)).data,
    addPost: async (batchId: string) =>
      (
        await client.post<TelegramPostBatch>(
          `${batchPath}/${batchId}/posts`,
          undefined,
          silentFeedback,
        )
      ).data,
    deliveries: async (
      batchId: string,
      params: { page: number; pageSize: number },
    ) =>
      (
        await client.get<TelegramPostBatchDeliveryPage>(
          `${batchPath}/${batchId}/deliveries`,
          { params },
        )
      ).data,
    update: async (batchId: string, payload: UpdateTelegramPostBatchPayload) =>
      (
        await client.patch<TelegramPostBatch>(
          `${batchPath}/${batchId}`,
          payload,
        )
      ).data,
    removeDraft: async (batchId: string) =>
      (
        await client.delete<{ success: true }>(
          `${batchPath}/${batchId}`,
          silentFeedback,
        )
      ).data,
    dispatch: async (batchId: string, expectedVersion: number) =>
      (
        await client.post<TelegramPostBatchDispatchResult>(
          `${batchPath}/${batchId}/dispatch`,
          { expectedVersion },
        )
      ).data,
  };
}

export const telegramPostBatchesApi = createTelegramPostBatchesApi(api);
