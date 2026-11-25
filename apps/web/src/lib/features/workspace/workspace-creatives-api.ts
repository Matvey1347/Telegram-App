import { api, silentFeedbackConfig } from "@/lib/http/api-client";
import type {
  CreateWorkspaceCreative,
  CreativeComment,
  CreativeSection,
  WorkspaceCreative,
  WorkspaceCreativePage,
} from "@telegram-system/shared";

const path = (workspaceId: string, id?: string) =>
  `/workspace-creatives/${encodeURIComponent(workspaceId)}${id ? `/${encodeURIComponent(id)}` : ""}`;

export const workspaceCreativesApi = {
  async list(
    workspaceId: string,
    section: CreativeSection,
    cursor?: string | null,
    signal?: AbortSignal,
  ) {
    return (
      await api.get<WorkspaceCreativePage>(path(workspaceId), {
        params: { section, cursor },
        signal,
      })
    ).data;
  },
  async get(workspaceId: string, id: string, signal: AbortSignal) {
    return (await api.get<WorkspaceCreative>(path(workspaceId, id), { signal }))
      .data;
  },
  async create(
    workspaceId: string,
    input: CreateWorkspaceCreative,
    file: File | null,
  ) {
    if (!file) {
      return (
        await api.post<WorkspaceCreative>(
          path(workspaceId),
          input,
          silentFeedbackConfig,
        )
      ).data;
    }
    const body = new FormData();
    for (const [name, value] of Object.entries(input)) {
      if (typeof value === "string" && value) body.set(name, value);
    }
    if (file) body.set("file", file);
    return (
      await api.post<WorkspaceCreative>(
        path(workspaceId),
        body,
        silentFeedbackConfig,
      )
    ).data;
  },
  async comment(workspaceId: string, id: string, text: string) {
    return (
      await api.post<CreativeComment>(
        `${path(workspaceId, id)}/comments`,
        {
          text,
        },
        silentFeedbackConfig,
      )
    ).data;
  },
  async attachment(workspaceId: string, id: string, signal: AbortSignal) {
    return (
      await api.get<Blob>(`${path(workspaceId, id)}/attachment`, {
        responseType: "blob",
        signal,
      })
    ).data;
  },
  async remove(workspaceId: string, id: string) {
    await api.delete(path(workspaceId, id), silentFeedbackConfig);
  },
};
