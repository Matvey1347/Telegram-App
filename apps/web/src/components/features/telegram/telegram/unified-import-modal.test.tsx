import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TELEGRAM_UNIFIED_IMPORT_INSTRUCTION } from "@telegram-system/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { telegramChannelsApi } from "@/lib/api";
import { renderWithI18n } from "@/test/render-with-i18n";
import { UnifiedImportModal } from "./unified-import-modal";

const pushToast = vi.fn();
const operation = {
  update: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
  dismiss: vi.fn(),
};
const startOperation = vi.fn(() => operation);

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    telegramChannelsApi: {
      unifiedImportContext: vi.fn(),
      previewUnifiedImport: vi.fn(),
      applyUnifiedImportWithProgress: vi.fn(),
      postGroupSummaries: vi.fn().mockResolvedValue([]),
      lookupManagedPosts: vi
        .fn()
        .mockResolvedValue({ items: [], missingIds: [] }),
    },
  };
});
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast, startOperation }),
}));
vi.mock("./managed-posts-import-source", () => ({
  ManagedPostsImportSource: ({
    onContent,
  }: {
    onContent: (content: string) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onContent(
          JSON.stringify({
            version: 1,
            groups: [],
            hypotheses: [
              {
                ref: "hyp-new",
                action: "CREATE",
                icon: "🧠",
                value: { name: "Growth hypothesis", status: "ACTIVE" },
              },
            ],
            posts: [
              {
                ref: "post-new",
                action: "CREATE",
                title: "New publication",
                text: "Text",
                imported: false,
              },
              {
                ref: "post-imported",
                action: "CREATE",
                title: "Imported publication",
                text: "Text",
                imported: true,
              },
              {
                ref: "post-update",
                action: "UPDATE",
                id: "post-update",
                title: "Updated publication",
                text: "Updated text",
                imported: false,
              },
            ],
            schedule: [
              {
                action: "SCHEDULE",
                postRef: "post-new",
                slotId: "slot-1",
                scheduledAt: "2026-09-16T08:10:00+02:00",
              },
              {
                action: "SCHEDULE",
                postId: "post-rescheduled",
                slotId: "slot-2",
                scheduledAt: "2026-09-18T08:10:00+02:00",
              },
              { action: "UNSCHEDULE", postId: "post-scheduled" },
            ],
            delete: {
              groups: [],
              hypotheses: [],
              posts: [{ id: "post-existing" }],
            },
          }),
        )
      }
    >
      Paste valid JSON
    </button>
  ),
}));

