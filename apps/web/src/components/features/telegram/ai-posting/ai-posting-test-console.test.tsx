import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, streamProgressAction } from "@/lib/api";
import { renderWithProviders } from "@/test/render-with-providers";
import type { TestRun } from "./ai-posting-test-console-model";
import { AiPostingTestConsole } from "./ai-posting-test-console";

vi.mock("@/lib/api", () => ({
  API_MUTATION_EVENT: "test:api-mutation",
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  streamProgressAction: vi.fn(),
}));
vi.mock(
  "@/components/features/telegram/telegram/telegram-post-send-to-bot-button",
  () => ({
    TelegramPostSendToBotButton: ({ disabled }: { disabled?: boolean }) => (
      <button disabled={disabled}>Отправить в Telegram-бота</button>
    ),
  }),
);
vi.mock(
  "@/components/features/telegram/telegram/telegram-post-preview",
  () => ({
    TelegramPostPreview: ({
      text,
      channelPhotoUrl,
      onTextChange,
    }: {
      text: string;
      channelPhotoUrl?: string | null;
      onTextChange?: (value: string) => void;
    }) =>
      onTextChange ? (
        <textarea
          aria-label="Редактировать текст публикации"
          value={text}
          data-channel-photo={channelPhotoUrl}
          onChange={(event) => onTextChange(event.target.value)}
        />
      ) : (
        <div data-testid="telegram-preview">{text}</div>
      ),
  }),
);

