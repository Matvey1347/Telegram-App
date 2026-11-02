import type {
  LeadAccountView,
  LeadAvailableChannel,
  LeadDiscoveryConfig,
  LeadPage,
  LeadSourceView,
  LeadSourceInput,
  LeadSourcePatch,
  LeadSourceImportPreview,
  LeadSourceImportResult,
  LeadSourceListFilter,
  LeadFeedFilter,
  LeadObservationView,
  LeadCandidateView,
  LeadCandidateListFilter,
  LeadCandidateReviewInput,
  LeadContact,
  LeadMaterialInput,
  LeadScanResult,
  LeadIngestResult,
  LeadAnalysisResult,
  LeadExport,
  LeadHistoryJob,
  LeadPipelineProgress,
} from "@telegram-system/shared";
export type { LeadHistoryJob } from "@telegram-system/shared";
import { api } from "@/lib/api";
const base = "/telegram-crm/lead-discovery";
const id = (value: string) => encodeURIComponent(value);
export const leadDiscoveryApi = {
  config: async () =>
    (await api.get<LeadDiscoveryConfig>(`${base}/config`)).data,
  accounts: async () =>
    (await api.get<LeadAccountView[]>(`${base}/accounts`)).data,
  channels: async (account: string, cursor?: string, signal?: AbortSignal) =>
    (
      await api.get<LeadPage<LeadAvailableChannel>>(
        `${base}/accounts/${id(account)}/channels`,
        { params: { cursor, limit: 50 }, signal },
      )
    ).data,
  sources: async (params: LeadSourceListFilter, signal?: AbortSignal) =>
    (
      await api.get<LeadPage<LeadSourceView>>(`${base}/sources`, {
        params,
        signal,
      })
    ).data,
  addSource: async (body: LeadSourceInput) =>
    (await api.post<LeadSourceView>(`${base}/sources`, body)).data,
  updateSource: async (source: string, body: LeadSourcePatch) =>
    (await api.patch<LeadSourceView>(`${base}/sources/${id(source)}`, body))
      .data,
  preview: async (body: { text: string; format: "TEXT" | "CSV" }) =>
    (
      await api.post<LeadSourceImportPreview>(
        `${base}/sources/import/preview`,
        body,
      )
    ).data,
  importSources: async (items: LeadSourceInput[]) =>
    (
      await api.post<LeadSourceImportResult>(`${base}/sources/import`, {
        items,
      })
    ).data,
  validate: async (source: string) =>
    (await api.post<LeadSourceView>(`${base}/sources/${id(source)}/validate`))
      .data,
  scan: async (source: string, beforeId?: number) =>
    (
      await api.post<LeadScanResult>(`${base}/sources/${id(source)}/scan`, {
        limit: 50,
        beforeId,
      })
    ).data,
  historyJob: async (source: string, signal?: AbortSignal) =>
    (
      await api.get<LeadHistoryJob | null>(
        `${base}/sources/${id(source)}/autopilot`,
        { signal },
      )
    ).data,
  pipelineProgress: async (source: string, signal?: AbortSignal) =>
    (
      await api.get<LeadPipelineProgress>(
        `${base}/sources/${id(source)}/autopilot/progress`,
        { signal },
      )
    ).data,
  historyAction: async (source: string, action: "start" | "pause" | "resume") =>
    (
      await api.post<LeadHistoryJob | null>(
        `${base}/sources/${id(source)}/autopilot/${action}`,
        {},
      )
    ).data,
  recover: async (source: string) =>
    (await api.post<LeadIngestResult>(`${base}/sources/${id(source)}/recover`))
      .data,
  materials: async (source: string, items: LeadMaterialInput[]) =>
    (
      await api.post<LeadIngestResult>(
        `${base}/sources/${id(source)}/materials`,
        { items },
      )
    ).data,
  feed: async (params: LeadFeedFilter, signal?: AbortSignal) =>
    (
      await api.get<LeadPage<LeadObservationView>>(`${base}/feed`, {
        params,
        signal,
      })
    ).data,
  analyze: async (observationIds: string[]) =>
    (
      await api.post<LeadAnalysisResult>(
        `${base}/analyze`,
        { observationIds },
        {
          feedback: { mode: "managed" },
        } as Parameters<typeof api.post>[2],
      )
    ).data,
  reviewObservation: async (
    observation: string,
    reviewStatus: "APPROVED" | "REJECTED",
  ) =>
    (
      await api.patch<LeadObservationView>(
        `${base}/observations/${id(observation)}/review`,
        { reviewStatus },
      )
    ).data,
  createCandidate: async (
    observation: string,
    body: { title: string; contacts: LeadContact[] },
  ) =>
    (
      await api.post<LeadCandidateView>(
        `${base}/observations/${id(observation)}/candidate`,
        body,
      )
    ).data,
  candidates: async (params: LeadCandidateListFilter, signal?: AbortSignal) =>
    (
      await api.get<LeadPage<LeadCandidateView>>(`${base}/candidates`, {
        params,
        signal,
      })
    ).data,
  candidate: async (candidate: string, signal?: AbortSignal) =>
    (
      await api.get<LeadCandidateView>(`${base}/candidates/${id(candidate)}`, {
        signal,
      })
    ).data,
  reviewCandidate: async (candidate: string, body: LeadCandidateReviewInput) =>
    (
      await api.patch<LeadCandidateView>(
        `${base}/candidates/${id(candidate)}/review`,
        body,
      )
    ).data,
  reviewCandidates: async (ids: string[], action: "APPROVE" | "REJECT") =>
    (
      await api.post<{ items: LeadCandidateView[] }>(
        `${base}/candidates/review`,
        { ids, action },
      )
    ).data,
  exportSources: async (format: "csv" | "xlsx") =>
    (
      await api.get<LeadExport>(`${base}/sources/export`, {
        params: { format },
      })
    ).data,
};
