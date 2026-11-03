import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LeadHistoryJob,
  LeadPipelineProgress,
} from "@telegram-system/shared";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import { LeadSourceCard } from "./lead-source-card";
import { sourceFixture } from "./lead-fixtures.test-support";

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ setProgress: vi.fn(), pushToast: vi.fn() }),
}));

const job = (status: LeadHistoryJob["status"]): LeadHistoryJob => ({
  sourceId: "source-1",
  status,
  phase: "HISTORY_COLLECTION_ONLY",
  cutoffAt: "2026-08-01T00:00:00.000Z",
  pages: 2,
  received: 100,
  coverage: "UNPROVEN",
  startedAt: "2026-11-01T00:00:00.000Z",
  completedAt: null,
  lastErrorCode: null,
});
const progress = (
  collection: LeadHistoryJob | null,
  overrides: Partial<LeadPipelineProgress> = {},
): LeadPipelineProgress => ({
  collection,
  analysisEnabled: true,
  reconciliationPending: false,
  admittedAiOperations: 0,
  analysis: {
    waiting: 0,
    running: 0,
    completed: 0,
    needsMetadata: 0,
    needsMediaAnalysis: 0,
    failed: 0,
    unknown: 0,
    other: 0,
  },
  ...overrides,
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <table><tbody><LeadSourceCard source={sourceFixture()} canManage enabled /></tbody></table>
    </QueryClientProvider>,
  );
  return client;
}
function open() {
  fireEvent.click(screen.getByRole("button", { name: "История за 90 дней" }));
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(leadDiscoveryApi, "pipelineProgress").mockResolvedValue(
    progress(null),
  );
  vi.spyOn(leadDiscoveryApi, "historyAction").mockResolvedValue(job("RUNNING"));
});
describe("source pipeline controls", () => {
  it("starts collection and analysis without per-post requests", async () => {
    const analyze = vi.spyOn(leadDiscoveryApi, "analyze");
    mount();
    expect(leadDiscoveryApi.pipelineProgress).not.toHaveBeenCalled();
    open();
    expect(
      await screen.findByText("Сбор ещё не запускался"),
    ).toBeInTheDocument();
    vi.mocked(leadDiscoveryApi.pipelineProgress).mockResolvedValue(
      progress(job("RUNNING")),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Проанализировать 90 дней" }),
    );
    expect(await screen.findByText("Собираем историю")).toBeInTheDocument();
    expect(leadDiscoveryApi.historyAction).toHaveBeenCalledWith(
      "source-1",
      "start",
    );
    expect(analyze).not.toHaveBeenCalled();
  });
  it("shows completed collection and running analysis and can pause then resume", async () => {
    const running = progress(job("COMPLETED"), {
      analysis: {
        waiting: 4,
        running: 1,
        completed: 3,
        needsMetadata: 0,
        needsMediaAnalysis: 0,
        failed: 0,
        unknown: 0,
        other: 0,
      },
    });
    vi.mocked(leadDiscoveryApi.pipelineProgress).mockResolvedValue(running);
    mount();
    open();
    expect(await screen.findByText("Сбор завершён")).toBeInTheDocument();
    expect(screen.getByText("Анализ продолжается")).toBeInTheDocument();
    expect(
      screen.queryByText("Анализ завершён, кандидаты готовы"),
    ).not.toBeInTheDocument();
    vi.mocked(leadDiscoveryApi.pipelineProgress).mockResolvedValue({
      ...running,
      analysisEnabled: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Пауза" }));
    expect(await screen.findByText("Анализ на паузе")).toBeInTheDocument();
    vi.mocked(leadDiscoveryApi.pipelineProgress).mockResolvedValue(running);
    fireEvent.click(
      screen.getByRole("button", { name: "Продолжить обработку" }),
    );
    await waitFor(() =>
      expect(leadDiscoveryApi.historyAction).toHaveBeenLastCalledWith(
        "source-1",
        "resume",
      ),
    );
  });
  it("separates review states from successful completion", async () => {
    vi.mocked(leadDiscoveryApi.pipelineProgress).mockResolvedValue(
      progress(job("COMPLETED"), {
        analysis: {
          waiting: 0,
          running: 0,
          completed: 6,
          needsMetadata: 2,
          needsMediaAnalysis: 0,
          failed: 1,
          unknown: 3,
          other: 0,
        },
      }),
    );
    mount();
    open();
    expect(
      await screen.findByText("Есть публикации, требующие внимания"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Нужны метаданные: 2 · нужен анализ медиа: 0 · ошибки: 1 · неизвестный результат: 3/,
      ),
    ).toBeInTheDocument();
  });
  it("shows unprocessed media as needing attention", async () => {
    vi.mocked(leadDiscoveryApi.pipelineProgress).mockResolvedValue(
      progress(job("COMPLETED"), {
        analysis: {
          waiting: 0,
          running: 0,
          completed: 0,
          needsMetadata: 0,
          needsMediaAnalysis: 2,
          failed: 0,
          unknown: 0,
          other: 0,
        },
      }),
    );
    mount();
    open();
    expect(
      await screen.findByText("Есть публикации, требующие внимания"),
    ).toBeInTheDocument();
    expect(screen.getByText(/нужен анализ медиа: 2/)).toBeInTheDocument();
  });
  it("shows admitted operations while paused", async () => {
    vi.mocked(leadDiscoveryApi.pipelineProgress).mockResolvedValue(
      progress(job("COMPLETED"), {
        analysisEnabled: false,
        admittedAiOperations: 1,
      }),
    );
    mount();
    open();
    expect(
      await screen.findByText("Допущенные AI-операции: 1"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Уже допущенный AI-запрос/)).toBeInTheDocument();
    expect(
      screen.queryByText("Анализ завершён, кандидаты готовы"),
    ).not.toBeInTheDocument();
  });
  it("declares completion only when collection and analysis are finished", async () => {
    vi.mocked(leadDiscoveryApi.pipelineProgress).mockResolvedValue(
      progress(job("COMPLETED")),
    );
    mount();
    open();
    expect(
      await screen.findByText("Анализ завершён, кандидаты готовы"),
    ).toBeInTheDocument();
  });
  it("shows a recoverable error", async () => {
    vi.mocked(leadDiscoveryApi.pipelineProgress).mockRejectedValueOnce(
      new Error("private"),
    );
    mount();
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не удалось загрузить",
    );
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(
      await screen.findByText("Сбор ещё не запускался"),
    ).toBeInTheDocument();
  });
  it("refreshes source, feed and candidate caches", async () => {
    vi.mocked(leadDiscoveryApi.pipelineProgress).mockResolvedValue(
      progress(job("RUNNING")),
    );
    const client = mount();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    open();
    fireEvent.click(
      await screen.findByRole("button", { name: "Обновить состояние" }),
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(3));
  });
});
