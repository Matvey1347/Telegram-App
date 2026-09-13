import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MutualPromotionFoldersPage } from "./mutual-promotion-folders-page";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn(),
}));

vi.mock("@/lib/features/growth/mutual-promotion-folders-api", () => ({
  mutualPromotionFoldersApi: {
    get: api.get,
    list: api.list,
  },
}));

vi.mock("@/lib/api", () => ({
  accountsApi: { list: vi.fn().mockResolvedValue([]) },
  authApi: {
    me: vi.fn().mockResolvedValue({
      workspace: { timezone: "Europe/Warsaw" },
    }),
  },
  telegramChannelsApi: {
    listWithCounts: vi.fn().mockResolvedValue({ items: [] }),
  },
  telegramSystemBotApi: {
    connection: vi.fn().mockResolvedValue({
      connected: false,
      botUsername: null,
    }),
  },
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/layout/page-tab-head", () => ({
  PageTabHead: () => null,
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ setProgress: vi.fn() }),
}));
vi.mock("./mutual-promotion-folder-form-modal", () => ({
  MutualPromotionFolderFormModal: () => null,
}));
vi.mock("./mutual-promotion-invite-links-editor", () => ({
  MutualPromotionInviteLinksEditor: () => null,
}));
vi.mock("./mutual-promotion-folder-detail-modal", () => ({
  MutualPromotionFolderDetailModal: ({
    open,
    folder,
    onClose,
  }: {
    open: boolean;
    folder: { title: string } | null;
    onClose: () => void;
  }) =>
    open && folder ? (
      <div data-testid="folder-detail">
        {folder.title}
        <button type="button" onClick={onClose}>
          Close detail
        </button>
      </div>
    ) : null,
}));
vi.mock("./mutual-promotion-folder-detail-skeleton-modal", () => ({
  MutualPromotionFolderDetailSkeletonModal: ({
    open,
    title,
  }: {
    open: boolean;
    title?: string;
  }) => (open ? <div data-testid="folder-detail-loading">{title}</div> : null),
}));

function folder(id: string, title: string, status: "DRAFT" | "COMPLETED") {
  return {
    id,
    title,
    titleTemplate: null,
    status,
    startsAt: "2026-09-08T08:00:00.000Z",
    endsAt: "2026-09-10T08:00:00.000Z",
    notes: null,
    assignedMemberId: null,
    participantCount: 0,
    publisherCount: 0,
    paidCount: 0,
    postCount: 0,
    channels: [],
    participants: [],
    posts: [],
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
  };
}

describe("MutualPromotionFoldersPage", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.list.mockReset();
  });

  it("never shows the previously selected folder while a draft loads", async () => {
    const user = userEvent.setup();
    const completed = folder("completed", "Completed folder", "COMPLETED");
    const draft = folder("draft", "Draft folder", "DRAFT");
    api.list.mockResolvedValue({
      items: [draft, completed],
      pagination: {
        page: 1,
        pageSize: 100,
        totalItems: 2,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
    api.get.mockImplementation((id: string) =>
      id === completed.id ? Promise.resolve(completed) : new Promise(() => {}),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MutualPromotionFoldersPage />
      </QueryClientProvider>,
    );

    await user.click(
      await screen.findByRole("button", {
        name: "Open folder Completed folder",
      }),
    );
    expect(await screen.findByTestId("folder-detail")).toHaveTextContent(
      "Completed folder",
    );
    await user.click(screen.getByRole("button", { name: "Close detail" }));
    await user.click(
      screen.getByRole("button", { name: "Open folder Draft folder" }),
    );

    expect(screen.queryByTestId("folder-detail")).not.toBeInTheDocument();
    expect(screen.getByTestId("folder-detail-loading")).toHaveTextContent(
      "Draft folder",
    );
    expect(api.get).toHaveBeenLastCalledWith("draft");
  });
});
