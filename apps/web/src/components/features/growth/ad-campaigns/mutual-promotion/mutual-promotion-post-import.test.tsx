import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { telegramSystemBotApi } from "@/lib/api";
import { MutualPromotionPostImport } from "./mutual-promotion-post-import";

vi.mock("@/lib/api", () => ({
  telegramSystemBotApi: {
    prepareMutualPromotionPostImport: vi.fn(),
    mutualPromotionPostImportResult: vi.fn(),
    sendMutualPromotionPostPreview: vi.fn(),
  },
}));

vi.mock("./mutual-promotion-post-composer", () => ({
  MutualPromotionPostComposer: ({
    draft,
    onChange,
  }: {
    draft: { title: string; text: string };
    onChange: (draft: {
      title: string;
      text: string;
      imageUrls: string[];
      buttonRows: never[];
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          title: "Edited title",
          text: "**Edited** post",
          imageUrls: ["https://cdn.test/edited.jpg"],
          buttonRows: [],
        })
      }
    >
      Edit imported post: {draft.text}
    </button>
  ),
}));

describe("MutualPromotionPostImport", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it("explains the multi-post forwarding flow", () => {
    render(
      <MutualPromotionPostImport
        folderId="folder-1"
        timezone="Europe/Warsaw"
        startsAt="2026-09-08T17:00:00.000Z"
        endsAt="2026-09-10T20:00:00.000Z"
        botConnected
        botUsername="system_bot"
        previewChannelTitle="Publisher"
        previewChannelPhotoUrl="https://cdn.test/publisher.jpg"
        saving={false}
        onAddPost={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText("Forward and schedule publications")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Forward posts via bot" }),
    ).toBeVisible();
    expect(screen.getByText(/all required posts.*one batch/i)).toBeVisible();
  });

  it("shows animated sending and transient sent states before restoring the action", async () => {
    vi.useFakeTimers();
    vi.mocked(
      telegramSystemBotApi.prepareMutualPromotionPostImport,
    ).mockResolvedValue({ workflowId: "workflow-1" });
    vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <MutualPromotionPostImport
        folderId="folder-1"
        timezone="Europe/Warsaw"
        startsAt="2026-09-08T17:00:00.000Z"
        endsAt="2026-09-10T20:00:00.000Z"
        botConnected
        botUsername="system_bot"
        previewChannelTitle="Publisher"
        previewChannelPhotoUrl="https://cdn.test/publisher.jpg"
        saving={false}
        onAddPost={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Forward posts via bot" }),
    );
    expect(
      screen.getByRole("button", { name: "Sending to bot" }),
    ).toHaveTextContent("Sending.");
    act(() => vi.advanceTimersByTime(350));
    expect(
      screen.getByRole("button", { name: "Sending to bot" }),
    ).toHaveTextContent("Sending..");
    await act(async () => Promise.resolve());
    expect(
      screen.getByRole("button", { name: "Sent to bot" }),
    ).toHaveTextContent("Sent to bot");
    expect(screen.getByText(/Forward several posts in Telegram/)).toBeVisible();

    act(() => vi.advanceTimersByTime(1800));
    expect(
      screen.getByRole("button", { name: "Forward posts via bot" }),
    ).toBeEnabled();
  });

  it("edits and previews imported markup, saves the edited draft, and prepares the next post", async () => {
    vi.mocked(telegramSystemBotApi.prepareMutualPromotionPostImport)
      .mockResolvedValueOnce({ workflowId: "workflow-1" })
      .mockResolvedValueOnce({ workflowId: "workflow-2" });
    vi.mocked(
      telegramSystemBotApi.mutualPromotionPostImportResult,
    ).mockResolvedValue({
      ready: true,
      drafts: [
        {
          title: "Imported title",
          text: "**Imported** [link](https://example.test)",
          imageUrls: [],
          buttonRows: [],
        },
        {
          title: "Second title",
          text: "Second post",
          imageUrls: [],
          buttonRows: [],
        },
      ],
    });
    vi.mocked(
      telegramSystemBotApi.sendMutualPromotionPostPreview,
    ).mockResolvedValue({ status: "SENT" });
    const onAddPost = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <MutualPromotionPostImport
        folderId="folder-1"
        timezone="Europe/Warsaw"
        startsAt="2026-09-08T17:00:00.000Z"
        endsAt="2026-09-10T20:00:00.000Z"
        botConnected
        botUsername="system_bot"
        previewChannelTitle="Publisher"
        saving={false}
        onAddPost={onAddPost}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Forward posts via bot" }),
    );
    await screen.findByText(/Forward several posts in Telegram/);
    fireEvent.focus(window);
    const editors = await screen.findAllByRole("button", {
      name: /Edit imported post:/,
    });
    expect(editors).toHaveLength(2);
    expect(editors[0]).toHaveTextContent(
      "**Imported** [link](https://example.test)",
    );
    expect(screen.getAllByText("Publication date")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /1\. Imported title/ }));
    expect(
      screen.getAllByRole("button", { name: /Edit imported post:/ }),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /1\. Imported title/ }));
    fireEvent.click(
      screen.getAllByRole("button", { name: /Edit imported post:/ })[0],
    );

    fireEvent.click(screen.getByRole("button", { name: "Send post 1 to bot" }));
    await waitFor(() =>
      expect(
        telegramSystemBotApi.sendMutualPromotionPostPreview,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Edited title",
          text: "**Edited** post",
        }),
      ),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add 2 post(s) to folder" }),
    );
    await waitFor(() =>
      expect(onAddPost).toHaveBeenCalledWith(
        expect.objectContaining({
          importWorkflowId: "workflow-1",
          posts: [
            expect.objectContaining({
              title: "Edited title",
              text: "**Edited** post",
            }),
            expect.objectContaining({
              title: "Second title",
              text: "Second post",
            }),
          ],
        }),
      ),
    );
    await waitFor(() =>
      expect(
        telegramSystemBotApi.prepareMutualPromotionPostImport,
      ).toHaveBeenLastCalledWith("folder-1"),
    );
    expect(screen.getByText(/Forward several posts in Telegram/)).toBeVisible();
  });

  it("keeps a deliberately cleared imported batch empty", async () => {
    vi.mocked(
      telegramSystemBotApi.prepareMutualPromotionPostImport,
    ).mockResolvedValue({ workflowId: "workflow-1" });
    vi.mocked(
      telegramSystemBotApi.mutualPromotionPostImportResult,
    ).mockResolvedValue({
      ready: true,
      drafts: [
        {
          title: "First",
          text: "First",
          imageUrls: [],
          buttonRows: [],
        },
        {
          title: "Second",
          text: "Second",
          imageUrls: [],
          buttonRows: [],
        },
      ],
    });
    vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <MutualPromotionPostImport
        folderId="folder-1"
        timezone="Europe/Warsaw"
        startsAt="2026-09-08T17:00:00.000Z"
        endsAt="2026-09-10T20:00:00.000Z"
        botConnected
        botUsername="system_bot"
        previewChannelTitle="Publisher"
        saving={false}
        onAddPost={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Forward posts via bot" }),
    );
    await screen.findByText(/Forward several posts in Telegram/);
    fireEvent.focus(window);
    await screen.findByText("Imported posts: 2");
    fireEvent.click(screen.getByRole("button", { name: "Remove post 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove post 1" }));

    expect(screen.getByText(/No imported posts are selected/)).toBeVisible();
    fireEvent.focus(window);
    expect(
      telegramSystemBotApi.mutualPromotionPostImportResult,
    ).toHaveBeenCalledTimes(1);
  });
});
