import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestI18nProvider } from "@/test/render-with-i18n";
import { ManagedPostHypothesisSelector } from "./managed-post-hypothesis-selector";

const { list, assignToPost } = vi.hoisted(() => ({
  list: vi.fn(),
  assignToPost: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  telegramContentHypothesesApi: { list, assignToPost },
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: vi.fn() }),
}));

describe("ManagedPostHypothesisSelector", () => {
  beforeEach(() => {
    list.mockReset();
    assignToPost.mockReset();
  });

  it("shows the empty state", async () => {
    list.mockResolvedValueOnce([]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TestI18nProvider>
          <ManagedPostHypothesisSelector
            channelId="c1"
            postId="p1"
            value={[]}
          />
        </TestI18nProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("No content hypotheses yet.")).toBeVisible();
  });

  it("saves multiple selected hypotheses", async () => {
    list.mockResolvedValue([
      { id: "h1", name: "Hook", status: "ACTIVE", iconPresentation: null },
      {
        id: "h2",
        name: "Format",
        status: "SUCCESSFUL",
        iconPresentation: null,
      },
    ]);
    assignToPost.mockResolvedValueOnce([]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TestI18nProvider>
          <ManagedPostHypothesisSelector
            channelId="c1"
            postId="p1"
            value={["h1"]}
          />
        </TestI18nProvider>
      </QueryClientProvider>,
    );
    fireEvent.click((await screen.findByText("Hook")).closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: /Format/ }));
    await waitFor(() =>
      expect(assignToPost).toHaveBeenCalledWith("c1", "p1", {
        hypothesisIds: ["h1", "h2"],
      }),
    );
  });

  it("keeps a new post selection controlled until the post is created", async () => {
    list.mockResolvedValue([
      { id: "h1", name: "Hook", status: "ACTIVE", iconPresentation: null },
    ]);
    const onChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TestI18nProvider>
          <ManagedPostHypothesisSelector
            channelId="c1"
            value={[]}
            onChange={onChange}
          />
        </TestI18nProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(
      (await screen.findByText("Select hypotheses")).closest("button")!,
    );
    fireEvent.click(screen.getByRole("button", { name: /Hook/ }));

    expect(onChange).toHaveBeenCalledWith(["h1"]);
    expect(assignToPost).not.toHaveBeenCalled();
  });
});
