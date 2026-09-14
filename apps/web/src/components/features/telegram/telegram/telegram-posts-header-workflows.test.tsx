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
  GptContextDownloadButton: () => null,
}));
vi.mock("./reset-channel-scheduled-posts-button", () => ({
  ResetChannelScheduledPostsButton: () => null,
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
  it("keeps Add via bot available while route channel selection is unresolved", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TestI18nProvider>
          <TelegramPostsHeaderWorkflows
            channel={undefined}
            channels={[channel]}
            workspaceView="posts"
            importMode={null}
            importTranslationsReady={false}
            onChannelChange={vi.fn()}
            onImportModeChange={vi.fn()}
            onNewPost={vi.fn()}
            onNewGroup={vi.fn()}
            onResetCompleted={vi.fn()}
          />
        </TestI18nProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add via bot" }));
    expect(screen.getByText("Post batch modal open")).toBeVisible();
  });
});
