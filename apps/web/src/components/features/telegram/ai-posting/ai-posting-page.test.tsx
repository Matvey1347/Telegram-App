import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestI18nProvider } from "@/test/render-with-i18n";
import { telegramChannelKeys } from "@/lib/query-keys";
import { AiPostingPage } from "./ai-posting-page";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  listHypotheses: vi.fn(),
  listGroups: vi.fn(),
  customEmojiPacks: vi.fn(),
  importCustomEmojiPack: vi.fn(),
  detachCustomEmojiPack: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { get: mocks.get, put: mocks.put, post: mocks.post },
  iconsApi: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    createCustom: vi.fn(),
    createEmoji: vi.fn(),
    createTemporaryImage: vi.fn(),
    upload: vi.fn(),
    remove: vi.fn(),
  },
  telegramContentHypothesesApi: { list: mocks.listHypotheses },
  telegramChannelsApi: {
    postGroupSummaries: mocks.listGroups,
    customEmojiPacks: mocks.customEmojiPacks,
    importCustomEmojiPack: mocks.importCustomEmojiPack,
    detachCustomEmojiPack: mocks.detachCustomEmojiPack,
  },
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: vi.fn() }),
}));
vi.mock("./ai-posting-test-console", () => ({
  AiPostingTestConsole: ({
    settingsReady,
    onRememberImageRule,
  }: {
    settingsReady: boolean;
    onRememberImageRule?: (value: string) => Promise<void>;
  }) => (
    <div data-testid="settings-ready">
      {String(settingsReady)}
      <button onClick={() => void onRememberImageRule?.("Avoid charts")}>
        Remember image feedback
      </button>
    </div>
  ),
}));
vi.mock("./ai-posting-analytics", () => ({
  AiPostingAnalytics: () => null,
}));
vi.mock("./ai-posting-autopilot-history", () => ({
  AiPostingAutopilotHistory: () => null,
}));

