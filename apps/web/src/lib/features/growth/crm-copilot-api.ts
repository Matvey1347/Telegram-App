import type {
  CrmCopilotContextView,
  CrmCopilotDraft,
  CrmCopilotDraftPatch,
  CrmCopilotDrafts,
  CrmCopilotGenerateInput,
} from "@telegram-system/shared";
import { api } from "@/lib/api";
const path = (id: string) =>
  `/telegram-crm/conversations/${encodeURIComponent(id)}/copilot`;
export const crmCopilotApi = {
  list: async (id: string, signal?: AbortSignal) =>
    (await api.get<CrmCopilotDrafts>(path(id), { signal })).data,
  context: async (
    id: string,
    productIds: string[],
    includeNotes: boolean,
    signal?: AbortSignal,
  ) =>
    (
      await api.get<CrmCopilotContextView>(`${path(id)}/context`, {
        params: { productIds: productIds.join(","), includeNotes },
        signal,
      })
    ).data,
  generate: async (
    id: string,
    body: CrmCopilotGenerateInput,
    signal?: AbortSignal,
  ) =>
    (await api.post<CrmCopilotDraft>(`${path(id)}/generate`, body, { signal }))
      .data,
  update: async (id: string, draftId: string, body: CrmCopilotDraftPatch) =>
    (
      await api.patch<CrmCopilotDraft>(
        `${path(id)}/drafts/${encodeURIComponent(draftId)}`,
        body,
      )
    ).data,
};