describe("AiPostingTestConsole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    vi.mocked(api.post).mockResolvedValue({
      data: { runId: "run-1", generated: [] },
    });
    vi.mocked(api.delete).mockResolvedValue({ data: { deletedCount: 1 } });
    vi.mocked(streamProgressAction).mockImplementation(
      async (_path, _payload, onProgress) => {
        onProgress(
          { stage: "text", status: "RUNNING", publicationIndex: 0 },
          1,
          3,
        );
        return { runId: "run-1", generated: [] } as never;
      },
    );
  });

  it("runs real three-publication generation for saved settings", async () => {
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Сгенерировать",
      }),
    );

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/telegram-channels/channel-1/ai-posting/generate/background",
        { count: 3 },
        { feedback: { mode: "managed" } },
      ),
    );
  });

  it("shows source collection and can stop the active run after reopening", async () => {
    const run = {
      ...previewRun(), status: "RUNNING", canStop: true, publications: [],
      progress: { count: 1, current: 0, total: 9, complete: 0, failed: false, publicationIndex: 0, stage: "sources", stages: {} },
    };
    let stopped = false;
    vi.mocked(api.get).mockImplementation(async (url) => {
      const state = stopped ? { ...run, status: "CANCELED", progress: undefined, canStop: false } : run;
      return { data: url.endsWith("/progress") ? state : [state] };
    });
    vi.mocked(api.post).mockImplementation(async () => {
      stopped = true;
      return { data: { status: "CANCELED" } };
    });
    renderWithProviders(<AiPostingTestConsole channelId="channel-1" channelTitle="Channel" settingsReady />);
    expect(await screen.findByText("Собираю материалы для публикаций")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    fireEvent.click(screen.getByRole("button", { name: "Остановить" }));
    expect(await screen.findByText("Остановлено")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/telegram-channels/channel-1/ai-posting/test-runs/run-diagnostics/stop");
    expect(streamProgressAction).not.toHaveBeenCalled();
  });

  it("allows an ad hoc publication count", async () => {
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        dailyPostCount={4}
        settingsReady
      />,
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Число публикаций" }),
      {
        target: { value: "2" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Сгенерировать" }),
    );
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/telegram-channels/channel-1/ai-posting/generate/background",
        { count: 2 },
        { feedback: { mode: "managed" } },
      ),
    );
  });

  it("remembers the selected count after the console remounts", async () => {
    const first = renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-count-memory"
        channelTitle="Channel"
        dailyPostCount={4}
        settingsReady
      />,
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Число публикаций" }),
      { target: { value: "1" } },
    );
    first.unmount();

    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-count-memory"
        channelTitle="Channel"
        dailyPostCount={4}
        settingsReady
      />,
    );
    expect(
      screen.getByRole("spinbutton", { name: "Число публикаций" }),
    ).toHaveValue(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Сгенерировать" }),
    );
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/telegram-channels/channel-count-memory/ai-posting/generate/background",
        { count: 1 },
        { feedback: { mode: "managed" } },
      ),
    );
  });

  it("sends all ten requested slots to the background generator", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    vi.mocked(api.post).mockResolvedValue({ data: { runId: "batch-of-ten" } });
    renderWithProviders(<AiPostingTestConsole channelId="channel-ten" channelTitle="Channel" settingsReady />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Число публикаций" }), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Сгенерировать" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/telegram-channels/channel-ten/ai-posting/generate/background",
      { count: 10 },
      { feedback: { mode: "managed" } },
    ));
  });

  it("keeps saved previews in their original slots while the server works", async () => {
    const first = { ...previewRun().publications[0], publicationIndex: 0, text: "First preview", savedPostId: "saved-1" };
    const third = { ...first, publicationIndex: 2, text: "Third preview" };
    const run = { ...previewRun(), status: "RUNNING", requestedCount: 4, publications: [first, third] };
    vi.mocked(api.get).mockImplementation(async (url) => ({
      data: url.endsWith("/progress") ? { status: "RUNNING" } : [run],
    }));
    renderWithProviders(<AiPostingTestConsole channelId="channel-1" channelTitle="Channel" settingsReady />);
    expect(await screen.findByText("First preview")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Публикации запуска" })).not.toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Следующая публикация" });
    fireEvent.click(next);
    expect(screen.getByText("Публикация 2 из 4")).toBeInTheDocument();
    expect(screen.getByText("Публикация ещё обрабатывается")).toBeInTheDocument();
    fireEvent.click(next);
    expect(await screen.findByText("Third preview")).toBeInTheDocument();
  });

  it("opens the first result even when an earlier slot is still running", async () => {
    const preview = previewRun();
    const run = {
      ...preview, status: "RUNNING", requestedCount: 2,
      publications: [{ ...preview.publications[0], publicationIndex: 1, text: "Second preview" }],
    };
    vi.mocked(api.get).mockImplementation(async (url) => ({
      data: url.endsWith("/progress") ? { status: "RUNNING" } : [run],
    }));
    renderWithProviders(<AiPostingTestConsole channelId="channel-1" channelTitle="Channel" settingsReady />);
    expect(await screen.findByText("Second preview")).toBeInTheDocument();
    expect(screen.getByText("Публикация 2 из 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Одобрить" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Предыдущая публикация" }));
    expect(screen.getByText("Публикация ещё обрабатывается")).toBeInTheDocument();
  });

  it("offers to recreate an empty text in its original batch", async () => {
    const preview = previewRun();
    const run: TestRun = {
      ...preview,
      sourceDiagnostics: undefined,
      status: "PARTIAL",
      requestedCount: 2,
      publications: [{ ...preview.publications[0], publicationIndex: 0 }],
      failures: [{ publicationIndex: 1, topic: "An unfinished topic", code: "AI_POSTING_TEXT_EMPTY" }],
      operations: [{ publicationIndex: 1, stage: "text", status: "SUCCEEDED", actualCost: "0.02" }],
    };
    vi.mocked(api.get).mockResolvedValue({ data: [run] });
    renderWithProviders(
      <AiPostingTestConsole channelId="channel-1" channelTitle="Channel" settingsReady />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Следующая публикация" }));
    expect(screen.getByText("Текст пустой.")).toBeInTheDocument();
    expect(screen.getByText("Расходы на попытки: $0.02")).toBeInTheDocument();
    expect(screen.getByText("Публикация 2 из 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Пересоздать текст" }));
    await waitFor(() => expect(streamProgressAction).toHaveBeenCalledWith(
      `/telegram-channels/channel-1/ai-posting/test-runs/${run.id}/regenerate-failure/stream`,
      { failureIndex: 0, expectedVersion: run.version },
      expect.any(Function),
    ));
  });

  it("renders the saved text when only the image has failed", async () => {
    const run = {
      ...previewRun(undefined, { imageUrl: null, mediaReadiness: "MISSING", mediaFailureCode: "AI_POSTING_IMAGE_SEARCH_SHARE_LIMIT" }),
      status: "PARTIAL",
    };
    vi.mocked(api.get).mockResolvedValue({ data: [run] });
    renderWithProviders(<AiPostingTestConsole channelId="channel-1" channelTitle="Channel" settingsReady />);
    expect(await screen.findByRole("textbox", { name: "Редактировать текст публикации" })).toHaveValue("Post text");
    expect(screen.getByRole("button", { name: "Повторить создание медиа" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Одобрить" })).toBeDisabled();
  });

  it("explains text iterations and the next media search round with their costs", async () => {
    const preview = previewRun();
    const run: TestRun = {
      ...preview,
      sourceDiagnostics: undefined,
      status: "PARTIAL",
      publications: [{
        ...preview.publications[0],
        mediaReadiness: "MISSING",
        mediaMode: "found",
        costs: { planning: "0.001", review: "0", text: "0.02", image: "0.003" },
        operations: [
          { stage: "text", attempt: 1, model: "text-model", status: "SUCCEEDED", actualCost: "0.015", inputTokens: 15000 },
          { stage: "text", attempt: 2, model: "text-model", status: "SUCCEEDED", actualCost: "0.005", cachedInputTokens: 10000 },
          { stage: "image", attempt: 1, mediaStep: "SEARCH_REVIEW", model: "review-model", status: "SUCCEEDED", actualCost: "0.003" },
        ],
        mediaSearch: {
          nextPageOffset: 2,
          brief: "Снимок с естественным светом",
          rounds: [{
            queries: [{ text: "woman notebook desk", page: 2, catalog: "wikimedia", candidates: 3 }],
            inspected: 3, usable: 2, outcome: "NO_MATCH",
            observation: "Кадр не подходит к теме",
          }],
        },
      }],
    };
    vi.mocked(api.get).mockResolvedValue({ data: [run] });
    renderWithProviders(<AiPostingTestConsole channelId="channel-1" channelTitle="Channel" settingsReady />);

    fireEvent.click(await screen.findByText("Модели и расходы"));
    expect(screen.getByText("Текст · Попыток: 2")).toBeInTheDocument();
    expect(screen.getByText(/из кэша 10000/)).toBeInTheDocument();
    expect(screen.getByText(/Оценка найденных изображений/)).toHaveTextContent("$0.003");
    expect(screen.getByText(/Wikimedia Commons · woman notebook desk · стр. 2/)).toBeInTheDocument();
    expect(screen.getByText("Поиск 1 · Кандидаты не прошли проверку")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Продолжить подбор изображения" })).not.toBeInTheDocument();
  });

  it("shows completion as a green badge beside the run date and keeps the generator compact", async () => {
    const run = previewRun();
    vi.mocked(api.get).mockResolvedValue({ data: [run] });
    renderWithProviders(
      <AiPostingTestConsole channelId="channel-1" channelTitle="Channel" settingsReady />,
    );

    const badge = await screen.findByText("Completed");
    const date = screen.getByText(new Date(run.createdAt).toLocaleString());
    expect(badge).toHaveClass("bg-emerald-950", "text-emerald-300");
    expect(badge.querySelector(".lucide-circle-check")).toBeInTheDocument();
    expect(date.parentElement?.nextElementSibling).toBe(badge);
    expect(screen.queryByText(/Публикации останутся в тестовом запуске/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Пачки сохраняются в истории/)).not.toBeInTheDocument();
  });

  it("keeps the latest run visible, collapses prior runs and clears them on request", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        { ...previewRun(), id: "latest-run" },
        {
          ...previewRun(undefined, { topic: "An older topic" }),
          id: "older-run",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
    });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        channelPhotoUrl="https://media.example/channel.jpg"
        settingsReady
      />,
    );

    expect(await screen.findByRole("button", { name: "Очистить" })).toBeInTheDocument();
    expect(screen.queryByText("Последняя генерация")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Редактировать текст публикации" }))
      .toHaveAttribute("data-channel-photo", "https://media.example/channel.jpg");
    expect(screen.getByText("Идея: A useful topic")).toBeInTheDocument();
    expect(screen.queryByText("Идея: An older topic")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Показать/ }),
    );
    expect(screen.getByText("Публикация 1 из 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Следующая публикация" }));
    expect(await screen.findByText("Идея: An older topic")).toBeInTheDocument();
    expect(screen.getByText("Публикация 2 из 2")).toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: "Предпросмотр публикаций" })).toHaveLength(1);

    fireEvent.click(
      screen.getByRole("button", { name: /Очистить/ }),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Очистить историю" }));
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith(
        "/telegram-channels/channel-1/ai-posting/test-runs",
      ),
    );
  });

  it("shows one publication at a time and navigates the batch", async () => {
    const run = previewRun(undefined, {
      costs: {
        planning: "0.024",
        text: "0.033",
        image: "0.041",
        review: "0.012",
      },
    });
    run.publications = [
      run.publications[0],
      { ...run.publications[0], topic: "Second topic", title: "Second title" },
    ];
    vi.mocked(api.get).mockResolvedValue({ data: [run] });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );
    expect(await screen.findByText("Идея: A useful topic")).toBeInTheDocument();
    expect(screen.getByText("Итого: $0.11")).toBeInTheDocument();
    expect(screen.getByText("Публикация 1 из 2")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Следующая публикация" }),
    );
    expect(await screen.findByText("Идея: Second topic")).toBeInTheDocument();
    expect(screen.getByText("Публикация 2 из 2")).toBeInTheDocument();
  });

  it("saves image feedback as a channel rule before regenerating media", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [previewRun()] });
    const onRememberImageRule = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
        onRememberImageRule={onRememberImageRule}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Написать правки" }),
    );
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Правка медиа" }),
      {
        target: { value: "Use calm editorial illustrations" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Сохранить правило и обновить медиа",
      }),
    );
    await waitFor(() =>
      expect(onRememberImageRule).toHaveBeenCalledWith(
        "Use calm editorial illustrations",
      ),
    );
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/telegram-channels/channel-1/ai-posting/test-runs/run-diagnostics/review",
        expect.objectContaining({
          action: "regenerate-image",
          value: "Use calm editorial illustrations",
        }),
      ),
    );
  });

  it("requires persisted settings before starting a test run", async () => {
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady={false}
      />,
    );

    expect(
      await screen.findByRole("button", {
        name: "Сгенерировать",
      }),
    ).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("explains disabled AI and links to configuration", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("AI_DISABLED"));
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Сгенерировать",
      }),
    );
    expect(
      await screen.findByText(/AI для рабочего пространства/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "настройки AI" })).toHaveAttribute(
      "href",
      "/settings/ai-usage",
    );
  });

  const previewRun = (
    sourceDiagnostics?: unknown[],
    publicationOverrides: Record<string, unknown> = {},
  ) => ({
    id: "run-diagnostics",
    version: 1,
    status: "COMPLETED",
    settingsVersion: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...(sourceDiagnostics === undefined ? {} : { sourceDiagnostics }),
    publications: [
      {
        topic: "A useful topic",
        title: "Title",
        text: "Post text",
        imageUrl: "https://media.example/preview.jpg",
        imageSourceId: null,
        savedPostId: null,
        status: "PENDING",
        rejectionReason: null,
        format: "standard",
        category: "general",
        costs: {},
        operations: [],
        ideaSources: [
          { id: "source-1", type: "website", value: "example.test" },
        ],
        ...publicationOverrides,
      },
    ],
    failures: [],
    feedback: [],
  });

  it("restores a running card and loading alert on mount, then refreshes through completion", async () => {
    vi.useFakeTimers();
    try {
      const run = { ...previewRun(), requestedCount: 2, status: "RUNNING", publications: [] };
      const progress = {
        count: 2, current: 3, total: 17, complete: 0, failed: false,
        publicationIndex: 0, stage: "text", stages: { "0:text": "RUNNING" },
      };
      let ticks = 0;
      vi.mocked(api.get).mockImplementation(async (url) => {
        if (!String(url).endsWith("/progress")) {
          const publications = ticks === 2
            ? [{ ...previewRun().publications[0], publicationIndex: 1, text: "Preview completed during the run" }]
            : [];
          return { data: [ticks >= 3 ? previewRun() : { ...run, progress, publications }] };
        }
        ticks++;
        return {
          data: ticks >= 3 ? { status: "COMPLETED" } : {
            status: "RUNNING",
            preparedCount: ticks === 1 ? 0 : 1,
            progress: ticks === 1 ? progress : {
              ...progress, current: 4, complete: 1, processed: 1, publicationIndex: 0, stage: "image",
              stages: { "0:text": "COMPLETED", "0:image": "RUNNING", "1:image": "COMPLETED" },
            },
          },
        };
      });
      renderWithProviders(<AiPostingTestConsole channelId="channel-1" channelTitle="Channel" settingsReady />);
      await act(() => vi.advanceTimersByTimeAsync(50));
      expect(screen.getByText("В процессе")).toBeInTheDocument();
      expect(screen.getByText("Пишу текст")).toBeInTheDocument();
      expect(screen.getByText(/Публикация 1 из 2 · Пишу текст/)).toBeInTheDocument();
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
      fireEvent.click(screen.getByRole("button", { name: "Показать этапы" }));

      await act(() => vi.advanceTimersByTimeAsync(5_100));
      expect(screen.getByText("Медиа: в процессе")).toBeInTheDocument();
      expect(screen.getByText(/Публикация 1 из 2 · Подбираю медиа/)).toBeInTheDocument();
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
      expect(screen.getByText("Preview completed during the run")).toBeInTheDocument();

      await act(() => vi.advanceTimersByTimeAsync(5_100));
      await act(() => vi.advanceTimersByTimeAsync(50));
      expect(screen.getByText("Completed")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Редактировать текст публикации" })).toHaveValue("Post text");
      expect(screen.queryByText(/Публикация 1 из 2 · Подбираю медиа/)).not.toBeInTheDocument();
      await act(() => vi.advanceTimersByTimeAsync(15_000));
      expect(ticks).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("loads results without reloading when the accepted run is initially absent from history", async () => {
    vi.useFakeTimers();
    try {
      let progressReads = 0;
      vi.mocked(api.post).mockResolvedValue({ data: { runId: "run-diagnostics" } });
      vi.mocked(api.get).mockImplementation(async (url) => {
        if (!url.endsWith("/progress")) {
          return { data: progressReads >= 2 ? [previewRun()] : [] };
        }
        progressReads++;
        expect(url).toContain("/run-diagnostics/progress");
        return { data: { status: progressReads >= 2 ? "COMPLETED" : "RUNNING" } };
      });
      renderWithProviders(<AiPostingTestConsole channelId="channel-1" channelTitle="Channel" settingsReady />);
      await act(() => vi.advanceTimersByTimeAsync(50));
      fireEvent.click(screen.getByRole("button", { name: "Сгенерировать" }));
      await act(() => vi.advanceTimersByTimeAsync(50));
      expect(screen.getByText("В процессе")).toBeInTheDocument();
      expect(progressReads).toBe(1);
      await act(() => vi.advanceTimersByTimeAsync(5_100));
      expect(screen.getByText("Completed")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Редактировать текст публикации" })).toHaveValue("Post text");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps 50 percent for two settled slots after remount and ignores an older progress response", async () => {
    const run = {
      ...previewRun(), status: "RUNNING", requestedCount: 4, publications: [],
      updatedAt: "2026-11-23T18:30:10.000Z",
      progress: { count: 4, current: 7, total: 33, complete: 2, processed: 2,
        failed: false, publicationIndex: 2, stage: "text", stages: {} },
    };
    vi.mocked(api.get).mockImplementation(async (url) => ({
      data: url.endsWith("/progress")
        ? { status: "RUNNING", updatedAt: "2026-11-23T18:30:00.000Z", progress: {
          ...run.progress, current: 3, complete: 0, processed: 0, publicationIndex: 0,
        } }
        : [run],
    }));
    const render = () => renderWithProviders(
      <AiPostingTestConsole channelId="channel-1" channelTitle="Channel" settingsReady />,
    );
    const first = render();
    expect(await screen.findByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    first.unmount();
    render();
    expect(await screen.findByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("50% · готово 2 из 4")).toBeInTheDocument();
    expect(screen.getByText("2/4")).toBeInTheDocument();
  });

  it("does not show source diagnostics in the generation history", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        previewRun([
          {
            sourceId: "source-1",
            sourceType: "website",
            displayValue: "example.test",
            status: "COLLECTED",
          },
        ]),
      ],
    });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );

    await screen.findByRole("button", { name: "Очистить" });
    expect(screen.queryByText(/Источники: 1 доступны/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Материал собран/)).not.toBeInTheDocument();
  });

  it("warns when generation continued with partially unavailable sources", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        previewRun([
          {
            sourceId: "source-1",
            sourceType: "rss",
            displayValue: "feed.example",
            status: "UNAVAILABLE",
            reason: "SOURCE_FETCH_FAILED",
          },
        ]),
      ],
    });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );

    await screen.findByRole("button", { name: "Очистить" });
    expect(screen.queryByText(/Источники: 0 доступны/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Недоступен/)).not.toBeInTheDocument();
  });

  it("does not show Telegram source diagnostics in the generation history", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        previewRun([
          {
            sourceId: "telegram-1",
            sourceType: "telegram",
            displayValue: "Telegram source",
            status: "INELIGIBLE",
            reason: "SOURCE_NOT_ELIGIBLE",
          },
        ]),
      ],
    });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );

    await screen.findByRole("button", { name: "Очистить" });
    expect(
      screen.queryByText(/Отклонён проверкой доступа/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("SOURCE_NOT_ELIGIBLE")).not.toBeInTheDocument();
  });

  it("renders historical runs without collection diagnostics compatibly", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [previewRun(undefined, { imageUrl: null })] });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );

    expect(await screen.findByText("Идея: A useful topic")).toBeInTheDocument();
    expect(
      screen.getByText(/Для одобрения, сохранения черновика и отправки нужно изображение/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Одобрить" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Отправить в Telegram-бота" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Сохранить черновик" })).toBeDisabled();
  });

  it("marks all three publications ready when each has a valid persisted image", async () => {
    const base = previewRun([]);
    const run = {
      ...base,
      requestedCount: 3,
      publications: Array.from({ length: 3 }, (_, index) => ({
        ...base.publications[0],
        topic: `Topic ${index + 1}`,
        imageUrl: `https://media.example/${index + 1}.jpg`,
        mediaReadiness: "READY" as const,
      })),
    };
    vi.mocked(api.get).mockResolvedValue({ data: [run] });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );

    expect(
      await screen.findByText("Публикация 1 из 3"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Рубрика:/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Следующая публикация" }),
    );
    expect(await screen.findByText("Публикация 2 из 3")).toBeInTheDocument();
    expect(screen.getByText(/Рубрика:/)).toBeInTheDocument();
  });

  it("identifies the incomplete publication in a partial three-image preview", async () => {
    const base = previewRun([]);
    const run = {
      ...base,
      requestedCount: 3,
      publications: Array.from({ length: 3 }, (_, index) => ({
        ...base.publications[0],
        topic: `Topic ${index + 1}`,
        imageUrl: index < 2 ? `https://media.example/${index + 1}.jpg` : null,
        mediaReadiness: index < 2 ? ("READY" as const) : ("MISSING" as const),
      })),
    };
    vi.mocked(api.get).mockResolvedValue({ data: [run] });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );

    expect(
      await screen.findByText("Публикация 1 из 3"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Рубрика:/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Следующая публикация" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Следующая публикация" }),
    );
    expect(await screen.findByText("Публикация 3 из 3")).toBeInTheDocument();
    expect(
      screen.getByText(/Для одобрения, сохранения черновика и отправки нужно изображение/),
    ).toBeInTheDocument();
  });

  it.each([
    ["openai-image-generation", "создано с помощью AI"],
    ["openverse", "найденное изображение"],
    [null, "неизвестен"],
  ])("shows media provenance %s without guessing", async (sourceId, label) => {
    const run: TestRun = { ...previewRun(), sourceDiagnostics: undefined };
    run.publications[0].imageUrl = "https://cdn.test/image.jpg";
    run.publications[0].imageSourceId = sourceId;
    run.publications[0].mediaPreference = { id: "pref-a", name: "Visual" };
    vi.mocked(api.get).mockResolvedValue({ data: [run] });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
        categoryIcons={{ general: { type: "unicode", value: "🚀" } }}
        preferenceIcons={{ "pref-a": { type: "unicode", value: "🎨" } }}
      />,
    );
    expect(
      await screen.findByText(`Источник медиа: ${label}`),
    ).toBeInTheDocument();
    expect(screen.getByText(/Рубрика:/)).toHaveTextContent("general");
    expect(screen.getByText(/Предпочтение:/)).toHaveTextContent("Visual");
    expect(screen.getByRole("button", { name: "Одобрить" })).toHaveClass(
      "bg-blue-600",
    );
  });

  it("keeps a single publication compact and opens corrections on demand", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [previewRun()] });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );
    expect(
      await screen.findByRole("button", { name: "Отправить в Telegram-бота" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Предыдущая публикация" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Правка текста" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Написать правки" }));
    expect(
      screen.getByRole("textbox", { name: "Правка текста" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Надиктовать правки" }),
    ).toHaveLength(3);
  });

  it("retries failed media on the existing publication instead of creating another run", async () => {
    const run: TestRun = { ...previewRun(), sourceDiagnostics: undefined };
    run.failures = [
      { topic: run.publications[0].topic, code: "AI_REQUEST_BUDGET_EXCEEDED" },
    ];
    run.publications[0].mediaReadiness = "FAILED";
    run.publications[0].mediaFailureCode = "AI_REQUEST_BUDGET_EXCEEDED";
    vi.mocked(api.get).mockResolvedValue({ data: [run] });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );
    expect(
      await screen.findByText(/расчётный максимум запроса/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Повторить генерацию (новый запуск)",
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Повторить создание медиа" }),
    );
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/telegram-channels/channel-1/ai-posting/test-runs/run-diagnostics/review",
        expect.objectContaining({ index: 0, action: "regenerate-image" }),
      ),
    );
    expect(streamProgressAction).not.toHaveBeenCalled();
  });

  it("shows a safe failed-image state and keeps explicit image regeneration available", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        {
          ...previewRun([]),
          publications: [
            {
              ...previewRun([]).publications[0],
              mediaReadiness: "FAILED",
              mediaFailureCode: "AI_POSTING_IMAGE_STORAGE_FAILED",
            },
          ],
        },
      ],
    });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Повторить создание медиа" }),
    );
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/telegram-channels/channel-1/ai-posting/test-runs/run-diagnostics/review",
        expect.objectContaining({ index: 0, action: "regenerate-image" }),
      ),
    );
    expect(screen.getByText(/Не удалось сохранить медиа/)).toBeInTheDocument();
    expect(
      screen.queryByText("AI_POSTING_IMAGE_STORAGE_FAILED"),
    ).not.toBeInTheDocument();
  });

  it("keeps draft saving disabled until a pending preview is approved", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [previewRun()] });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Сохранить черновик" }),
    ).toBeDisabled();
  });

  it("requires local text edits to be saved before approval or draft saving", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [previewRun()] });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );
    const approve = await screen.findByRole("button", { name: /Одобрить/ });
    const saveText = screen.getByRole("button", { name: /Сохранить текст/ });
    const saveDraft = screen.getByRole("button", {
      name: /Сохранить черновик/,
    });

    fireEvent.change(screen.getByLabelText("Редактировать текст публикации"), {
      target: { value: "Edited locally" },
    });

    expect(approve).toBeDisabled();
    expect(saveDraft).toBeDisabled();
    expect(saveText).toBeEnabled();
    fireEvent.click(saveText);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/telegram-channels/channel-1/ai-posting/test-runs/run-diagnostics/review",
        expect.objectContaining({
          action: "edit",
          value: "Edited locally",
          expectedVersion: 1,
        }),
      ),
    );
  });

  it("editing an approved preview disables saving until the edit is persisted and reapproved", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [previewRun(undefined, { status: "APPROVED" })],
    });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );
    const saveDraft = await screen.findByRole("button", {
      name: /Сохранить черновик/,
    });
    expect(saveDraft).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Редактировать текст публикации"), {
      target: { value: "Changed after approval" },
    });

    expect(saveDraft).toBeDisabled();
    expect(screen.getByRole("button", { name: /Одобрить/ })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Сохранить текст/ }),
    ).toBeEnabled();
  });

  it("does not offer approval or saving for a rejected preview", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [previewRun(undefined, { status: "REJECTED" })],
    });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );

    expect(
      await screen.findByRole("button", { name: /Одобрить/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Сохранить черновик/ }),
    ).toBeDisabled();
  });

  it("approves the persisted text and saves without sending a local text override", async () => {
    let status = "PENDING";
    let version = 1;
    let savedPostId: string | null = null;
    vi.mocked(api.get).mockImplementation(async () => {
      const run = previewRun(undefined, { status, savedPostId });
      return { data: [{ ...run, version }] };
    });
    vi.mocked(api.post).mockImplementation(async (_url, body) => {
      const request = body as { action?: string };
      if (request.action === "approve") {
        status = "APPROVED";
        version += 1;
      }
      if (request.action === "save") {
        status = "SAVED_DRAFT";
        savedPostId = "managed-post-1";
        version += 2;
      }
      return { data: {} } as never;
    });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Одобрить/ }));
    await waitFor(() => expect(status).toBe("APPROVED"));
    const saveDraft = await screen.findByRole("button", {
      name: /Сохранить черновик/,
    });
    await waitFor(() => expect(saveDraft).toBeEnabled());
    fireEvent.click(saveDraft);
    await waitFor(() => expect(status).toBe("SAVED_DRAFT"));
    expect(api.post).toHaveBeenLastCalledWith(
      "/telegram-channels/channel-1/ai-posting/test-runs/run-diagnostics/review",
      { index: 0, expectedVersion: 2, action: "save" },
    );
    expect(
      await screen.findByRole("button", { name: /Сохранить черновик/ }),
    ).toBeDisabled();
  });

  it("keeps saved previews read-only", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        previewRun(undefined, { status: "SAVED_DRAFT", savedPostId: "post-1" }),
      ],
    });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );

    expect(
      screen.queryByLabelText("Редактировать текст публикации"),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Одобрить/ }),
    ).toBeDisabled();
    expect(
      await screen.findByRole("button", { name: /Сохранить черновик/ }),
    ).toBeDisabled();
  });

  it("refreshes authoritative run data after a stale-version conflict", async () => {
    let version = 1;
    vi.mocked(api.get).mockImplementation(async () => {
      const run = previewRun();
      return { data: [{ ...run, version, publications: run.publications.map((post) => ({ ...post, topic: `Topic version ${version}` })) }] };
    });
    vi.mocked(api.post).mockImplementation(async () => {
      version = 2;
      throw new Error("AI_POSTING_TEST_RUN_CHANGED");
    });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Одобрить/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Действие не завершилось. Откройте запуск ниже",
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Идея: Topic version 2")).toBeInTheDocument();
  });

  it("offers full regeneration for a failed publication topic", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        {
          ...previewRun(),
          status: "FAILED",
          failures: [
            {
              topic: "A channel specific topic",
              code: "AI_POSTING_REVIEW_REJECTED",
              reasons: ["The review rejected the first draft."],
            },
          ],
        },
      ],
    });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-retry"
        channelTitle="Channel"
        settingsReady
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Следующая публикация" }));

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Повторить генерацию (новый запуск)",
      }),
    );

    await waitFor(() =>
      expect(streamProgressAction).toHaveBeenCalledWith(
        "/telegram-channels/channel-retry/ai-posting/test-runs/run-diagnostics/regenerate-failure/stream",
        { failureIndex: 0, expectedVersion: 1 },
        expect.any(Function),
      ),
    );
  });
  it("shows all four positions in a legacy partial run, including media and text failures", async () => {
    const base = previewRun();
    const draft = base.publications[0];
    vi.mocked(api.get).mockResolvedValue({ data: [{
      ...base,
      requestedCount: 4,
      status: "PARTIAL",
      publications: [
        { ...draft, topic: "Text 1", mediaReadiness: "FAILED", imageUrl: null, mediaFailureCode: "AI_POSTING_IMAGE_STORAGE_UPLOAD_FAILED_TOO_BUSY" },
        { ...draft, topic: "Text 2", mediaReadiness: "FAILED", imageUrl: null, mediaFailureCode: "AI_POSTING_IMAGE_PROVIDER_FAILED" },
        { ...draft, topic: "Text 3", mediaReadiness: "READY", imageUrl: "https://media.example/third.jpg" },
      ],
      failures: [
        { topic: "Text 1", code: "AI_POSTING_IMAGE_STORAGE_UPLOAD_FAILED_TOO_BUSY" },
        { topic: "Text 2", code: "AI_POSTING_IMAGE_PROVIDER_FAILED" },
        { topic: "Text 4", code: "AI_POSTING_REVIEW_REJECTED", reasons: ["Editorial review failed"] },
      ],
    }] });
    renderWithProviders(<AiPostingTestConsole channelId="channel-1" channelTitle="Channel" settingsReady />);
    expect(await screen.findByText("Partial")).toHaveClass("text-rose-300");
    expect(await screen.findByText("Публикация 1 из 4")).toBeInTheDocument();
    expect(screen.getByText(/Хранилище было перегружено/)).toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Следующая публикация" });
    fireEvent.click(next);
    fireEvent.click(next);
    expect(screen.getByText("Идея: Text 3")).toBeInTheDocument();
    fireEvent.click(next);
    expect(screen.getByText("Не создана публикация «Text 4»")).toBeInTheDocument();
    expect(screen.getByText("Editorial review failed")).toBeInTheDocument();
  });

  it("allows retry when a run failed before a topic was selected", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        {
          ...previewRun(),
          status: "FAILED",
          publications: [],
          failures: [{ code: "AI_POSTING_GENERATION_FAILED" }],
        },
      ],
    });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-retry"
        channelTitle="Channel"
        settingsReady
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Повторить генерацию (новый запуск)",
      }),
    );
    await waitFor(() =>
      expect(streamProgressAction).toHaveBeenCalledWith(
        "/telegram-channels/channel-retry/ai-posting/test-runs/run-diagnostics/regenerate-failure/stream",
        { failureIndex: 0, expectedVersion: 1 },
        expect.any(Function),
      ),
    );
  });
});
