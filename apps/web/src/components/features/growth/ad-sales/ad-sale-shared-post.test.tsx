import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdSaleSharedPost } from "./ad-sale-shared-post";

describe("AdSaleSharedPost", () => {
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
    const onSendSystemBotPost = vi.fn().mockResolvedValue(undefined);
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
        onSendSystemBotPost={onSendSystemBotPost}
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
    expect(onSendSystemBotPost).toHaveBeenCalledWith(draft);
  });

  it("asks the connected bot to start import without opening Telegram", async () => {
    const open = vi.spyOn(window, "open");
    let resolveWorkflow!: (value: string) => void;
    const onPrepareSystemBot = vi.fn(
      () =>
        new Promise<string>((resolve) => {
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
        onPrepareSystemBot={onPrepareSystemBot}
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
    resolveWorkflow("workflow-1");
    await waitFor(() => expect(onPrepareSystemBot).toHaveBeenCalledTimes(1));
    expect(open).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("button", { name: "Sent to bot" }),
    ).toHaveTextContent("✅ Added from bot");
  });

  it("keeps bot import and the editor available for one placement without the shared toggle", () => {
    render(
      <AdSaleSharedPost
        placements={[placements[0]]}
        channels={[{ id: "channel-1", title: "Main" }] as never}
        mode="shared"
        systemBotConnected
        systemBotUsername="@system_bot"
        onPrepareSystemBot={vi.fn().mockResolvedValue("workflow-1")}
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
    render(
      <AdSaleSharedPost
        placements={placements}
        channels={[{ id: "channel-1", title: "Main" }] as never}
        mode="shared"
        systemBotConnected
        systemBotUsername="@system_bot"
        onPrepareSystemBot={vi.fn().mockRejectedValue(new Error("denied"))}
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
    const setPlacements = vi.fn();
    render(
      <AdSaleSharedPost
        placements={placements}
        channels={[{ id: "channel-1", title: "Main" }] as never}
        mode="shared"
        systemBotConnected
        systemBotUsername="@system_bot"
        onPrepareSystemBot={vi.fn().mockResolvedValue("workflow-1")}
        onSystemBotReturn={vi.fn().mockResolvedValue({
          title: "Imported post",
          text: "Original text",
          imageUrls: ["https://cdn.test/post.jpg"],
          buttonRows: [],
        })}
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
    const onPrepareSystemBot = vi.fn().mockResolvedValue("workflow-1");
    render(
      <AdSaleSharedPost
        placements={placements}
        channels={[{ id: "channel-1", title: "Main" }] as never}
        mode="shared"
        systemBotConnected={false}
        systemBotUsername="@system_bot"
        onPrepareSystemBot={onPrepareSystemBot}
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
    expect(onPrepareSystemBot).not.toHaveBeenCalled();
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
