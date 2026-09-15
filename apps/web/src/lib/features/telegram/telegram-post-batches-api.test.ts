import type { AxiosInstance } from "axios";
import { describe, expect, it, vi } from "vitest";
import { createTelegramPostBatchesApi } from "./telegram-post-batches-api";

function client() {
  return {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  };
}

describe("telegramPostBatchesApi", () => {
  it("creates a manual publication batch", async () => {
    const http = client();
    const api = createTelegramPostBatchesApi(http as unknown as AxiosInstance);

    await api.create({ channelIds: ["channel-1"] });

    expect(http.post).toHaveBeenCalledWith(
      "/telegram-post-batches",
      { channelIds: ["channel-1"] },
      { feedback: { mode: "silent" } },
    );
  });

  it("persists a ready System Bot workflow as a draft batch", async () => {
    const http = client();
    const api = createTelegramPostBatchesApi(http as unknown as AxiosInstance);

    await api.importWorkflow("workflow-1");

    expect(http.post).toHaveBeenCalledWith(
      "/telegram-post-batches/import",
      { workflowId: "workflow-1" },
      { feedback: { mode: "silent" } },
    );
  });

  it("saves before dispatching with explicit optimistic versions", async () => {
    const http = client();
    http.patch.mockResolvedValueOnce({
      data: { id: "batch-1", version: 4 },
    });
    const api = createTelegramPostBatchesApi(http as unknown as AxiosInstance);
    const payload = {
      expectedVersion: 3,
      title: "September launch",
      channelIds: ["channel-1"],
      defaultDeleteAfterHours: 48 as const,
      posts: [],
    };

    const saved = await api.update("batch-1", payload);
    await api.dispatch(saved.id, saved.version);

    expect(http.patch).toHaveBeenCalledWith(
      "/telegram-post-batches/batch-1",
      payload,
    );
    expect(http.post).toHaveBeenCalledWith(
      "/telegram-post-batches/batch-1/dispatch",
      { expectedVersion: 4 },
    );
  });

  it("deletes a saved draft silently", async () => {
    const http = client();
    const api = createTelegramPostBatchesApi(http as unknown as AxiosInstance);

    await api.removeDraft("batch-1");

    expect(http.delete).toHaveBeenCalledWith("/telegram-post-batches/batch-1", {
      feedback: { mode: "silent" },
    });
  });
});