function render(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderWithI18n(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("UnifiedImportModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides the inline instruction and copies the canonical instruction while downloading context", async () => {
    vi.mocked(telegramChannelsApi.unifiedImportContext).mockResolvedValue(
      new Blob(["full context"]),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:context"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(
      <UnifiedImportModal
        open
        channelId="channel-1"
        channelTitle="Business"
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />,
    );

    expect(
      screen.queryByText("How to prepare a complete import"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Full manifest rules and examples"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Copy instruction + download full context",
      }),
    );

    await waitFor(() => {
      expect(telegramChannelsApi.unifiedImportContext).toHaveBeenCalledWith(
        "channel-1",
      );
      expect(writeText).toHaveBeenCalledWith(
        TELEGRAM_UNIFIED_IMPORT_INSTRUCTION,
      );
    });
  });

  it("automatically builds preview after JSON is pasted", async () => {
    vi.mocked(telegramChannelsApi.previewUnifiedImport).mockResolvedValue({
      version: 1,
      valid: true,
      manifestHash: "manifest-hash",
      sections: [
        {
          key: "groups",
          validCount: 0,
          invalidCount: 0,
          items: [],
        },
        {
          key: "hypotheses",
          validCount: 4,
          invalidCount: 0,
          items: [
            {
              ref: "hyp-new",
              action: "CREATE",
              label: "Growth hypothesis",
              icon: "🧠",
              status: "ACTIVE",
              valid: true,
              warnings: [],
              errors: [],
            },
          ],
        },
        {
          key: "posts",
          validCount: 3,
          invalidCount: 0,
          items: [
            {
              ref: "post-new",
              action: "CREATE",
              label: "New publication",
              valid: true,
              warnings: [],
              errors: [],
              imported: false,
            },
            {
              ref: "post-imported",
              action: "CREATE",
              label: "Imported publication",
              valid: true,
              warnings: [],
              errors: [],
              imported: true,
            },
            {
              ref: "post-update",
              entityId: "post-update",
              action: "UPDATE",
              label: "Updated publication",
              valid: true,
              warnings: [],
              errors: [],
              imported: false,
            },
            {
              ref: "delete:post:post-existing",
              entityId: "post-existing",
              action: "DELETE",
              label: "Existing publication",
              icon: "📝",
              text: "Existing Telegram body",
              imageUrls: [],
              valid: true,
              warnings: [],
              errors: [],
            },
          ],
        },
        {
          key: "schedule",
          validCount: 2,
          invalidCount: 0,
          items: [
            {
              ref: "post-new",
              action: "SCHEDULE",
              label: "2026-09-16T08:10:00+02:00",
              valid: true,
              warnings: [],
              errors: [],
            },
            {
              ref: "post-rescheduled",
              entityId: "post-rescheduled",
              action: "SCHEDULE",
              label: "Moved publication",
              icon: "📆",
              text: "Moved body",
              imageUrls: [],
              scheduledAt: "2026-09-18T08:10:00+02:00",
              valid: true,
              warnings: [],
              errors: [],
            },
            {
              ref: "post-scheduled",
              entityId: "post-scheduled",
              action: "UNSCHEDULE",
              label: "Scheduled publication",
              icon: "🗓️",
              text: "Scheduled body",
              imageUrls: [],
              scheduledAt: "2026-09-17T08:10:00+02:00",
              valid: true,
              warnings: [],
              errors: [],
            },
          ],
        },
      ],
    });

    render(
      <UnifiedImportModal
        open
        channelId="channel-1"
        channelTitle="Business"
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Import" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Preview" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Paste valid JSON" }));

    await waitFor(() =>
      expect(telegramChannelsApi.previewUnifiedImport).toHaveBeenCalledOnce(),
    );
    expect(telegramChannelsApi.previewUnifiedImport).toHaveBeenCalledWith(
      "channel-1",
      expect.objectContaining({ version: 1 }),
    );
    expect(await screen.findByRole("tab", { name: "Posts 4" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Calendar 3" })).toBeVisible();
    expect(
      screen.queryByRole("tab", { name: /Groups/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Content hypotheses 1" }),
    ).toBeVisible();
    const createTab = screen.getByRole("tab", { name: "Create (2)" });
    expect(createTab).toBeVisible();
    expect(createTab.className).not.toContain("shadow-");
    expect(screen.getByRole("tab", { name: "Update (1)" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Delete (1)" })).toBeVisible();
    expect(screen.queryByText("Updated publication")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Update (1)" }));
    expect(screen.getAllByText("Updated publication").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("UPDATE")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Create (2)" }));
    expect(screen.getByRole("button", { name: "New (1)" })).toBeVisible();
    expect(screen.getAllByText("New publication").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText("One search query per line"), {
      target: { value: "quiet lake\nmountain view" },
    });
    await waitFor(() =>
      expect(telegramChannelsApi.previewUnifiedImport).toHaveBeenCalledTimes(2),
    );
    expect(telegramChannelsApi.previewUnifiedImport).toHaveBeenLastCalledWith(
      "channel-1",
      expect.objectContaining({
        posts: expect.arrayContaining([
          expect.objectContaining({
            ref: "post-new",
            imageSearch: ["quiet lake", "mountain view"],
          }),
          expect.objectContaining({
            ref: "post-update",
            action: "UPDATE",
          }),
        ]),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Select hypotheses" }));
    fireEvent.click(screen.getByRole("button", { name: /Growth hypothesis/ }));
    await waitFor(() =>
      expect(telegramChannelsApi.previewUnifiedImport).toHaveBeenCalledTimes(3),
    );
    expect(telegramChannelsApi.previewUnifiedImport).toHaveBeenLastCalledWith(
      "channel-1",
      expect.objectContaining({
        posts: expect.arrayContaining([
          expect.objectContaining({
            ref: "post-new",
            hypothesisRefs: ["hyp-new"],
          }),
        ]),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Imported (1)" }));
    expect(screen.getAllByText("Imported publication").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Delete (1)" }));
    expect(screen.getByText("Existing Telegram body")).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: "Open Existing publication in a new tab",
      }),
    ).toHaveAttribute("href", expect.stringContaining("postId=post-existing"));

    fireEvent.click(screen.getByRole("tab", { name: "Calendar 3" }));
    expect(screen.getByRole("tab", { name: "Schedule (2)" })).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: "Open Moved publication in a new tab",
      }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("postId=post-rescheduled"),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Unschedule (1)" }));
    expect(screen.getByText("Scheduled body")).toBeVisible();

    vi.mocked(
      telegramChannelsApi.applyUnifiedImportWithProgress,
    ).mockImplementation(async (_channelId, _manifest, _hash, onProgress) => {
      onProgress(
        {
          kind: "phase",
          section: "groups",
          status: "started",
          message: "Processing groups",
        },
        0,
        7,
      );
      onProgress(
        {
          kind: "operation",
          section: "groups",
          status: "success",
          action: "CREATE",
          ref: "group-new",
          label: "New group",
          message: "CREATE New group",
        },
        1,
        7,
      );
      return {
        manifestHash: "manifest-hash",
        sections: [
          {
            key: "groups",
            created: 1,
            updated: 0,
            deleted: 0,
            scheduled: 0,
            unscheduled: 0,
            failed: [],
          },
        ],
      };
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() =>
      expect(
        telegramChannelsApi.applyUnifiedImportWithProgress,
      ).toHaveBeenCalledOnce(),
    );
    expect(startOperation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "unified-import:channel-1" }),
    );
    expect(operation.update).toHaveBeenCalledWith(
      expect.objectContaining({ current: 1, total: 7 }),
    );
    expect(await screen.findByText("CREATE New group")).toBeVisible();
  });
});
