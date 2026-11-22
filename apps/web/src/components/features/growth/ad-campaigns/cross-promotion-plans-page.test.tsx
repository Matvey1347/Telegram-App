import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramChannelNetworksApi, telegramChannelsApi } from "@/lib/api";
import { crossPromotionPlansApi } from "@/lib/features/growth/cross-promotion-plans-api";
import { mutualPromotionFoldersApi } from "@/lib/features/growth/mutual-promotion-folders-api";
import { CrossPromotionPlansPage } from "./cross-promotion-plans-page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ startOperation: vi.fn() }),
}));
vi.mock("./cross-promotion-plan-modal", () => ({
  CrossPromotionPlanModal: ({
    open,
    kind,
    initialDraftId,
    onBack,
  }: {
    open: boolean;
    kind: string;
    initialDraftId?: string | null;
    onBack?: () => void;
  }) => (
    <div data-testid="plan-modal" data-open={open} data-kind={kind} data-draft-id={initialDraftId ?? ""}>
      {open && onBack ? <button onClick={onBack}>Back to promotion types</button> : null}
    </div>
  ),
}));
vi.mock("./mutual-promotion/mutual-promotion-folder-modals", () => ({
  MutualPromotionFolderModals: ({
    flow,
    onBack,
    onClose,
  }: {
    flow: { kind: string; folderId?: string };
    onBack?: () => void;
    onClose: () => void;
  }) => (
    <div role="dialog">
      {flow.kind === "create" ? "Folder form" : flow.folderId}
      {onBack ? <button onClick={onBack}>Back to promotion types</button> : null}
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));
vi.mock("./promo-form-modal", () => ({
  PromoFormModal: () => null,
}));
vi.mock("./cross-promotion-plan-card", () => ({
  CrossPromotionPlanCard: () => null,
}));

describe("CrossPromotionPlansPage query loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(mutualPromotionFoldersApi, "list").mockResolvedValue({
      items: [],
      statusCounts: { ACTIVE: 0, SCHEDULED: 0, COMPLETED: 0 },
      pagination: {
        page: 1,
        pageSize: 100,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
    vi.spyOn(crossPromotionPlansApi, "listAll").mockResolvedValue([]);
    vi.spyOn(telegramChannelsApi, "select").mockResolvedValue([]);
    vi.spyOn(telegramChannelNetworksApi, "listOptions").mockResolvedValue([]);
  });

  it("waits to fetch channel and network catalogs until a plan editor opens", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <CrossPromotionPlansPage kind="DIRECT_MUTUAL" sectionTabs={null} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(crossPromotionPlansApi.listAll).toHaveBeenCalled());

    expect(telegramChannelsApi.select).not.toHaveBeenCalled();
    expect(telegramChannelNetworksApi.listOptions).not.toHaveBeenCalled();
    expect(screen.getByTestId("plan-modal")).toHaveAttribute("data-open", "false");

    await user.click(screen.getByRole("button", { name: "New placement" }));
    expect(screen.getByRole("dialog", { name: "Promotion type" })).toBeVisible();
    expect(telegramChannelsApi.select).not.toHaveBeenCalled();
    expect(telegramChannelNetworksApi.listOptions).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Mutual promotion" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Create new" }));
    await waitFor(() => {
      expect(telegramChannelsApi.select).toHaveBeenCalledTimes(1);
      expect(telegramChannelNetworksApi.listOptions).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("plan-modal")).toHaveAttribute("data-open", "true");
    queryClient.clear();
  });
  it("opens folders over the combined list and switches creation types in place", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const originalUrl = window.location.href;
    vi.mocked(mutualPromotionFoldersApi.list).mockImplementation(async (params) => ({
      items:
        params?.status === "ACTIVE"
          ? [
              {
                id: "folder-1",
                title: "Fall campaign",
                titleTemplate: null,
                status: "ACTIVE",
                startsAt: "2026-11-21T10:00:00Z",
                endsAt: "2026-11-22T10:00:00Z",
                notes: null,
                participantCount: 0,
                publisherCount: 0,
                paidCount: 0,
                postCount: 0,
                channels: [],
                createdAt: "2026-11-20T10:00:00Z",
                updatedAt: "2026-11-20T10:00:00Z",
              },
            ]
          : [],
      statusCounts: { ACTIVE: 1, SCHEDULED: 2, COMPLETED: 3 },
      pagination: {
        page: 1,
        pageSize: 100,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    }));
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <CrossPromotionPlansPage kind="DIRECT_MUTUAL" sectionTabs={null} />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Open folder Fall campaign" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("folder-1");
    expect(screen.getByRole("heading", { name: "Mutual promotion" })).toBeVisible();
    expect(window.location.href).toBe(originalUrl);
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "New placement" }));
    expect(screen.getByRole("button", { name: "Mutual promotion" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Create new" }));
    expect(screen.getByTestId("plan-modal")).toHaveAttribute("data-kind", "DIRECT_MUTUAL");
    expect(screen.queryByRole("button", { name: "Folder" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to promotion types" }));
    await user.click(screen.getByRole("button", { name: "Folder" }));
    expect(screen.getByRole("button", { name: "Folder" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Create new" }));
    expect(await screen.findByText("Folder form")).toBeVisible();
    expect(screen.queryByRole("button", { name: "My channels" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to promotion types" }));
    await user.click(screen.getByRole("button", { name: "My channels" }));
    await user.click(screen.getByRole("button", { name: "Create new" }));
    expect(screen.queryByRole("dialog", { name: "Promotion type" })).not.toBeInTheDocument();
    expect(screen.getByTestId("plan-modal")).toHaveAttribute("data-kind", "OWN_CHANNELS");
    expect(screen.getByTestId("plan-modal")).toHaveAttribute("data-open", "true");
    expect(window.location.href).toBe(originalUrl);
    await user.click(screen.getByRole("tab", { name: "Scheduled 2" }));
    await waitFor(() =>
      expect(mutualPromotionFoldersApi.list).toHaveBeenCalledWith({ page: 1, pageSize: 100, status: "SCHEDULED" }),
    );
  });
  it("shows draft inboxes before opening a form and resumes the selected draft by ID", async () => {
    const publishedAt = "2026-11-01T09:00:00.000Z";
    for (const [key, title] of [
      ["ads:cross-promotion:DIRECT_MUTUAL:draft:default", "Exchange draft"],
      ["ads:cross-promotion:OWN_CHANNELS:draft:default", "Own channels draft"],
      ["mutual-promotion-folder:draft:default", "Folder draft"],
    ]) {
      localStorage.setItem(key, JSON.stringify({ version: 3, drafts: [{
        id: title,
        schemaVersion: 1,
        createdAt: publishedAt,
        updatedAt: publishedAt,
        form: { title, publisherIds: [], participants: [], post: { text: "", imageUrls: [] } },
      }] }));
    }
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}>
      <CrossPromotionPlansPage kind="DIRECT_MUTUAL" sectionTabs={null} />
    </QueryClientProvider>);
    await user.click(screen.getByRole("button", { name: "New placement" }));
    expect(screen.getByText("Exchange draft")).toBeVisible();
    expect(screen.queryByText("Own channels draft")).not.toBeInTheDocument();
    expect(screen.getByTestId("plan-modal")).toHaveAttribute("data-open", "false");

    await user.click(screen.getByRole("button", { name: "Folder" }));
    expect(screen.getByText("Folder draft")).toBeVisible();
    expect(screen.queryByText("Exchange draft")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "My channels" }));
    await user.click(screen.getByRole("button", { name: "Continue draft Own channels draft" }));
    expect(screen.getByTestId("plan-modal")).toHaveAttribute("data-draft-id", "Own channels draft");

    await user.click(screen.getByRole("button", { name: "Back to promotion types" }));
    expect(screen.getByText("Own channels draft")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete draft Own channels draft" }));
    expect(screen.queryByText("Saved drafts")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create new" })).toBeVisible();
  });

});
