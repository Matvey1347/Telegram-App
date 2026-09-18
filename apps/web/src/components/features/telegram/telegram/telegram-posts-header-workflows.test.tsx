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
          />
        </TestI18nProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("button", { name: "Import" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Context" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Return all scheduled posts to drafts",
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mass Publications" }));
    expect(screen.getByText("Post batch modal open")).toBeVisible();
  });
});
