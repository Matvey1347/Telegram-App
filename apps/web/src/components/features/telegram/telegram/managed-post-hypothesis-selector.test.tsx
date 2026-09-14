import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { TestI18nProvider } from "@/test/render-with-i18n";
import { ManagedPostHypothesisSelector } from "./managed-post-hypothesis-selector";

const { list, assignToPost } = vi.hoisted(() => ({ list: vi.fn(), assignToPost: vi.fn() }));
vi.mock("@/lib/api", () => ({ telegramContentHypothesesApi: { list, assignToPost } }));
vi.mock("@/providers/toast-provider", () => ({ useAppToast: () => ({ pushToast: vi.fn() }) }));

describe("ManagedPostHypothesisSelector", () => {
  it("shows the empty state", async () => {
    list.mockResolvedValueOnce([]);
    render(<QueryClientProvider client={new QueryClient()}><TestI18nProvider><ManagedPostHypothesisSelector channelId="c1" postId="p1" value={[]} /></TestI18nProvider></QueryClientProvider>);
    expect(await screen.findByText("No content hypotheses yet.")).toBeVisible();
  });

  it("saves multiple selected hypotheses", async () => {
    list.mockResolvedValueOnce([
      { id: "h1", name: "Hook", iconPresentation: null },
      { id: "h2", name: "Format", iconPresentation: null },
    ]);
    assignToPost.mockResolvedValueOnce([]);
    render(<QueryClientProvider client={new QueryClient()}><TestI18nProvider><ManagedPostHypothesisSelector channelId="c1" postId="p1" value={["h1", "h2"]} /></TestI18nProvider></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Save hypotheses" }));
    await waitFor(() => expect(assignToPost).toHaveBeenCalledWith("c1", "p1", { hypothesisIds: ["h1", "h2"] }));
  });
});
