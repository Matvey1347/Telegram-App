import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mutualPromotionFolderKeys } from "@/lib/query-keys";
import { MutualPromotionFolderModals } from "./mutual-promotion-folder-modals";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn(),
  updateTitle: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/features/growth/mutual-promotion-folders-api", () => ({
  mutualPromotionFoldersApi: {
    get: api.get,
    list: api.list,
    updateTitle: api.updateTitle,
    remove: api.remove,
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
    select: vi.fn().mockResolvedValue([]),
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
  MutualPromotionFolderFormModal: ({ folder }: { folder: { title: string } | null }) =>
    folder ? <div data-testid="folder-form">{folder.title}</div> : null,
}));
vi.mock("./mutual-promotion-invite-links-editor", () => ({
  MutualPromotionInviteLinksEditor: () => null,
}));
vi.mock("./mutual-promotion-folder-detail-modal", () => ({
  MutualPromotionFolderDetailModal: ({
    open,
    folder,
    onClose,
    onEdit,
  }: {
    open: boolean;
    folder: { title: string } | null;
    onClose: () => void;
    onEdit: () => void;
  }) =>
    open && folder ? (
      <div data-testid="folder-detail">
        {folder.title}
        <button type="button" onClick={onClose}>
          Close detail
        </button>
        <button type="button" onClick={onEdit}>
          Edit folder
        </button>
      </div>
    ) : null,
}));
vi.mock("./mutual-promotion-folder-detail-skeleton-modal", () => ({
  MutualPromotionFolderDetailSkeletonModal: ({ open, title }: { open: boolean; title?: string }) =>
    open ? <div data-testid="folder-detail-loading">{title}</div> : null,
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

describe("MutualPromotionFolderModals", () => {
  beforeEach(() => vi.clearAllMocks());

  function openFolder(folderId: string, title: string) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <MutualPromotionFolderModals
          flow={{ kind: "detail", folderId, title }}
          onClose={onClose}
        />
      </QueryClientProvider>,
    );
    return { client, onClose };
  }

  it("loads only the selected folder and closes the overlay", async () => {
    api.get.mockResolvedValue(folder("draft", "Draft folder", "DRAFT"));
    const { onClose } = openFolder("draft", "Draft folder");
    expect(await screen.findByTestId("folder-detail")).toHaveTextContent("Draft folder");
    expect(api.get).toHaveBeenCalledWith("draft");
    expect(api.list).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Close detail" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("edits the selected draft without loading a separate list", async () => {
    api.get.mockResolvedValue(folder("draft", "Draft folder", "DRAFT"));
    openFolder("draft", "Draft folder");
    await userEvent.click(await screen.findByRole("button", { name: "Edit folder" }));
    expect(screen.getByTestId("folder-form")).toHaveTextContent("Draft folder");
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("offers a close action when the folder cannot be loaded", async () => {
    api.get.mockRejectedValue(new Error("Unavailable"));
    const { onClose } = openFolder("unavailable", "Unavailable folder");
    expect(await screen.findByText("Could not load this mutual-promotion folder.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /^Close$/ }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renames a completed folder from the detail without opening the structural form", async () => {
    api.get.mockResolvedValue(folder("completed", "Finished campaign", "COMPLETED"));
    api.updateTitle.mockResolvedValue(folder("completed", "Revised name", "COMPLETED"));
    openFolder("completed", "Finished campaign");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit folder" }));
    expect(screen.getByRole("heading", { name: "Rename folder" })).toBeVisible();
    expect(screen.queryByTestId("folder-form")).not.toBeInTheDocument();
    const input = screen.getByLabelText("Folder title");
    await user.clear(input);
    await user.type(input, "Revised name");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(api.updateTitle).toHaveBeenCalledWith("completed", { title: "Revised name" });
  });
  it("keeps a failed deletion open and refreshes the combined list after a successful retry", async () => {
    api.remove
      .mockRejectedValueOnce(new Error("Could not reach Telegram"))
      .mockResolvedValueOnce({ id: "folder" });
    const client = new QueryClient();
    const listKey = mutualPromotionFolderKeys.list({ status: "ACTIVE" });
    client.setQueryData(listKey, { items: [{ id: "folder" }] });
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <MutualPromotionFolderModals
          flow={{ kind: "delete", folderId: "folder", title: "Campaign" }}
          onClose={onClose}
        />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete folder" }));
    expect(await screen.findByText("Could not delete the folder.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(false);

    await user.click(screen.getByRole("button", { name: "Delete folder" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
  });
});
