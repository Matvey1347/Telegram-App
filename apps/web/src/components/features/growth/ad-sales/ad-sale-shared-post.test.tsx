import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramSystemBotApi } from "@/lib/api";
import { AdSaleSharedPost } from "./ad-sale-shared-post";

vi.mock("@/lib/api", () => ({
  telegramSystemBotApi: {
    startPostImport: vi.fn(),
    readPostImport: vi.fn(),
    cancelPostImport: vi.fn(),
    sendPostPreview: vi.fn(),
  },
}));

describe("AdSaleSharedPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(telegramSystemBotApi.startPostImport).mockResolvedValue({
      workflowId: "workflow-1",
      mode: "single",
    });
    vi.mocked(telegramSystemBotApi.readPostImport).mockResolvedValue({
      ready: false,
      mode: "single",
      status: "ACTIVE",
    });
    vi.mocked(telegramSystemBotApi.sendPostPreview).mockResolvedValue({
      status: "SENT",
    });
  });
  const placements = [
    {
      key: "one",
      channelId: "channel-1",
      date: "2099-01-01",
      timezone: "UTC",
    },
    {
      key: "two",
      channelId: "channel-1",
      date: "2099-01-02",
      timezone: "UTC",
    },
  ] as never;

  it("sends the composed post to the bot and briefly shows confirmation", async () => {
    const draft = {
      title: "Advertising post",
      text: "Please approve this post",
      imageUrls: ["https://cdn.test/post.jpg"],
      buttonRows: [],
    };
    render(
      <AdSaleSharedPost
        placements={
          (placements as unknown as Array<Record<string, unknown>>).map(
            (placement) => ({
              ...placement,
              managedPostDraft: draft,
            }),
          ) as never
        }
        channels={[{ id: "channel-1", title: "Main" }] as never}
        mode="shared"
        systemBotConnected
        systemBotUsername="@system_bot"
        workspaceId="workspace-1"
        onModeChange={vi.fn()}
        setPlacements={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Send current post to bot" }),
    );

    expect(
      screen.getByRole("button", { name: "Sending post to bot" }),
    ).toBeDisabled();
    expect(
      await screen.findByRole("button", { name: "Current post sent to bot" }),
    ).toHaveTextContent("✅ Sent to bot");
    expect(telegramSystemBotApi.sendPostPreview).toHaveBeenCalledWith(draft);
  });

  it("starts the connected bot import without opening Telegram", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    let resolveWorkflow!: (value: {
      workflowId: string;
      mode: "single";
    }) => void;
    vi.mocked(telegramSystemBotApi.startPostImport).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWorkflow = resolve;
        }),
    );
    render(
      <AdSaleSharedPost
        placements={placements}
        channels={[{ id: "channel-1", title: "Main" }] as never}
        mode="shared"
        systemBotConnected
        systemBotUsername="@system_bot"
        workspaceId="workspace-1"
        onModeChange={vi.fn()}
        setPlacements={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add new post from bot" }),
    );
    expect(
      screen.getByRole("button", { name: "Sending to bot" }),
    ).toHaveTextContent("Sending.");
    expect(
      screen.getByRole("button", { name: "Sending to bot" }),
    ).toBeDisabled();
    resolveWorkflow({ workflowId: "workflow-1", mode: "single" });
    await waitFor(() =>
      expect(telegramSystemBotApi.startPostImport).toHaveBeenCalledTimes(1),
    );
    expect(open).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("button", { name: "Sent to bot" }),
    ).toHaveTextContent("Waiting for bot");
  });

  it("keeps bot import and the editor available for one placement without the shared toggle", () => {
    render(
      <AdSaleSharedPost
        placements={[placements[0]]}
        channels={[{ id: "channel-1", title: "Main" }] as never}
        mode="shared"
        systemBotConnected
        systemBotUsername="@system_bot"
        workspaceId="workspace-1"
        onModeChange={vi.fn()}
        setPlacements={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Add new post from bot" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create shared post" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("switch", {
        name: "Use one advertising post for all channels",
      }),
    ).toBeNull();
  });

  it("keeps the user in the modal when the bot workspace cannot be prepared", async () => {
    vi.mocked(telegramSystemBotApi.startPostImport).mockRejectedValue(
      new Error("denied"),
    );
    render(
      <AdSaleSharedPost
        placements={placements}
        channels={[{ id: "channel-1", title: "Main" }] as never}
        mode="shared"
        systemBotConnected
        systemBotUsername="@system_bot"
        workspaceId="workspace-1"
        onModeChange={vi.fn()}
        setPlacements={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add new post from bot" }),
    );
    expect(
      await screen.findByText(
        "Could not prepare the bot workspace. Try again.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Add new post from bot" }),
    ).toBeEnabled();
  });

  it("stores the confirmed Telegram draft when it returns", async () => {
    vi.mocked(telegramSystemBotApi.readPostImport).mockResolvedValue({
      ready: true,
      mode: "single",
      status: "COMPLETED",
      drafts: [
        {
          title: "Imported post",
          text: "Original text",
          imageUrls: ["https://cdn.test/post.jpg"],
          buttonRows: [],
        },
      ],
    });
    const setPlacements = vi.fn();
    render(
      <AdSaleSharedPost
        placements={placements}
        channels={[{ id: "channel-1", title: "Main" }] as never}
        mode="shared"
        systemBotConnected
        systemBotUsername="@system_bot"
        workspaceId="workspace-1"
        onModeChange={vi.fn()}
        setPlacements={setPlacements}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add new post from bot" }),
    );
    await screen.findByRole("button", { name: "Sent to bot" });
    window.dispatchEvent(new Event("focus"));

    await waitFor(() => expect(setPlacements).toHaveBeenCalled());
    expect(
      screen.getByRole("button", { name: "Sent to bot" }),
    ).toHaveTextContent("✅ Added from bot");
    const importedDraftWasStored = setPlacements.mock.calls.some(([update]) =>
      update(placements).every(
        (placement: { managedPostDraft?: { text?: string } }) =>
          placement.managedPostDraft?.text === "Original text",
      ),
    );
    expect(importedDraftWasStored).toBe(true);
  });

  it("lets the user start with a separate post for every channel", () => {
    const onModeChange = vi.fn();
    render(
      <AdSaleSharedPost
        placements={placements}
        channels={[{ id: "channel-1", title: "Main" }] as never}
        mode="shared"
        onModeChange={onModeChange}
        setPlacements={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("switch", {
        name: "Use one advertising post for all channels",
      }),
    );
    expect(onModeChange).toHaveBeenCalledWith("individual");
  });

  it("offers bot connection without preparing an import when disconnected", () => {
    render(
      <AdSaleSharedPost
        placements={placements}
        channels={[{ id: "channel-1", title: "Main" }] as never}
        mode="shared"
        systemBotConnected={false}
        systemBotUsername="@system_bot"
        workspaceId="workspace-1"
        onModeChange={vi.fn()}
        setPlacements={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Add new post from bot" }),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "Connect bot" })).toHaveAttribute(
      "href",
      "https://t.me/system_bot?start=connect",
    );
    expect(telegramSystemBotApi.startPostImport).not.toHaveBeenCalled();
  });

  it("does not mark an empty draft as a completed shared post", () => {
    render(
      <AdSaleSharedPost
        placements={
          (placements as unknown as Array<Record<string, unknown>>).map(
            (placement) => ({
              ...placement,
              managedPostDraft: {
                title: "Advertising post",
                text: "   ",
                imageUrls: [],
                buttonRows: [],
              },
            }),
          ) as never
        }
        channels={[{ id: "channel-1", title: "Main" }] as never}
        mode="shared"
        onModeChange={vi.fn()}
        setPlacements={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Create shared post" }),
    ).toBeTruthy();
    expect(screen.queryByText(/✅/)).toBeNull();
  });
});
