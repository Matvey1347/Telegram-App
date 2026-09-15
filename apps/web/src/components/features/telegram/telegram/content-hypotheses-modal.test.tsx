import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TestI18nProvider } from "@/test/render-with-i18n";
import { ContentHypothesesWorkspace } from "./content-hypotheses-modal";

const api = vi.hoisted(() => ({
  list: vi.fn().mockResolvedValue([]),
  postOptions: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  telegramContentHypothesesApi: {
    list: api.list,
    postOptions: api.postOptions,
    create: api.create,
    update: api.update,
    remove: api.remove,
  },
}));

vi.mock("@/components/icons/icon-picker", () => ({
  IconPicker: () => <div>Emoji picker</div>,
}));

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: vi.fn() }),
}));

describe("ContentHypothesesWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockResolvedValue([]);
    api.postOptions.mockResolvedValue([]);
  });

  it("opens hypothesis creation in a separate modal with an emoji picker", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TestI18nProvider>
          <ContentHypothesesWorkspace channelId="channel-1" />
        </TestI18nProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "New hypothesis" }));

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByText("Emoji picker")).toBeVisible();
    const statusSelect = screen.getByRole("button", { name: "Active" });
    expect(statusSelect).toHaveClass("bg-blue-950/60");
    fireEvent.click(statusSelect);
    expect(screen.getByText("Successful")).toHaveClass("text-emerald-200");
    expect(screen.queryByRole("button", { name: "Draft" })).toBeNull();
    expect(screen.getByText("Posts assigned to this hypothesis")).toBeVisible();
  });

  it("loads publication options only after the select is opened", async () => {
    let resolveOptions!: (value: []) => void;
    api.postOptions.mockReturnValueOnce(
      new Promise<[]>((resolve) => {
        resolveOptions = resolve;
      }),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TestI18nProvider>
          <ContentHypothesesWorkspace channelId="channel-1" />
        </TestI18nProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "New hypothesis" }));
    expect(api.postOptions).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Select posts" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Loading posts…",
    );
    expect(api.postOptions).toHaveBeenCalledWith("channel-1");
    resolveOptions([]);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("creates a hypothesis with the selected posts", async () => {
    api.postOptions.mockResolvedValueOnce([
      {
        id: "post-1",
        title: "First publication",
        status: "PUBLISHED",
        groupTitle: "News",
        scheduledAt: null,
        publishedAt: "2026-09-15T08:00:00.000Z",
      },
    ]);
    api.create.mockResolvedValueOnce({ id: "hypothesis-1" });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TestI18nProvider>
          <ContentHypothesesWorkspace channelId="channel-1" />
        </TestI18nProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "New hypothesis" }));
    fireEvent.change(screen.getAllByRole("textbox")[0], {
      target: { value: "Publishing time" },
    });
    fireEvent.click(
      (await screen.findByText("Select posts")).closest("button")!,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /First publication/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save hypothesis" }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        "channel-1",
        expect.objectContaining({
          name: "Publishing time",
          postIds: ["post-1"],
        }),
      ),
    );
  });

  it("shows analytics calculated only for the hypothesis posts", async () => {
    api.list.mockResolvedValueOnce([
      {
        id: "hypothesis-1",
        telegramChannelId: "channel-1",
        name: "Short hooks",
        description: "Compare short openings",
        status: "ACTIVE",
        iconId: null,
        iconPresentation: null,
        startedAt: "2026-09-01T00:00:00.000Z",
        completedAt: null,
        conclusion: null,
        metrics: {
          linkedPosts: 8,
          publishedPosts: 6,
          averageViews: 1250,
          averageReactionRate: 4.25,
          averageCommentRate: 1.5,
          averageForwardRate: 0.75,
          observedSubscriberDelta: 42,
        },
        postIds: ["post-1"],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-15T00:00:00.000Z",
      },
    ]);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <TestI18nProvider>
          <ContentHypothesesWorkspace channelId="channel-1" />
        </TestI18nProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Short hooks")).toBeVisible();
    expect(screen.getByText("Linked posts")).toBeVisible();
    expect(screen.getByText("Published")).toBeVisible();
    expect(screen.getByText("1,250")).toBeVisible();
    expect(screen.getByText("4.25%")).toBeVisible();
    expect(screen.getByText("+42")).toBeVisible();
  });
});
