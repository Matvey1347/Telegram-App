import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { PlacementPostComposer } from "./placement-post-composer";

vi.mock("@/components/features/telegram/telegram/telegram-post-preview", () => ({
  TelegramPostPreview: () => <div data-testid="telegram-preview" />,
}));
vi.mock("@/components/features/telegram/telegram/telegram-text-editor", () => ({
  TelegramTextEditor: () => <div data-testid="telegram-editor" />,
}));
vi.mock("@/components/features/telegram/telegram/telegram-image-upload", () => ({
  TelegramImageUpload: () => <div data-testid="telegram-image-upload" />,
}));

function renderComposer(overrides: Partial<ComponentProps<typeof PlacementPostComposer>> = {}) {
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

    await userEvent.click(screen.getByRole("button", { name: "Custom advertising post" }));

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
});
