import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { AiPostingPerformanceSection } from "./ai-posting-performance-section";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));

describe("AiPostingPerformanceSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads a bounded performance summary only while the tab is active", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        summary: {
          currentNorm24h: 1000,
          normSampleSize: 12,
          normReason: null,
          scoreablePosts: 1,
          origin: [
            { origin: "AI", medianScore: 1.3, postCount: 6, lowSample: false },
            {
              origin: "SYSTEM_MANUAL",
              medianScore: null,
              postCount: 0,
              lowSample: true,
            },
            {
              origin: "EXTERNAL",
              medianScore: null,
              postCount: 0,
              lowSample: true,
            },
          ],
        },
        breakdowns: {
          lengthBand: [
            { value: "short", medianScore: 0.9, postCount: 4, lowSample: true },
          ],
          media: [],
          endsWithQuestion: [],
          hourBlocks: [],
          weekday: [],
        },
        posts: [],
      },
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <AiPostingPerformanceSection channelId="channel-1" active={false} />
      </QueryClientProvider>,
    );
    expect(api.get).not.toHaveBeenCalled();
    rerender(
      <QueryClientProvider client={client}>
        <AiPostingPerformanceSection channelId="channel-1" active />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByText("×1.30 — на 30% выше обычного для канала"),
    ).toBeVisible();
    expect(screen.getByText("Длина текста")).toBeVisible();
    expect(screen.getByText("Короткие")).toBeVisible();
    expect(screen.getAllByText("мало данных").length).toBeGreaterThan(0);
    expect(api.get).toHaveBeenCalledWith(
      "/telegram-channels/channel-1/ai-posting/performance",
      { params: { days: 28 } },
    );
    client.clear();
  });
});
