import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { PlacementPostComposer } from "./placement-post-composer";

vi.mock(
  "@/components/features/telegram/telegram/telegram-post-preview",
  () => ({
    TelegramPostPreview: () => <div data-testid="telegram-preview" />,
  }),
);
vi.mock("@/components/features/telegram/telegram/telegram-text-editor", () => ({
  TelegramTextEditor: ({
    onButtonRowsChange,
  }: {
    onButtonRowsChange?: unknown;
  }) => (
    <div
      data-testid="telegram-editor"
      data-inline-buttons={onButtonRowsChange ? "editable" : "locked"}
    />
  ),
}));
vi.mock(
  "@/components/features/telegram/telegram/telegram-image-upload",
  () => ({
    TelegramImageUpload: () => <div data-testid="telegram-image-upload" />,
  }),
);

function renderComposer(
  overrides: Partial<ComponentProps<typeof PlacementPostComposer>> = {},
) {
  const onChange = vi.fn();
  const onLoadPublishedPosts = vi.fn();
  render(
    <PlacementPostComposer
      channelTitle="Test channel"
      draft={null}
      existingPostId={null}
      publishedPosts={[]}
      postsLoading={false}
      canCreate
      autoCreate={false}
      onChange={onChange}
      onLoadPublishedPosts={onLoadPublishedPosts}
      {...overrides}
    />,
  );
  return { onChange, onLoadPublishedPosts };
}

describe("PlacementPostComposer", () => {
  it("opens the custom post editor from the toggle", async () => {
    const { onChange } = renderComposer();

    await userEvent.click(
      screen.getByRole("switch", {
        name: "Create advertising post from scratch",
      }),
    );

    expect(onChange).toHaveBeenCalledWith({
      draft: expect.objectContaining({ title: "Advertising post", text: "" }),
      telegramPostId: null,
    });
  });

  it("automatically creates a draft for a future placement", () => {
    const { onChange } = renderComposer({ autoCreate: true });

    expect(onChange).toHaveBeenCalledWith({
      draft: expect.objectContaining({ title: "Advertising post", text: "" }),
      telegramPostId: null,
    });
  });

  it("hides the per-channel toggle while editing a locked shared copy", () => {
    renderComposer({
      lockToDraft: true,
      draft: {
        title: "Advertising post",
        text: "Shared text",
        imageUrls: [],
        buttonRows: [],
      },
    });

    expect(screen.getByText("Channel post")).toBeTruthy();
    expect(
      screen.queryByRole("switch", {
        name: "Create advertising post from scratch",
      }),
    ).toBeNull();
  });

  it("does not expose inline-button editing for an MTProto shared post", () => {
    renderComposer({
      lockToDraft: true,
      allowInlineButtonEditing: false,
      draft: {
        title: "Advertising post",
        text: "Shared text",
        imageUrls: [],
        buttonRows: [],
      },
    });

    expect(screen.getByTestId("telegram-editor")).toHaveAttribute(
      "data-inline-buttons",
      "locked",
    );
  });

  it("resolves a pasted Telegram link without using the placement date", async () => {
    const onLoadPublishedPosts = vi.fn().mockResolvedValue({
      id: "post-2",
      title: "Linked post",
      publishedAt: "2026-08-20T10:00:00.000Z",
    });
    const { onChange } = renderComposer({ onLoadPublishedPosts });
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Select a published post" }),
    );
    fireEvent.paste(
      screen.getByPlaceholderText("Search posts or paste a Telegram link"),
      {
        clipboardData: {
          getData: () => "https://t.me/c/3988203250/2",
        },
      },
    );

    await waitFor(() => {
      expect(onLoadPublishedPosts).toHaveBeenLastCalledWith(
        "https://t.me/c/3988203250/2",
      );
      expect(onChange).toHaveBeenCalledWith({
        telegramPostId: "post-2",
        publishedAt: "2026-08-20T10:00:00.000Z",
        draft: null,
      });
    });
  });

  it("uses explicit select and link inputs for a past placement", async () => {
    const onLoadPublishedPosts = vi.fn().mockResolvedValue({
      id: "post-past",
      title: "Past post",
      publishedAt: "2026-08-20T10:00:00.000Z",
    });
    const { onChange } = renderComposer({
      canCreate: false,
      onLoadPublishedPosts,
    });

    expect(
      screen.queryByRole("switch", {
        name: "Create advertising post from scratch",
      }),
    ).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Paste link" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Telegram post link" }),
      "https://t.me/channel/42",
    );
    await userEvent.click(screen.getByRole("button", { name: "Use link" }));

    expect(onLoadPublishedPosts).toHaveBeenCalledWith(
      "https://t.me/channel/42",
    );
    expect(onChange).toHaveBeenCalledWith({
      telegramPostId: "post-past",
      publishedAt: "2026-08-20T10:00:00.000Z",
      draft: null,
    });
  });
});
