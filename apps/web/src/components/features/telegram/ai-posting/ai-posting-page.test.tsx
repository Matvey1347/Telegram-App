import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestI18nProvider } from "@/test/render-with-i18n";
import { AiPostingPage } from "./ai-posting-page";

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));

vi.mock("@/lib/api", () => ({
  api: { get: mocks.get, put: mocks.put, post: mocks.post },
  iconsApi: { list: vi.fn().mockResolvedValue([]), get: vi.fn().mockResolvedValue(null) },
  telegramContentHypothesesApi: { list: vi.fn().mockResolvedValue([]) },
  telegramChannelsApi: {
    postGroupSummaries: vi.fn().mockResolvedValue([]),
    customEmojiPacks: vi.fn().mockResolvedValue({ packs: [] }),
  },
}));
vi.mock("@/providers/toast-provider", () => ({
  useOperationFeedback: () => ({
    start: vi.fn(() => ({ update: vi.fn(), succeed: vi.fn(), fail: vi.fn(), dismiss: vi.fn() })),
    dismiss: vi.fn(),
  }),
  useAppToast: () => ({
    pushToast: vi.fn(),
    startOperation: vi.fn(() => ({ update: vi.fn(), succeed: vi.fn(), fail: vi.fn(), dismiss: vi.fn() })),
    dismissOperation: vi.fn(),
  }),
}));
vi.mock("../telegram/managed-posts-import-source", () => ({
  ManagedPostsImportSource: () => <div data-testid="managed-posts-import-source" />,
}));
vi.mock("./ai-posting-chat", () => ({
  AiPostingChat: () => <div data-testid="ai-posting-chat" />,
}));

const settings = {
  configuration: {
    language: "",
    topic: "Practical guidance",
    audience: "Readers",
    historyMode: "all",
    historyFrom: "",
    variedLength: true,
    emojiPolicy: "contextual",
    ending: "",
    hashtags: "disabled",
    imageMode: "ai",
    mediaPreferences: [],
    spheres: [],
    rubrics: [],
    lengths: [],
    imageAvoidances: [],
    useChannelAvatarInMedia: false,
  },
  mode: "TEST",
  draftExpirationDays: 30,
  configured: true,
  detectedLanguage: "uk",
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <TestI18nProvider>
      <QueryClientProvider client={client}>
        <AiPostingPage channelId="channel-1" channelTitle="Channel" />
      </QueryClientProvider>
    </TestI18nProvider>,
  );
}

describe("AiPostingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockImplementation(async (url?: string) => {
      if (url?.endsWith("/chat") || url?.includes("/test-runs"))
        return { data: [] };
      return { data: settings };
    });
    mocks.put.mockResolvedValue({ data: settings });
    mocks.post.mockResolvedValue({ data: {} });
  });

  it("keeps the active settings section in the URL", async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("aiPostingTab", "images");
    window.history.replaceState(window.history.state, "", url);
    const view = renderPage();

    expect(
      await screen.findByRole("link", { name: "Медиа" }),
    ).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("link", { name: "Идея канала" }));
    expect(new URLSearchParams(window.location.search).get("aiPostingTab")).toBe(
      "idea",
    );

    view.unmount();
    renderPage();
    expect(
      await screen.findByRole("link", { name: "Идея канала" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("loads current settings without requiring an initial save", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: /Сгенерировать/ })).toBeEnabled();
    expect(
      screen.queryByText("Сначала сохраните текущие настройки AI Posting."),
    ).not.toBeInTheDocument();
  });

  it("saves an edit from the writing section", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("link", { name: "Как писать" }));
    fireEvent.click(await screen.findByRole("button", { name: "Сохранить настройки" }));

    await waitFor(() => expect(mocks.put).toHaveBeenCalledWith(
      expect.stringContaining("/ai-posting"),
      expect.objectContaining({
        configuration: expect.objectContaining({
          topic: "Practical guidance",
          audience: "Readers",
        }),
      }),
    ));
  });
});
