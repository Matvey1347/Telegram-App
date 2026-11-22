import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestI18nProvider } from "@/test/render-with-i18n";
import { AiPostingPage } from "./ai-posting-page";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  resolveCustomEmojiDocuments: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { get: mocks.get, put: mocks.put, post: mocks.post },
  iconsApi: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
  },
  telegramContentHypothesesApi: { list: vi.fn().mockResolvedValue([]) },
  telegramChannelsApi: {
    postGroupSummaries: vi.fn().mockResolvedValue([]),
    customEmojiPacks: vi.fn().mockResolvedValue({ packs: [] }),
    resolveCustomEmojiDocuments: mocks.resolveCustomEmojiDocuments,
  },
}));
vi.mock("@/providers/toast-provider", () => ({
  useOperationFeedback: () => ({
    start: vi.fn(() => ({
      update: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
      dismiss: vi.fn(),
    })),
    dismiss: vi.fn(),
  }),
  useAppToast: () => ({
    pushToast: vi.fn(),
    startOperation: vi.fn(() => ({
      update: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
      dismiss: vi.fn(),
    })),
    dismissOperation: vi.fn(),
  }),
}));
vi.mock("../telegram/managed-posts-import-source", () => ({
  ManagedPostsImportSource: () => (
    <div data-testid="managed-posts-import-source" />
  ),
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
    mocks.resolveCustomEmojiDocuments.mockResolvedValue({ packs: [] });
  });

  it("keeps the active settings section in the URL", async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("aiPostingTab", "images");
    window.history.replaceState(window.history.state, "", url);
    const view = renderPage();

    expect(await screen.findByRole("link", { name: "Медиа" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    fireEvent.click(screen.getByRole("link", { name: "Идея канала" }));
    expect(
      new URLSearchParams(window.location.search).get("aiPostingTab"),
    ).toBe("idea");

    view.unmount();
    renderPage();
    expect(
      await screen.findByRole("link", { name: "Идея канала" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("loads current settings without requiring an initial save", async () => {
    renderPage();
    expect(
      await screen.findByRole("button", { name: /Сгенерировать/ }),
    ).toBeEnabled();
    expect(
      screen.queryByText("Сначала сохраните текущие настройки AI Posting."),
    ).not.toBeInTheDocument();
  });

  it("treats settings reverted to the saved value as clean", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("link", { name: "Медиа" }));
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    const avatarToggle = screen.getByRole("button", {
      name: "Добавлять аватар канала на медиа",
    });
    fireEvent.click(avatarToggle);
    const x = screen.getByRole("spinbutton", { name: "X" });
    fireEvent.change(x, { target: { value: "92.5" } });
    expect(x).toHaveValue(92.5);
    fireEvent.change(x, { target: { value: "100" } });
    const opacity = await screen.findByRole("slider", {
      name: "Непрозрачность водяного знака",
    });
    fireEvent.keyDown(opacity, { key: "ArrowLeft" });
    fireEvent.keyDown(opacity, { key: "End" });
    fireEvent.click(avatarToggle);
    vi.unstubAllGlobals();

    expect(screen.getByRole("button", { name: /Сгенерировать/ })).toBeEnabled();
    expect(
      screen.queryByText("Сначала сохраните текущие настройки AI Posting."),
    ).not.toBeInTheDocument();
  });

  it("saves an edit from the writing section", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("link", { name: "Идея канала" }));
    fireEvent.change(
      screen.getByPlaceholderText(
        "Кому адресованы публикации и что важно этой аудитории",
      ),
      {
        target: { value: "Readers who need practical ideas" },
      },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Сохранить настройки" }),
    );

    await waitFor(() =>
      expect(mocks.put).toHaveBeenCalledWith(
        expect.stringContaining("/ai-posting"),
        expect.objectContaining({
          configuration: expect.objectContaining({
            topic: "Practical guidance",
            audience: "Readers who need practical ideas",
          }),
        }),
      ),
    );
  });

  it("restores the generated base ending without replacing custom ending text", async () => {
    mocks.get.mockImplementation(async (url?: string) => {
      if (url?.endsWith("/chat") || url?.includes("/test-runs"))
        return { data: [] };
      return {
        data: {
          ...settings,
          configuration: {
            ...settings.configuration,
            ending: "Авторская подпись",
          },
          channel: {
            title: "Science",
            username: "science_channel",
            presentationIconPresentation: {
              type: "unicode",
              value: "📣",
              telegramCustomEmojiId: "987654321",
            },
          },
        },
      };
    });
    renderPage();
    fireEvent.click(await screen.findByRole("link", { name: "Как писать" }));
    expect(screen.getByText("Авторская подпись")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Вернуть базовую" }));
    expect(screen.getByRole("link", { name: /Science/ })).toHaveAttribute(
      "href",
      "https://t.me/science_channel",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Сохранить настройки" }),
    );
    await waitFor(() =>
      expect(mocks.put).toHaveBeenCalledWith(
        expect.stringContaining("/ai-posting"),
        expect.objectContaining({
          configuration: expect.objectContaining({
            ending: "",
          }),
        }),
      ),
    );
  });

  it("renders the default ending as a Telegram preview with resolved premium emoji", async () => {
    mocks.get.mockImplementation(async (url?: string) => {
      if (url?.endsWith("/chat") || url?.includes("/test-runs"))
        return { data: [] };
      return {
        data: {
          ...settings,
          channel: {
            title: "Science",
            username: "science_channel",
            presentationIconPresentation: {
              type: "unicode",
              value: "📣",
              telegramCustomEmojiId: "987654321",
            },
          },
        },
      };
    });
    mocks.resolveCustomEmojiDocuments.mockResolvedValue({
      packs: [
        {
          id: "pack-1",
          title: "Channel icons",
          emojis: [
            {
              documentId: "987654321",
              alt: "📣",
              kind: "STATIC",
              assetUrl: "https://cdn.example/megaphone.webp",
            },
          ],
        },
      ],
    });

    renderPage();
    fireEvent.click(await screen.findByRole("link", { name: "Как писать" }));

    expect(
      await screen.findByRole("link", { name: /Science/ }),
    ).toHaveAttribute("href", "https://t.me/science_channel");
    expect(await screen.findByAltText("📣")).toHaveAttribute(
      "src",
      "https://cdn.example/megaphone.webp",
    );
    expect(screen.queryByText(/tg:\/\/emoji\?id=/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Science" })).toHaveAttribute(
      "href",
      "https://t.me/science_channel",
    );
  });
});
