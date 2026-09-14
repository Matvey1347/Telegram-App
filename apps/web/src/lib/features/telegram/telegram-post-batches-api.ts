import type {
  LinkTelegramPostBatchPayload,
  TelegramPostBatch,
  TelegramPostBatchAssociation,
  TelegramPostBatchAssociationTarget,
  TelegramPostBatchDeliveryPage,
  TelegramPostBatchDispatchResult,
  TelegramPostBatchListResponse,
  TelegramSystemBotPostDraft,
  UpdateTelegramPostBatchPayload,
} from "@telegram-system/shared";
import type { AxiosInstance } from "axios";
import { api } from "@/lib/api";

const batchPath = "/telegram-post-batches";
const importPath = "/telegram/system-bot/post-batch-import";
const silentFeedback = { feedback: { mode: "silent" } } as never;

export type TelegramPostBatchImportResult =
  | { ready: false }
  | { ready: true; drafts: TelegramSystemBotPostDraft[] };

export function createTelegramPostBatchesApi(client: AxiosInstance) {
  return {
    prepareImport: async () =>
      (
        await client.post<{ workflowId: string }>(
          importPath,
          undefined,
          silentFeedback,
        )
      ).data,
    importResult: async (workflowId: string) =>
      (
        await client.get<TelegramPostBatchImportResult>(importPath, {
          params: { workflowId, _: Date.now() },
          headers: { "Cache-Control": "no-cache" },
        })
      ).data,
    importWorkflow: async (workflowId: string) =>
      (
        await client.post<TelegramPostBatch>(
          `${batchPath}/import`,
          { workflowId },
          silentFeedback,
        )
      ).data,
    list: async (params: { page: number; pageSize: number }) =>
      (await client.get<TelegramPostBatchListResponse>(batchPath, { params }))
        .data,
    detail: async (batchId: string) =>
      (await client.get<TelegramPostBatch>(`${batchPath}/${batchId}`)).data,
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
    linkTargets: async (type: TelegramPostBatchAssociation["type"]) =>
      (
        await client.get<TelegramPostBatchAssociationTarget[]>(
          `${batchPath}/link-targets`,
          { params: { type } },
        )
      ).data,
    update: async (batchId: string, payload: UpdateTelegramPostBatchPayload) =>
      (
        await client.patch<TelegramPostBatch>(
          `${batchPath}/${batchId}`,
          payload,
        )
      ).data,
    dispatch: async (batchId: string, expectedVersion: number) =>
      (
        await client.post<TelegramPostBatchDispatchResult>(
          `${batchPath}/${batchId}/dispatch`,
          { expectedVersion },
        )
      ).data,
    link: async (batchId: string, payload: LinkTelegramPostBatchPayload) =>
      (
        await client.post<TelegramPostBatch>(
          `${batchPath}/${batchId}/links`,
          payload,
        )
      ).data,
  };
}

export const telegramPostBatchesApi = createTelegramPostBatchesApi(api);
