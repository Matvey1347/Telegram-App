import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { AiPostingChannelAnalysis } from "./ai-posting-channel-analysis";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { post } }));

describe("AI Posting channel analysis", () => {
  it("previews the proposal and sends it to the settings editor only on request", async () => {
    const client = new QueryClient();
    const onUse = vi.fn();
    const configuration = { style: "Конкретный, спокойный голос" };
    post.mockResolvedValueOnce({ data: {
      schemaVersion: 2, configurationVersion: 12, configuration,
      findings: "Результат анализа",
      performanceExamples: { high: [{ messageId: "741", score24h: 1.27, engagementPer1k24h: 10 }], low: [] },
      coverage: {
        organicPosts: 59, excludedPosts: 4, scoredPosts: 50, sampledPosts: 19,
        visualExamples: 5, classifiedPosts: 14, firstPost: "2026-08-11", lastPost: "2026-09-05",
      },
    } });
    render(<QueryClientProvider client={client}>
      <AiPostingChannelAnalysis channelId="channel" version={12} dirty={false} onUse={onUse} />
    </QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Детальный анализ канала" }));
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Запустить анализ" }));
    expect(await screen.findByText("Результат анализа")).toBeVisible();
    expect(screen.getByText(/#741 · 1.27× нормы/)).toBeInTheDocument();
    expect(onUse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Подставить в настройки" }));
    expect(onUse).toHaveBeenCalledWith(configuration);
  });

  it("requires saving pending edits before requesting paid analysis", () => {
    const client = new QueryClient();
    render(<QueryClientProvider client={client}>
      <AiPostingChannelAnalysis channelId="channel" version={2} dirty onUse={vi.fn()} />
    </QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Детальный анализ канала" }));
    expect(screen.getByRole("button", { name: "Запустить анализ" })).toBeDisabled();
  });
});
