import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, streamProgressAction } from "@/lib/api";
import { renderWithProviders } from "@/test/render-with-providers";
import { AiPostingTestConsole } from "./ai-posting-test-console";

vi.mock("@/lib/api", () => ({
  API_MUTATION_EVENT: "test:api-mutation",
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  streamProgressAction: vi.fn(),
}));
vi.mock(
  "@/components/features/telegram/telegram/telegram-post-preview",
  () => ({
    TelegramPostPreview: ({
      text,
      onTextChange,
    }: {
      text: string;
      onTextChange?: (value: string) => void;
    }) =>
      onTextChange ? (
        <textarea
          aria-label="Редактировать текст публикации"
          value={text}
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
        name: "Сгенерировать на день",
      }),
    );

    await waitFor(() =>
      expect(streamProgressAction).toHaveBeenCalledWith(
        "/telegram-channels/channel-1/ai-posting/generate/stream",
        { count: 3 },
        expect.any(Function),
      ),
    );
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
      screen.getByRole("button", { name: "Сгенерировать · 2 публикации" }),
    );
    await waitFor(() =>
      expect(streamProgressAction).toHaveBeenCalledWith(
        "/telegram-channels/channel-1/ai-posting/generate/stream",
        { count: 2 },
        expect.any(Function),
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
      screen.getByRole("button", { name: "Сгенерировать · 1 публикацию" }),
    );
    await waitFor(() =>
      expect(streamProgressAction).toHaveBeenCalledWith(
        "/telegram-channels/channel-count-memory/ai-posting/generate/stream",
        { count: 1 },
        expect.any(Function),
      ),
    );
  });

  it("shows the live generation alert with stage and publication number", async () => {
    let finish: ((value: { status: string }) => void) | undefined;
    vi.mocked(streamProgressAction).mockImplementation(
      async (_path, _payload, onProgress) => {
        onProgress(
          { stage: "text", status: "RUNNING", publicationIndex: 0 },
          1,
          3,
        );
        return new Promise((resolve) => {
          finish = resolve;
        }) as never;
      },
    );
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        dailyPostCount={4}
        settingsReady
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Сгенерировать на день",
      }),
    );
    expect(
      await screen.findByText("Пишу текст · публикация 1/4"),
    ).toBeInTheDocument();
    finish?.({ status: "COMPLETED" });
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
        settingsReady
      />,
    );

    expect(await screen.findByText("Последняя генерация")).toBeInTheDocument();
    expect(screen.getByText("Идея: A useful topic")).toBeInTheDocument();
    expect(screen.queryByText("Идея: An older topic")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Показать прошлые варианты/ }),
    );
    expect(await screen.findByText("Идея: An older topic")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Очистить прошлые варианты/ }),
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
        name: "Сгенерировать на день",
      }),
    ).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("explains disabled AI and links to configuration", async () => {
    vi.mocked(streamProgressAction).mockRejectedValue(new Error("AI_DISABLED"));
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Сгенерировать на день",
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
        imageUrl: null,
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

    await screen.findByText("Последняя генерация");
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

    await screen.findByText("Последняя генерация");
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

    await screen.findByText("Последняя генерация");
    expect(
      screen.queryByText(/Отклонён проверкой доступа/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("SOURCE_NOT_ELIGIBLE")).not.toBeInTheDocument();
  });

  it("renders historical runs without collection diagnostics compatibly", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [previewRun()] });
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );

    expect(await screen.findByText("Идея: A useful topic")).toBeInTheDocument();
    expect(screen.getByText("Медиа отсутствует")).toBeInTheDocument();
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
      await screen.findByText("Все 3 публикации готовы с медиа."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Медиа готово")).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Следующая публикация" }),
    );
    expect(await screen.findByText("Публикация 2 из 3")).toBeInTheDocument();
    expect(screen.getAllByText("Медиа готово")).toHaveLength(1);
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
      await screen.findByText("2 из 3 публикаций готовы с медиа."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Медиа готово")).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Следующая публикация" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Следующая публикация" }),
    );
    expect(await screen.findByText("Публикация 3 из 3")).toBeInTheDocument();
    expect(screen.getByText("Медиа отсутствует")).toBeInTheDocument();
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
      await screen.findByRole("button", { name: "Создать медиа" }),
    );
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/telegram-channels/channel-1/ai-posting/test-runs/run-diagnostics/review",
        expect.objectContaining({ index: 0, action: "regenerate-image" }),
      ),
    );
    expect(
      screen.getByText("Не удалось подготовить медиа"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Текст сохранён в превью/)).toBeInTheDocument();
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
      return { data: [{ ...run, version }] };
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
    expect(await screen.findByText(/запуск v2/)).toBeInTheDocument();
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

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Перегенерировать публикацию",
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
