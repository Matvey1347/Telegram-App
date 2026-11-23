"use client";

import { isTelegramAiPostingEmptyTextFailure } from "@telegram-system/shared";

import type { AiPostingWatermarkPreviewSettings } from "./ai-posting-watermark-preview";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Trash2,
} from "lucide-react";
import { api, streamProgressAction } from "@/lib/api";
import {
  aiPostingTestRunKeys,
  failureMessage,
  generationStageLabel,
  resolveTestConsoleError,
  type Publication,
  type TestRun,
} from "./ai-posting-test-console-model";
import { AiPostingRunProgress } from "./ai-posting-run-progress";
import { useRestoredAiPostingRun } from "./use-restored-ai-posting-run";
import { AiPostingTestRunCard } from "./ai-posting-test-run-card";
import { AiPostingGenerationControls } from "./ai-posting-generation-controls";
import { AiPostingTestConsoleError } from "./ai-posting-test-console-error";
import {
  telegramPostKeys,
} from "@/lib/query-keys";
import { Button, ConfirmDeleteModal } from "@/components/ui/primitives";
import type {
  ResolvedEmoji,
  TelegramCustomEmojiPackSummary,
  TelegramAiPostingRunProgress,
  TelegramAiPostingRunAccepted,
} from "@telegram-system/shared";
import { useOperationFeedback } from "@/providers/toast-provider";

