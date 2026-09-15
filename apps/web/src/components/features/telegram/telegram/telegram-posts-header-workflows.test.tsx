import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { TestI18nProvider } from "@/test/render-with-i18n";
import { TelegramPostsHeaderWorkflows } from "./telegram-posts-header-workflows";

vi.mock("./post-from-bot/post-from-bot-modal", () => ({
  PostFromBotModal: ({ open }: { open: boolean }) =>
    open ? <div>Post batch modal open</div> : null,
}));
vi.mock("./telegram-time-posts-control", () => ({
  TimePostsControl: () => null,
}));
vi.mock("./gpt-context-download-button", () => ({
  GptContextDownloadButton: () => <button type="button">Context</button>,
}));
vi.mock("./reset-channel-scheduled-posts-button", () => ({
  ResetChannelScheduledPostsButton: () => (
    <button type="button">Return all scheduled posts to drafts</button>
  ),
}));

const channel = {
  id: "channel-1",
  title: "News",
  isActive: true,
  canPostMessages: true,
  publishingCapabilities: {
    source: null,
    captionLengthMax: 1024,
    messageLengthMax: 4096,
    maxUploadFileSizeMb: null,
    supportsCustomEmoji: false,
    canPublishInlineButtons: false,
    checkedAt: null,
    isFallback: true,
  },
};

describe("TelegramPostsHeaderWorkflows", () => {
  it("keeps Mass Publications available while route channel selection is unresolved", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TestI18nProvider>
          <TelegramPostsHeaderWorkflows
            channel={undefined}
            channels={[channel]}
            importMode={null}
            importTranslationsReady={false}
            onChannelChange={vi.fn()}
            onImportModeChange={vi.fn()}
            onResetCompleted={vi.fn()}
          />
        </TestI18nProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("button", { name: "Import" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Context" })).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Return all scheduled posts to drafts",
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Mass Publications" }));
    expect(screen.getByText("Post batch modal open")).toBeVisible();
  });
});
