import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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

  it("explains why Import is disabled when preview validation fails", async () => {
    vi.mocked(telegramChannelsApi.previewUnifiedImport).mockResolvedValue({
      version: 1,
      valid: false,
      manifestHash: "invalid-manifest",
      sections: [
        { key: "groups", validCount: 0, invalidCount: 0, items: [] },
        { key: "hypotheses", validCount: 0, invalidCount: 0, items: [] },
        { key: "posts", validCount: 0, invalidCount: 0, items: [] },
        {
          key: "schedule",
          validCount: 0,
          invalidCount: 1,
          items: [
            {
              ref: "post-scheduled",
              action: "UNSCHEDULE",
              label: "Scheduled publication",
              valid: false,
              warnings: [],
              errors: ["Only a scheduled post can be unscheduled"],
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
    fireEvent.click(screen.getByRole("button", { name: "Paste valid JSON" }));

    expect(await screen.findByText("Valid: 0 · Errors: 1")).toBeVisible();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
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
              changes: [
                {
                  field: "title",
                  before: "Original publication",
                  after: "Updated publication",
                },
              ],
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
              icon: "cmtechnicaliconid",
              iconPresentation: { type: "unicode", value: "📆" },
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
              slotId: "slot-old",
              slotKind: "CONTENT",
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
    const postChanges = document.querySelector<HTMLElement>(
      '[data-import-item-ref="post-update"]',
    );
    expect(postChanges).not.toBeNull();
    expect(
      within(postChanges!).getByText("Original publication"),
    ).toBeVisible();
    expect(within(postChanges!).getByText("Updated publication")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Create (2)" }));
    expect(
      screen.getByRole("button", { name: "Not imported (1)" }),
    ).toBeVisible();
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

    fireEvent.click(screen.getByRole("tab", { name: "Content hypotheses 1" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove this operation from import",
      }),
    );
    await waitFor(() =>
      expect(telegramChannelsApi.previewUnifiedImport).toHaveBeenLastCalledWith(
        "channel-1",
        expect.objectContaining({
          hypotheses: [],
          posts: expect.arrayContaining([
            expect.objectContaining({ ref: "post-new", hypothesisRefs: [] }),
          ]),
        }),
      ),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Posts 4" }));

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
    const importedCalendarTab = screen.getByRole("button", {
      name: "Imported (0)",
    });
    fireEvent.click(importedCalendarTab);
    expect(importedCalendarTab.className).toContain("bg-blue-600");
    expect(
      screen.getByText("There are no calendar operations in this tab."),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Not imported (2)" }));
    expect(screen.getByRole("tab", { name: "Schedule (2)" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Unschedule (1)" })).toBeVisible();
    expect(screen.queryByText("cmtechnicaliconid")).not.toBeInTheDocument();
    expect(screen.getByText("📆")).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: "Open Moved publication in a new tab",
      }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("postId=post-rescheduled"),
    );
    expect(screen.queryByText("Scheduled body")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open New publication in a new tab" }),
    );
    expect(screen.getByRole("tab", { name: "Posts 4" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getAllByText("New publication").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "Calendar 3" }));
    expect(screen.queryByText("Select publication")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add slot" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Unschedule (1)" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Preview Scheduled publication" }),
    );
    expect(screen.getByText("Scheduled body")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit publication date and time for Scheduled publication",
      }),
    );
    expect(screen.getByDisplayValue("2026-09-17")).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("08:10"), {
      target: { value: "09:25" },
    });
    await waitFor(() => {
      const latestManifest = vi
        .mocked(telegramChannelsApi.previewUnifiedImport)
        .mock.calls.at(-1)?.[1];
      const editedSchedule = latestManifest?.schedule?.find(
        (row) => row.postId === "post-scheduled",
      );
      expect(editedSchedule).toEqual(
        expect.objectContaining({ action: "SCHEDULE" }),
      );
      const editedDate = new Date(editedSchedule!.scheduledAt!);
      expect(editedDate.getHours()).toBe(9);
      expect(editedDate.getMinutes()).toBe(25);
    });

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
        manifest: {
          ..._manifest,
          posts: (_manifest.posts ?? []).map((post) => ({
            ...post,
            imported: post.ref === "post-new" ? true : post.imported,
          })),
        },
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
          {
            key: "schedule",
            created: 0,
            updated: 0,
            deleted: 0,
            scheduled: 0,
            unscheduled: 0,
            failed: [{ ref: "post-new", error: "Slot became occupied" }],
          },
        ],
      };
    });
    const importButton = screen.getByRole("button", { name: "Import" });
    await waitFor(() => expect(importButton).toBeEnabled());
    fireEvent.click(importButton);
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
    await waitFor(() =>
      expect(telegramChannelsApi.previewUnifiedImport).toHaveBeenLastCalledWith(
        "channel-1",
        expect.objectContaining({
          posts: expect.arrayContaining([
            expect.objectContaining({ ref: "post-new", imported: true }),
          ]),
        }),
      ),
    );
    expect(screen.getByText("Completed with errors")).toBeVisible();
    expect(screen.getByText("CREATE New group")).toBeVisible();
    expect(screen.getByText("post-new: Slot became occupied")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Calendar 3" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText(/Slot became occupied/)).toBeVisible();
  });

  it("keeps the edited publication selected after preview refresh", async () => {
    let previewRevision = 0;
    vi.mocked(telegramChannelsApi.previewUnifiedImport).mockImplementation(
      async (_channelId, manifest) => ({
        version: 1,
        valid: true,
        manifestHash: `selection-${++previewRevision}`,
        sections: [
          { key: "groups", validCount: 0, invalidCount: 0, items: [] },
          { key: "hypotheses", validCount: 0, invalidCount: 0, items: [] },
          {
            key: "posts",
            validCount: manifest.posts?.length ?? 0,
            invalidCount: 0,
            items: (manifest.posts ?? []).map((post) => ({
              ref: post.ref,
              action: post.action,
              label: post.title ?? post.ref,
              imported: post.imported,
              valid: true,
              warnings: [],
              errors: [],
            })),
          },
          { key: "schedule", validCount: 0, invalidCount: 0, items: [] },
        ],
      }),
    );

    render(
      <UnifiedImportModal
        open
        channelId="channel-1"
        channelTitle="Business"
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Paste valid JSON" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Imported (1)" }),
    );

    fireEvent.change(screen.getByDisplayValue("Imported publication"), {
      target: { value: "Imported publication edited" },
    });

    await waitFor(() =>
      expect(telegramChannelsApi.previewUnifiedImport).toHaveBeenCalledTimes(2),
    );
    expect(
      screen.getByDisplayValue("Imported publication edited"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Imported (1)" })).toHaveClass(
      "bg-blue-600",
    );
  });

  it("moves each successful calendar operation to Imported while the stream is still running", async () => {
    vi.mocked(telegramChannelsApi.previewUnifiedImport).mockResolvedValue({
      version: 1,
      valid: true,
      manifestHash: "live-progress-hash",
      sections: [
        { key: "groups", validCount: 0, invalidCount: 0, items: [] },
        { key: "hypotheses", validCount: 0, invalidCount: 0, items: [] },
        { key: "posts", validCount: 0, invalidCount: 0, items: [] },
        {
          key: "schedule",
          validCount: 3,
          invalidCount: 0,
          items: [
            {
              ref: "post-new",
              action: "SCHEDULE",
              label: "New publication",
              scheduledAt: "2026-09-16T08:10:00+02:00",
              valid: true,
              warnings: [],
              errors: [],
            },
            {
              ref: "post-rescheduled",
              action: "SCHEDULE",
              label: "Moved publication",
              scheduledAt: "2026-09-18T08:10:00+02:00",
              valid: true,
              warnings: [],
              errors: [],
            },
            {
              ref: "post-scheduled",
              action: "UNSCHEDULE",
              label: "Scheduled publication",
              scheduledAt: "2026-09-17T08:10:00+02:00",
              valid: true,
              warnings: [],
              errors: [],
            },
          ],
        },
      ],
    });
    let finishStream!: () => void;
    const streamGate = new Promise<void>((resolve) => {
      finishStream = resolve;
    });
    vi.mocked(
      telegramChannelsApi.applyUnifiedImportWithProgress,
    ).mockImplementation(async (_channelId, input, _hash, onProgress) => {
      onProgress(
        {
          kind: "operation",
          section: "schedule",
          status: "success",
          action: "SCHEDULE",
          ref: "post-new",
          label: "New publication",
          message: "SCHEDULE New publication",
        },
        1,
        3,
      );
      await streamGate;
      return {
        manifestHash: "live-progress-result",
        manifest: {
          ...input,
          schedule: (input.schedule ?? []).map((row) =>
            row.postRef === "post-new" ? { ...row, imported: true } : row,
          ),
        },
        sections: [],
      };
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
    fireEvent.click(screen.getByRole("button", { name: "Paste valid JSON" }));
    fireEvent.click(await screen.findByRole("tab", { name: "Calendar 3" }));
    const importButton = screen.getByRole("button", { name: "Import" });
    await waitFor(() => expect(importButton).toBeEnabled());
    fireEvent.click(importButton);

    expect(
      await screen.findByRole("button", { name: "Not imported (1)" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Imported (1)" })).toBeVisible();

    finishStream();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Import" })).toBeEnabled(),
    );
    expect(screen.getByText("Completed")).toBeVisible();
    expect(screen.getByText("SCHEDULE New publication")).toBeVisible();
  });

  it("keeps a request error in the progress panel", async () => {
    vi.mocked(telegramChannelsApi.previewUnifiedImport).mockResolvedValue({
      version: 1,
      valid: true,
      manifestHash: "request-error-hash",
      sections: [
        { key: "groups", validCount: 0, invalidCount: 0, items: [] },
        { key: "hypotheses", validCount: 0, invalidCount: 0, items: [] },
        { key: "posts", validCount: 1, invalidCount: 0, items: [] },
        { key: "schedule", validCount: 0, invalidCount: 0, items: [] },
      ],
    });
    vi.mocked(
      telegramChannelsApi.applyUnifiedImportWithProgress,
    ).mockRejectedValue(new Error("Request failed with status code 400"));

    render(
      <UnifiedImportModal
        open
        channelId="channel-1"
        channelTitle="Business"
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Paste valid JSON" }));
    const importButton = screen.getByRole("button", { name: "Import" });
    await waitFor(() => expect(importButton).toBeEnabled());
    fireEvent.click(importButton);

    expect(await screen.findByText("Failed")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Request failed with status code 400",
    );
    expect(importButton).toBeEnabled();
  });
});