export function AiPostingTestConsole({
  channelId,
  channelTitle,
  channelPhotoUrl,
  watermarkPreview,
  customEmojiPacks,
  categoryIcons,
  preferenceIcons,
  dailyPostCount = 3,
  settingsReady,
  onRememberImageRule,
}: {
  channelId: string;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  watermarkPreview?: AiPostingWatermarkPreviewSettings;
  customEmojiPacks?: TelegramCustomEmojiPackSummary[];
  categoryIcons?: Record<string, ResolvedEmoji>;
  preferenceIcons?: Record<string, ResolvedEmoji>;
  dailyPostCount?: number;
  settingsReady: boolean;
  onRememberImageRule?: (value: string) => Promise<void>;
}) {
  const client = useQueryClient();
  const { start: startOperation } = useOperationFeedback();
  const generationOperation = useRef<ReturnType<typeof startOperation> | null>(
    null,
  );
  const [progress, setGenerationProgress] = useState<TelegramAiPostingRunProgress | null>(null);
  const mediaOperation = useRef<ReturnType<typeof startOperation> | null>(null);
  const [reject, setReject] = useState<Record<string, string>>({});
  const [imageFeedback, setImageFeedback] = useState<Record<string, string>>(
    {},
  );
  const [requestedCount, setRequestedCount] = useState(() => {
    if (typeof window === "undefined") return String(dailyPostCount);
    const saved = window.localStorage.getItem(`ai-posting-count:${channelId}`);
    return saved && /^[1-5]$/.test(saved) ? saved : String(dailyPostCount);
  });
  useEffect(() => {
    window.localStorage.setItem(
      `ai-posting-count:${channelId}`,
      requestedCount,
    );
  }, [channelId, requestedCount]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false);
  const [acceptedRun, setAcceptedRun] = useState<(TestRun & { channelId: string }) | null>(null);
  const runs = useQuery({
    queryKey: aiPostingTestRunKeys(channelId).runs,
    queryFn: async () =>
      (await api.get(`/telegram-channels/${channelId}/ai-posting/test-runs`))
        .data as TestRun[],
  });
  const generate = useMutation({
    mutationFn: async (count: number) =>
      (await api.post<TelegramAiPostingRunAccepted>(
        `/telegram-channels/${channelId}/ai-posting/generate/background`, { count },
      )).data,
    onSuccess: async ({ runId }, count) => {
      if (runId) setAcceptedRun({
        id: runId, channelId, status: "RUNNING", canStop: true, requestedCount: count,
        settingsVersion: 0, version: 0, createdAt: new Date().toISOString(),
        publications: [], failures: [], feedback: [],
      });
      setGenerationProgress(null);
      setHistoryExpanded(false);
      await client.invalidateQueries({ queryKey: aiPostingTestRunKeys(channelId).runs });
    },
  });
  const stopRun = useMutation({
    mutationFn: (runId: string) =>
      api.post(`/telegram-channels/${channelId}/ai-posting/test-runs/${runId}/stop`),
    onSuccess: async () => {
      setGenerationProgress(null);
      await client.invalidateQueries({ queryKey: aiPostingTestRunKeys(channelId).root });
    },
  });
  const regenerateFailure = useMutation({
    mutationFn: async ({
      run,
      failureIndex,
    }: {
      run: TestRun;
      failureIndex: number;
    }) => {
      const failure = run.failures[failureIndex];
      const retryText = Boolean(failure?.topic && (failure.retryText || isTelegramAiPostingEmptyTextFailure(failure)));
      setGenerationProgress({
        count: 1,
        stages: retryText ? { "0:planning": "COMPLETED", "0:text": "RUNNING" } : { "0:planning": "RUNNING" },
        complete: 0,
        failed: false,
        current: 0,
        total: 1,
        publicationIndex: 0,
      });
      generationOperation.current = startOperation({
        id: `ai-posting-retry:${channelId}:${run.id}:${failureIndex}:${Date.now()}`,
        title: retryText ? "Пересоздание текста" : "Перегенерация публикации",
        message: retryText ? "Пишу текст по сохранённой теме…" : "Подготавливаю публикацию…",
      });
      return streamProgressAction<
        TestRun & { retryFailures?: TestRun["failures"] },
        {
          stage: string;
          status: string;
          publicationIndex?: number;
          attempt?: number;
        }
      >(
        `/telegram-channels/${channelId}/ai-posting/test-runs/${run.id}/regenerate-failure/stream`,
        { failureIndex, expectedVersion: run.version },
        (item) => {
          const label =
            generationStageLabel[item.stage] ?? "Обрабатываю публикацию";
          const attempt = item.attempt ? ` · попытка ${item.attempt}` : "";
          const state =
            item.status === "COMPLETED"
              ? " · готово"
              : item.status === "FAILED"
                ? " · ошибка"
                : item.status === "MISSING" ? " · подходящего медиа нет" : "";
          setGenerationProgress((previous) =>
            previous
              ? {
                  ...previous,
                  stage: item.stage,
                  attempt: item.attempt,
                  stages: {
                    ...previous.stages,
                    [`0:${item.stage}`]: item.status,
                  },
                  complete:
                    item.stage === "image" && item.status === "COMPLETED"
                      ? 1
                      : previous.complete,
                  failed: previous.failed || item.status === "FAILED",
                }
              : previous,
          );
          generationOperation.current?.update({
            message: `${label} · публикация 1/1${attempt}${state}`,
            current: 0,
            total: 1,
          });
        },
      );
    },
    onSuccess: async (result) => {
      const failed = (result.retryFailures ?? result.failures ?? []).length > 0;
      setGenerationProgress((previous) =>
        previous ? { ...previous, complete: failed ? 0 : 1, failed } : previous,
      );
      const finish = failed
        ? generationOperation.current?.fail
        : generationOperation.current?.succeed;
      finish?.({
        title: failed
          ? "Публикация подготовлена не полностью"
          : "Публикация перегенерирована",
        message: failed
          ? "Подробности доступны в истории запуска."
          : result.retryFailures ? "Текст обновлён в исходной публикации." : "Новый вариант появился в истории генераций.",
      });
      generationOperation.current = null;
      await client.invalidateQueries({
        queryKey: aiPostingTestRunKeys(channelId).runs,
      });
    },
    onError: async (cause) => {
      setGenerationProgress((previous) =>
        previous ? { ...previous, failed: true } : previous,
      );
      generationOperation.current?.fail({
        title: "Не удалось перегенерировать публикацию",
        message:
          cause instanceof Error && cause.message
            ? cause.message
            : "Повторите попытку.",
      });
      generationOperation.current = null;
      await client.invalidateQueries({
        queryKey: aiPostingTestRunKeys(channelId).runs,
      });
    },
  });
  const clearRuns = useMutation({
    mutationFn: async () =>
      (await api.delete(`/telegram-channels/${channelId}/ai-posting/test-runs`))
        .data as { deletedCount: number },
    onSuccess: async () => {
      setAcceptedRun(null);
      setGenerationProgress(null);
      setHistoryExpanded(false);
      await client.invalidateQueries({
        queryKey: aiPostingTestRunKeys(channelId).runs,
      });
    },
  });
  const startGeneration = () => {
    const count = Math.max(
      1,
      Math.min(5, Number(requestedCount) || dailyPostCount),
    );
    generate.mutate(count);
  };
  const act = useMutation({
    mutationFn: async ({
      run,
      index,
      action,
      value,
    }: {
      run: TestRun;
      index: number;
      action: string;
      value?: string;
    }) => {
      if (action === "regenerate-image") {
        mediaOperation.current = startOperation({
          id: `ai-posting-media:${channelId}:${run.id}:${index}:${Date.now()}`,
          title: "Подготовка медиа",
          message: "Публикация 0 из 1 · Медиа: в процессе",
          current: 0,
          total: 1,
        });
      }
      return (
        await api.post(
          `/telegram-channels/${channelId}/ai-posting/test-runs/${run.id}/review`,
          {
            index,
            expectedVersion: run.version,
            action,
            ...(value === undefined ? {} : { value }),
          },
        )
      ).data as TestRun;
    },
    onSuccess: async (data, variables) => {
      if (variables.action === "regenerate-image") {
        mediaOperation.current?.update({ current: 1, total: 1 });
        const missing = data.publications?.[variables.index]?.mediaFailureCode === "AI_POSTING_IMAGE_SEARCH_EXHAUSTED";
        mediaOperation.current?.succeed(missing ? {
          title: "Раунд поиска завершён",
          message: failureMessage.AI_POSTING_IMAGE_SEARCH_EXHAUSTED,
        } : {
          title: "Медиа готово",
          message: "Публикация 1 из 1 · Медиа добавлено к этой публикации.",
        });
        mediaOperation.current = null;
      }
      setEdits((current) => {
        const next = { ...current };
        delete next[`${variables.run.id}:${variables.index}`];
        return next;
      });
      await client.invalidateQueries({
        queryKey: aiPostingTestRunKeys(channelId).runs,
      });
      if (variables.action === "save") {
        await client.invalidateQueries({
          queryKey: telegramPostKeys.managedLists(channelId),
        });
      }
    },
    onError: async (cause, variables) => {
      if (variables.action === "regenerate-image") {
        const { code } = resolveTestConsoleError(cause);
        mediaOperation.current?.fail({
          title: "Ошибка подготовки медиа",
          message:
            failureMessage[code] ??
            "Не удалось подготовить медиа. Проверьте публикацию и повторите попытку.",
        });
        mediaOperation.current = null;
      }
      await client.invalidateQueries({
        queryKey: aiPostingTestRunKeys(channelId).runs,
      });
    },
  });
  const suggest = useMutation({
    mutationFn: async ({ run, value }: { run: TestRun; value: string }) =>
      (
        await api.post(
          `/telegram-channels/${channelId}/ai-posting/test-runs/${run.id}/suggest-rule`,
          { expectedVersion: run.version, feedback: value },
        )
      ).data,
    onSuccess: async () =>
      client.invalidateQueries({
        queryKey: aiPostingTestRunKeys(channelId).runs,
      }),
  });
  const confirm = useMutation({
    mutationFn: async ({
      run,
      suggestionId,
    }: {
      run: TestRun;
      suggestionId: string;
    }) =>
      (
        await api.post(
          `/telegram-channels/${channelId}/ai-posting/test-runs/${run.id}/confirm-rule`,
          { expectedVersion: run.version, suggestionId },
        )
      ).data,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: aiPostingTestRunKeys(channelId).runs,
        }),
        client.invalidateQueries({
          queryKey: aiPostingTestRunKeys(channelId).root,
        }),
      ]);
    },
  });
  const error =
    generate.error ||
    stopRun.error ||
    regenerateFailure.error ||
    clearRuns.error ||
    act.error ||
    suggest.error ||
    confirm.error;
  const { code: errorCode, status: errorStatus } =
    resolveTestConsoleError(error);
  const isPublicationSaved = (post: Publication) =>
    Boolean(post.savedPostId) || post.status === "SAVED_DRAFT";
  const hasUnsavedText = (run: TestRun, index: number, post: Publication) => {
    const localText = edits[`${run.id}:${index}`];
    return localText !== undefined && localText !== post.text;
  };
  const pendingRun = acceptedRun?.channelId === channelId ? acceptedRun : null;
  const historyHasAcceptedRun = runs.data?.some(({ id }) => id === pendingRun?.id);
  const runList = pendingRun && !historyHasAcceptedRun ? [pendingRun, ...(runs.data ?? [])] : (runs.data ?? []);
  const previousRunCount = Math.max(0, runList.length - 1);
  const activeRun = runList.find((run) => run.status === "RUNNING" && run.id === pendingRun?.id)
    ?? runList.find((run) => run.status === "RUNNING" && run.canStop)
    ?? runList.find((run) => run.status === "RUNNING");
  const tracking = useRestoredAiPostingRun(
    channelId,
    regenerateFailure.isPending ? undefined : activeRun,
  );
  const trackedRun = tracking?.run;
  const displayedRuns = historyExpanded
    ? runList
    : runList.filter((run, index) => index === 0 || run.id === trackedRun?.id || run.id === pendingRun?.id);
  return (
    <div className="space-y-4" aria-labelledby="ai-posting-test-title">
      <AiPostingGenerationControls
        requestedCount={requestedCount}
        pending={generate.isPending}
        busy={
          Boolean(trackedRun?.canStop && trackedRun.status === "RUNNING") ||
          regenerateFailure.isPending ||
          (act.isPending && act.variables?.action === "regenerate-image")
        }
        settingsReady={settingsReady}
        onCountChange={setRequestedCount}
        onGenerate={startGeneration}
        historyAction={runList.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {previousRunCount > 0 && (
              <Button variant="secondary" aria-expanded={historyExpanded}
                onClick={() => setHistoryExpanded((expanded) => !expanded)}>
                {historyExpanded ? "Скрыть" : `Показать · ${previousRunCount}`}
              </Button>
            )}
            <Button
              variant="danger"
              disabled={
                clearRuns.isPending ||
                generate.isPending ||
                regenerateFailure.isPending
              }
              onClick={() => setClearHistoryOpen(true)}
            >
              <Trash2 size={15} /> Очистить
            </Button>
          </div>
        ) : null}
      />
      {progress && !trackedRun && (
        <AiPostingRunProgress progress={progress} active={regenerateFailure.isPending} />
      )}
      <AiPostingTestConsoleError code={errorCode} status={errorStatus} />
      {tracking?.refreshError && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-900 bg-amber-950/20 p-3 text-sm text-amber-200">
          <p role="status">Не удалось обновить прогресс запуска.</p>
          <Button type="button" variant="secondary" onClick={() => void tracking.refresh()}>
            Обновить статус
          </Button>
        </div>
      )}
      {runs.isLoading && (
        <div className="rounded-lg border border-neutral-800 p-4 text-sm text-neutral-400">
          Загружаем историю тестов…
        </div>
      )}
      {runs.isError && (
        <div
          role="alert"
          className="rounded-lg border border-rose-900 p-4 text-sm text-rose-200"
        >
          Не удалось загрузить историю тестов.
        </div>
      )}
      {displayedRuns.map((run) => (
        <AiPostingTestRunCard
          key={run.id}
          run={run.id === trackedRun?.id ? trackedRun : run}
          onStop={run.canStop ? () => stopRun.mutate(run.id) : undefined}
          stopPending={stopRun.isPending}
          channelTitle={channelTitle}
          channelId={channelId}
          channelPhotoUrl={channelPhotoUrl}
          watermarkPreview={watermarkPreview}
          customEmojiPacks={customEmojiPacks}
          categoryIcons={categoryIcons}
          preferenceIcons={preferenceIcons}
          edits={edits}
          textFeedback={reject}
          imageFeedback={imageFeedback}
          ruleFeedback={feedback[run.id] ?? ""}
          suggestPending={suggest.isPending}
          confirmPending={confirm.isPending}
          retryPending={regenerateFailure.isPending}
          actionPending={act.isPending}
          pendingAction={
            act.variables
              ? {
                  runId: act.variables.run.id,
                  index: act.variables.index,
                  action: act.variables.action,
                }
              : undefined
          }
          isSaved={isPublicationSaved}
          hasUnsavedText={hasUnsavedText}
          onTextChange={(key, value) =>
            setEdits((current) => ({ ...current, [key]: value }))
          }
          onTextFeedbackChange={(key, value) =>
            setReject((current) => ({ ...current, [key]: value }))
          }
          onImageFeedbackChange={(key, value) =>
            setImageFeedback((current) => ({ ...current, [key]: value }))
          }
          onAction={(input) => act.mutate(input)}
          onRegenerateFailure={(run, failureIndex) =>
            regenerateFailure.mutate({ run, failureIndex })
          }
          onRememberImageRule={onRememberImageRule}
          onRuleFeedbackChange={(value) =>
            setFeedback((current) => ({ ...current, [run.id]: value }))
          }
          onSuggestRule={() =>
            suggest.mutate({ run, value: feedback[run.id] ?? "" })
          }
          onConfirmSuggestion={(suggestionId) =>
            confirm.mutate({ run, suggestionId })
          }
        />
      ))}
      {!runs.isLoading && !runs.isError && !runList.length && (
        <p className="rounded-lg border border-dashed border-neutral-700 p-6 text-center text-sm text-neutral-400">
          Тестовых запусков пока нет.
        </p>
      )}
      <ConfirmDeleteModal
        open={clearHistoryOpen}
        onClose={() => setClearHistoryOpen(false)}
        onConfirm={() => clearRuns.mutateAsync()}
        entityName="прошлые варианты генерации AI Posting"
        label="Очистить историю"
        description="Активный тестовый запуск остановится. История тестов, включая зависшие попытки, и превью будут удалены. Сохранённые черновики и публикации останутся."
      />
    </div>
  );
}