describe("AiPostingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.post.mockResolvedValue({
      data: { ok: true, available: true, message: "Источник доступен." },
    });
    mocks.get.mockResolvedValue({
      data: {
        configuration: {
          language: "",
          channelDescription: "",
          topic: "",
          audience: "",
          style: "",
          instructions: "",
          historyMode: "all",
          historyFrom: "",
          sources: [],
          categories: [],
          formats: [],
          suggestCategories: true,
          variedLength: true,
          variedFormats: true,
          emojiPolicy: "contextual",
          ending: "",
          hashtags: "disabled",
          imageMode: "found",
        },
        autopilotEnabled: false,
        configured: true,
        detectedLanguage: "uk",
        autopilot: {
          postsPerDay: 4,
          targetReadyDrafts: 50,
          maxReadyDrafts: 100,
          targetCoverageDays: 14,
          criticalCoverageDays: 7,
          aiMonthlyBudget: "",
        },
      },
    });
    mocks.put.mockResolvedValue({ data: {} });
    mocks.listHypotheses.mockResolvedValue([]);
    mocks.listGroups.mockResolvedValue([]);
    mocks.customEmojiPacks.mockResolvedValue({ packs: [] });
    mocks.importCustomEmojiPack.mockResolvedValue({ packs: [] });
    mocks.detachCustomEmojiPack.mockResolvedValue({ packs: [] });
  });

  it("enables generation after a saved configuration is normalized and reordered by the server", async () => {
    const user = userEvent.setup();
    let stored = (await mocks.get()).data;
    mocks.get.mockImplementation(async () => ({ data: stored }));
    mocks.put.mockImplementation(async (_url, body) => {
      stored = {
        ...stored,
        configuration: Object.fromEntries(
          Object.entries({
            ...body.configuration,
            audience: "server default",
          }).reverse(),
        ),
      };
      return { data: {} };
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AiPostingPage channelId="channel-1" channelTitle="Channel" />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("settings-ready")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("settings-ready")).toHaveTextContent("true");
    await user.type(screen.getByPlaceholderText(/канал для людей/), "Описание");
    expect(screen.getByTestId("settings-ready")).toHaveTextContent("false");
    await user.click(
      screen.getByRole("button", { name: "Сохранить настройки" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("settings-ready")).toHaveTextContent("true"),
    );
  });

  it("restores the automatic length toggle with a detailed tooltip", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <TestI18nProvider>
          <AiPostingPage channelId="channel-1" channelTitle="Channel" />
        </TestI18nProvider>
      </QueryClientProvider>,
    );
    const toggle = await screen.findByRole("button", {
      name: "Авто определяет длину",
    });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.hover(
      screen.getByRole("button", {
        name: "Что означает автоопределение длины",
      }),
    );
    expect(
      await screen.findByText(
        /AI сам выбирает короткий, средний или длинный текст/,
      ),
    ).toBeInTheDocument();
  });

  it("keeps image preferences across tabs and sends them in settings", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AiPostingPage channelId="channel-1" channelTitle="Channel" />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Медиа" }));
    await user.click(screen.getByRole("button", { name: "Добавить предпочтение" }));
    const createDialog = screen.getByRole("dialog", { name: "Добавить предпочтение" });
    await user.type(
      within(createDialog).getByLabelText("Название предпочтения"),
      "Рисованная абстракция",
    );
    await user.type(within(createDialog).getByLabelText("Описание предпочтения"), "Пастельная палитра");
    await user.click(within(createDialog).getByRole("button", { name: "Добавить" }));
    await user.click(screen.getByRole("button", { name: "Контекст" }));
    await user.click(screen.getByRole("button", { name: "Медиа" }));
    expect(screen.getByText("Рисованная абстракция")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Редактировать предпочтение 1" }));
    const editDialog = screen.getByRole("dialog", { name: "Редактировать предпочтение" });
    const preferenceName = within(editDialog).getByLabelText("Название предпочтения");
    fireEvent.change(preferenceName, { target: { value: "Яркая абстракция" } });
    await user.click(within(editDialog).getByRole("button", { name: "Сохранить" }));
    await user.click(
      screen.getByRole("button", { name: "Сохранить настройки" }),
    );
    await waitFor(() =>
      expect(mocks.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          configuration: expect.objectContaining({
            mediaPreferences: [
              expect.objectContaining({
                name: "Яркая абстракция",
                description: "Пастельная палитра",
                emoji: "🎨",
                references: [],
              }),
            ],
          }),
        }),
      ),
    );
  });

  it("lets users import Premium Emoji packs from the ending picker", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <TestI18nProvider>
          <AiPostingPage channelId="channel-1" channelTitle="Channel" />
        </TestI18nProvider>
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Контекст" }));
    await user.click(
      screen.getByRole("button", { name: "Вставить Premium-эмодзи" }),
    );
    await user.click(screen.getByRole("button", { name: "Premium" }));
    await screen.findByText("No Premium emoji available in this workspace.");
    await user.click(screen.getByRole("button", { name: "Add Premium Emoji" }));
    const packLink = await screen.findByPlaceholderText(
      "Telegram emoji pack link",
    );
    await user.type(packLink, "https://t.me/addemoji/ChannelAvatars");
    await user.click(screen.getByRole("button", { name: "Add Premium Emoji" }));
    await waitFor(() =>
      expect(mocks.importCustomEmojiPack).toHaveBeenCalledWith({
        source: "https://t.me/addemoji/ChannelAvatars",
      }),
    );
  });

  it("shows the selected channel avatar before saving settings", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(
      telegramChannelKeys.select({
        canPostMessagesOnly: true,
        owned: true,
        includeTest: true,
      }),
      [
        {
          id: "channel-1",
          photoUrl: "https://media.example/channel-avatar.jpg",
        },
      ],
    );
    render(
      <QueryClientProvider client={client}>
        <AiPostingPage channelId="channel-1" channelTitle="Channel" />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Медиа" }));
    await user.click(
      screen.getByRole("button", { name: "Добавлять аватар канала на медиа" }),
    );
    expect(
      await screen.findByAltText("Аватар канала для водяного знака"),
    ).toBeVisible();
    expect(
      screen.queryByText("У канала пока нет загруженного аватара."),
    ).not.toBeInTheDocument();
  });

  it("persists image feedback as a structured media preference immediately", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AiPostingPage channelId="channel-1" channelTitle="Channel" />
      </QueryClientProvider>,
    );
    await user.click(
      await screen.findByRole("button", { name: "Remember image feedback" }),
    );
    await waitFor(() =>
      expect(mocks.put).toHaveBeenCalledWith(
        "/telegram-channels/channel-1/ai-posting",
        expect.objectContaining({
          configuration: expect.objectContaining({
            mediaPreferences: [
              expect.objectContaining({
                name: "Пожелание по медиа",
                description: "Avoid charts",
                references: [],
              }),
            ],
          }),
        }),
      ),
    );
  });

  it("keeps image settings while switching tabs and saves them with the settings", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AiPostingPage channelId="channel-1" channelTitle="Channel" />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Источники" }));
    await user.click(
      screen.getByRole("button", {
        name: "Использовать изображения из всех источников",
      }),
    );
    await user.type(
      screen.getByPlaceholderText("URL источника"),
      "https://example.com/feed",
    );
    await user.click(screen.getByRole("button", { name: "Добавить" }));

    await user.click(screen.getByRole("button", { name: "Форматы" }));
    await user.click(screen.getByRole("button", { name: "Источники" }));
    expect(
      screen.getByRole("button", {
        name: "Использовать изображения из всех источников",
      }),
    ).toHaveAttribute("aria-pressed", "false");

    await user.click(
      screen.getByRole("button", { name: "Сохранить настройки" }),
    );
    await waitFor(() => expect(mocks.put).toHaveBeenCalled());
    expect(mocks.put.mock.calls.at(-1)?.[1]).toMatchObject({
      configuration: {
        sources: [
          expect.objectContaining({
            value: "https://example.com/feed",
            useImages: false,
          }),
        ],
      },
    });
  });

  it("loads existing channel rubrics and groups into the first saved configuration", async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValueOnce({
      data: {
        configuration: {
          language: "",
          channelDescription: "",
          topic: "",
          audience: "",
          style: "",
          instructions: "",
          historyMode: "all",
          historyFrom: "",
          sources: [],
          categories: [],
          formats: [],
          suggestCategories: true,
          variedLength: true,
          variedFormats: true,
          ending: "",
          hashtags: "disabled",
          imageMode: "found",
        },
        autopilotEnabled: false,
        configured: false,
        detectedLanguage: "uk",
        autopilot: {
          postsPerDay: 4,
          targetReadyDrafts: 50,
          maxReadyDrafts: 100,
          targetCoverageDays: 14,
          criticalCoverageDays: 7,
          aiMonthlyBudget: "",
        },
      },
    });
    mocks.listHypotheses.mockResolvedValue([
      { name: "Психологічні патерни", status: "ACTIVE" },
    ]);
    mocks.listGroups.mockResolvedValue([{ title: "Практична психологія" }]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AiPostingPage channelId="channel-1" channelTitle="Channel" />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Форматы" }));
    expect(
      screen.getByText("Использовать все контент-гипотезы канала"),
    ).toBeVisible();
    expect(screen.getByText("Использовать все группы канала")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Сохранить настройки" }),
    );

    await waitFor(() => expect(mocks.put).toHaveBeenCalled());
    expect(mocks.put.mock.calls.at(-1)?.[1]).toMatchObject({
      configuration: {
        categories: ["Психологічні патерни"],
        formats: ["Практична психологія"],
      },
    });
  });

  it("imports source settings from JSON", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AiPostingPage channelId="channel-1" channelTitle="Channel" />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Источники" }));
    await user.click(screen.getByRole("button", { name: "Импорт JSON" }));
    await user.click(screen.getByLabelText("JSON источников"));
    await user.paste(
      '[{"type":"rss","value":"https://example.org/feed","enabled":true,"useImages":false,"rightsConfirmed":true}]',
    );
    await user.click(
      screen.getByRole("button", { name: "Проверить и добавить из JSON" }),
    );
    expect(screen.getByText("https://example.org/feed")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Сохранить настройки" }),
    );
    await waitFor(() => expect(mocks.put).toHaveBeenCalled());
    expect(mocks.put.mock.calls.at(-1)?.[1]).toMatchObject({
      configuration: {
        sources: [
          expect.objectContaining({
            value: "https://example.org/feed",
            useImages: false,
          }),
        ],
      },
    });
  });

  it("loads a JSON file and imports its sources", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AiPostingPage channelId="channel-1" channelTitle="Channel" />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Источники" }));
    await user.click(screen.getByRole("button", { name: "Импорт JSON" }));
    const content =
      '[{"type":"rss","value":"https://example.org/news","enabled":false,"useImages":false}]';
    const file = new File([content], "sources.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      value: () => Promise.resolve(content),
    });
    await user.upload(screen.getByLabelText("Выбрать JSON-файл"), file);
    await waitFor(() =>
      expect(screen.getByLabelText("JSON источников")).toHaveValue(content),
    );
    await user.click(
      screen.getByRole("button", { name: "Проверить и добавить из JSON" }),
    );
    expect(screen.getByText("https://example.org/news")).toBeVisible();
    const sourceToggle = screen.getByRole("button", {
      name: "Использовать источник: https://example.org/news",
    });
    expect(sourceToggle).toHaveAttribute("aria-pressed", "false");
    expect(sourceToggle.parentElement?.parentElement).toContainElement(
      screen.getByText("https://example.org/news"),
    );
    expect(
      screen.queryByText(/Есть право использовать изображения/),
    ).not.toBeInTheDocument();
    await user.click(sourceToggle);
    expect(sourceToggle).toHaveAttribute("aria-pressed", "true");
  });

  it("rejects oversized source files without replacing the current text", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AiPostingPage channelId="channel-1" channelTitle="Channel" />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Источники" }));
    await user.click(screen.getByRole("button", { name: "Импорт JSON" }));
    await user.click(screen.getByLabelText("JSON источников"));
    await user.paste("[]");
    await user.upload(
      screen.getByLabelText("Выбрать JSON-файл"),
      new File([new Uint8Array(1024 * 1024 + 1)], "too-large.json", {
        type: "application/json",
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Файл должен быть не больше 1 МБ.",
    );
    expect(screen.getByLabelText("JSON источников")).toHaveValue("[]");
  });

  it("generates structure and saves both creation switches", async () => {
    const user = userEvent.setup();
    mocks.post.mockResolvedValue({
      data: { groups: ["New group"], hypotheses: ["New hypothesis"] },
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AiPostingPage channelId="channel-1" channelTitle="Channel" />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Форматы" }));
    await user.click(
      screen.getByRole("button", { name: "Разрешить создавать новые группы" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Разрешить создавать новые контент-гипотезы",
      }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Сгенерировать группы и контент-гипотезы с AI",
      }),
    );
    await screen.findByText("Создано групп: 1, контент-гипотез: 1.");
    expect(mocks.post).toHaveBeenCalledWith(
      "/telegram-channels/channel-1/ai-posting/generate-structure",
      { description: "", language: "uk" },
    );
    await user.click(
      screen.getByRole("button", { name: "Сохранить настройки" }),
    );
    await waitFor(() => expect(mocks.put).toHaveBeenCalled());
    expect(mocks.put.mock.calls.at(-1)?.[1]).toMatchObject({
      configuration: {
        allowCreateGroups: true,
        allowCreateHypotheses: true,
        formats: ["New group"],
        categories: ["New hypothesis"],
      },
    });
  });
});
