import type {
  CrmPackageSalesContext,
  LeadCandidateView,
  LeadPage,
  LeadPreparationView,
  LeadQualificationInput,
  LeadCandidateDraftInput,
  LeadQualificationDecisionInput,
  LeadCandidateDraftPatch,
  LeadPreparationQueueInput,
} from "@telegram-system/shared";
import { api } from "@/lib/api";
const base = "/telegram-crm/lead-discovery";
const candidate = (id: string) =>
  `${base}/candidates/${encodeURIComponent(id)}`;
export const leadPreparationApi = {
  queue: async (params: LeadPreparationQueueInput, signal?: AbortSignal) =>
    (
      await api.get<LeadPage<LeadCandidateView>>(`${base}/preparation/queue`, {
        params,
        signal,
      })
    ).data,
  get: async (id: string, signal?: AbortSignal) =>
    (
      await api.get<LeadPreparationView>(`${candidate(id)}/preparation`, {
        signal,
      })
    ).data,
  products: async (cursor?: string, signal?: AbortSignal) =>
    (
      await api.get<CrmPackageSalesContext>(`${base}/preparation/products`, {
        params: { cursor, limit: 25 },
        signal,
      })
    ).data,
  qualify: async (id: string, body: LeadQualificationInput) =>
    (await api.post<LeadPreparationView>(`${candidate(id)}/qualify`, body))
      .data,
  decide: async (id: string, body: LeadQualificationDecisionInput) =>
    (
      await api.patch<LeadPreparationView>(
        `${candidate(id)}/qualification-decision`,
        body,
      )
    ).data,
  generate: async (id: string, body: LeadCandidateDraftInput) =>
    (await api.post<LeadPreparationView>(`${candidate(id)}/drafts`, body)).data,
  updateDraft: async (
    id: string,
    draft: string,
    body: LeadCandidateDraftPatch,
  ) =>
    (
      await api.patch<LeadPreparationView>(
        `${candidate(id)}/drafts/${encodeURIComponent(draft)}`,
        body,
      )
    ).data,
  contact: async (id: string, signal?: AbortSignal) =>
    (
      await api.get<LeadPage<LeadCandidateView>>(
        `${base}/contacts/${encodeURIComponent(id)}/preparations`,
        { signal },
      )
    ).data,
};
