import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { renderWithProviders } from "@/test/render-with-providers";
import { AiPostingSourcesSection } from "./ai-posting-sources-section";

vi.mock("@/lib/api", () => ({
  API_MUTATION_EVENT: "test:api-mutation",
  api: { get: vi.fn(), post: vi.fn() },
}));

describe("AiPostingSourcesSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not add a source when the availability check fails", async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { ok: false, available: false, message: "RSS-сервер недоступен." },
    });
    const patch = vi.fn();
    renderWithProviders(
      <AiPostingSourcesSection
        channelId="channel-1"
        config={{ sources: [] }}
        patch={patch}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("URL источника"), {
      target: { value: "https://feeds.example.org/feed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Источник не добавлен: RSS-сервер недоступен.",
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it("removes a previously saved source when it becomes unreachable", async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { ok: false, available: false, message: "Источник недоступен." },
    });
    const patch = vi.fn();
    const source = {
      id: "rss-1",
      type: "rss" as const,
      value: "https://feeds.example.org/feed",
      enabled: true,
    };
    renderWithProviders(
      <AiPostingSourcesSection
        channelId="channel-1"
        config={{ sources: [source] }}
        patch={patch}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Проверить" }));

    await waitFor(() => expect(patch).toHaveBeenCalledWith({ sources: [] }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Недоступный источник удалён",
    );
  });

  it("changes image use for every configured source from the bulk control", async () => {
    const patch = vi.fn();
    renderWithProviders(
      <AiPostingSourcesSection
        channelId="channel-1"
        config={{
          sources: [
            {
              id: "rss-1",
              type: "rss",
              value: "https://one.example/feed",
              enabled: true,
              useImages: true,
            },
            {
              id: "rss-2",
              type: "rss",
              value: "https://two.example/feed",
              enabled: true,
              useImages: true,
            },
          ],
        }}
        patch={patch}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Использовать изображения из всех источников",
      }),
    );

    expect(patch).toHaveBeenCalledWith({
      sources: expect.arrayContaining([
        expect.objectContaining({ id: "rss-1", useImages: false }),
        expect.objectContaining({ id: "rss-2", useImages: false }),
      ]),
    });
  });
});
