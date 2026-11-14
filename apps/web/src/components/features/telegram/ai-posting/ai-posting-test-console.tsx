"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { api, streamProgressAction } from "@/lib/api";
import {
  aiPostingTestRunKeys,
  failureMessage,
  generationStageLabel,
  resolveTestConsoleError,
  type Publication,
  type TestRun,
} from "./ai-posting-test-console-model";
import { AiPostingTestRunCard } from "./ai-posting-test-run-card";
import { AiPostingGenerationControls } from "./ai-posting-generation-controls";
import { AiPostingTestConsoleError } from "./ai-posting-test-console-error";
import {
  telegramContentHypothesisKeys,
  telegramPostKeys,
} from "@/lib/query-keys";
import { Button, ConfirmDeleteModal } from "@/components/ui/primitives";
import type {
  ResolvedEmoji,
  TelegramCustomEmojiPackSummary,
} from "@telegram-system/shared";
import { useOperationFeedback } from "@/providers/toast-provider";

export function AiPostingTestConsole({
  channelId,
  channelTitle,
  customEmojiPacks,
  categoryIcons,
  preferenceIcons,
  dailyPostCount = 3,
  settingsReady,
  onRememberImageRule,
}: {
  channelId: string;
  channelTitle: string;
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
  const [progress, setGenerationProgress] = useState<{
    count: number;
    stages: Record<string, string>;
    complete: number;
    failed: boolean;
  } | null>(null);
  const mediaOperation = useRef<ReturnType<typeof startOperation> | null>(null);
  const completedPublications = useRef(new Set<number>());
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
  const runs = useQuery({
    queryKey: aiPostingTestRunKeys(channelId).runs,
    queryFn: async () =>
      (await api.get(`/telegram-channels/${channelId}/ai-posting/test-runs`))
        .data as TestRun[],
  });
  const generate = useMutation({
    mutationFn: async (count: number) =>
      streamProgressAction<
        TestRun,
        {
          stage: string;
          status: string;
          publicationIndex?: number;
          attempt?: number;
        }
      >(
        `/telegram-channels/${channelId}/ai-posting/generate/stream`,
        {
          count,
        },
        (item) => {
          const label =
            generationStageLabel[item.stage] ?? "Обрабатываю публикацию";
          const post =
            item.publicationIndex === undefined
              ? ""
              : ` · публикация ${item.publicationIndex + 1}/${count}`;
          const attempt = item.attempt ? ` · попытка ${item.attempt}` : "";
          const state =
            item.status === "COMPLETED"
              ? " · готово"
              : item.status === "FAILED"
                ? " · ошибка"
                : "";
          if (
            item.stage === "image" &&
            item.status === "COMPLETED" &&
            item.publicationIndex !== undefined
          )
            completedPublications.current.add(item.publicationIndex);
          setGenerationProgress((previous) => {
            if (!previous) return previous;
            const key = `${item.publicationIndex ?? 0}:${item.stage}`;
            return {
              ...previous,
              stages: { ...previous.stages, [key]: item.status },
              complete:
                item.stage === "image" && item.status === "COMPLETED"
                  ? completedPublications.current.size
                  : previous.complete,
              failed: previous.failed || item.status === "FAILED",
            };
          });
          generationOperation.current?.update({
            message: `${label}${post}${attempt}${state}`,
            current: completedPublications.current.size,
            total: count,
          });
        },
      ),
    onSuccess: async (result, count) => {
      const created = result.generated?.length ?? 0;
      const failed = result.failures?.length ?? 0;
      const ready =
        result.generated?.filter((post) => post.mediaReadiness === "READY")
          .length ?? 0;
      setGenerationProgress((previous) =>
        previous
          ? {
              ...previous,
              complete: ready,
              failed: failed > 0,
            }
          : previous,
      );
      const finish = failed
        ? generationOperation.current?.fail
        : generationOperation.current?.succeed;
      finish?.({
        title: failed
          ? "Генерация завершена с ошибками"
          : "Генерация завершена",
        message: failed
          ? `Подготовлено ${created} из ${count}, ошибок: ${failed}.`
          : `Подготовлено публикаций: ${created}.`,
      });
      generationOperation.current = null;
      setHistoryExpanded(false);
      await client.invalidateQueries({
        queryKey: aiPostingTestRunKeys(channelId).runs,
      });
    },
    onError: async (cause) => {
      setGenerationProgress((previous) =>
        previous ? { ...previous, failed: true } : previous,
      );
      generationOperation.current?.fail({
        title: "Не удалось сгенерировать публикации",
        message:
          cause instanceof Error && cause.message
            ? (failureMessage[cause.message] ?? cause.message)
            : "Проверьте детали запуска и повторите попытку.",
      });
      generationOperation.current = null;
      await client.invalidateQueries({
        queryKey: aiPostingTestRunKeys(channelId).runs,
      });
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
      setGenerationProgress({
        count: 1,
        stages: {},
        complete: 0,
        failed: false,
      });
      generationOperation.current = startOperation({
        id: `ai-posting-retry:${channelId}:${run.id}:${failureIndex}:${Date.now()}`,
        title: "Перегенерация публикации",
        message: "Подготавливаю публикацию…",
      });
      return streamProgressAction<
        TestRun,
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
                : "";
          setGenerationProgress((previous) =>
            previous
              ? {
                  ...previous,
                  stages: {
                    ...previous.stages,
                    [`${item.publicationIndex ?? 0}:${item.stage}`]:
                      item.status,
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
      const failed = (result.failures?.length ?? 0) > 0;
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
          ? "Проверьте ошибку в новом варианте."
          : "Новый вариант появился в истории генераций.",
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
    completedPublications.current.clear();
    setGenerationProgress({ count, stages: {}, complete: 0, failed: false });
    generationOperation.current = startOperation({
      id: `ai-posting-generate:${channelId}:${Date.now()}`,
      title: "Генерация AI Posting",
      message: `Подбираю темы для ${count} публикаций…`,
    });
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
    onSuccess: async (_data, variables) => {
      if (variables.action === "regenerate-image") {
        mediaOperation.current?.update({ current: 1, total: 1 });
        mediaOperation.current?.succeed({
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
        await Promise.all([
          client.invalidateQueries({
            queryKey: ["telegram-ai-posting-hypotheses", channelId],
          }),
          client.invalidateQueries({
            queryKey: ["telegram-ai-posting-post-groups", channelId],
          }),
          client.invalidateQueries({
            queryKey: telegramContentHypothesisKeys.list(channelId),
          }),
          client.invalidateQueries({
            queryKey: telegramContentHypothesisKeys.postOptions(channelId),
          }),
          client.invalidateQueries({
            queryKey: telegramPostKeys.postGroups(channelId),
          }),
          client.invalidateQueries({
            queryKey: telegramPostKeys.managedLists(channelId),
          }),
        ]);
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
  const previousRunCount = Math.max(0, (runs.data?.length ?? 0) - 1);
  const displayedRuns = historyExpanded
    ? (runs.data ?? [])
    : (runs.data ?? []).slice(0, 1);
  return (
    <div className="space-y-4" aria-labelledby="ai-posting-test-title">
      <AiPostingGenerationControls
        dailyPostCount={dailyPostCount}
        requestedCount={requestedCount}
        pending={generate.isPending}
        busy={
          regenerateFailure.isPending ||
          (act.isPending && act.variables?.action === "regenerate-image")
        }
        settingsReady={settingsReady}
        onCountChange={setRequestedCount}
        onGenerate={startGeneration}
      />
      {progress && (
        <div
          role="status"
          className="rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-sm"
        >
          <strong>
            Публикации: {progress.complete} из {progress.count}
            {progress.failed ? " · есть ошибки" : ""}
          </strong>
          {Array.from({ length: progress.count }, (_, index) => (
            <div key={index} className="mt-2 text-neutral-300">
              <span>Публикация {index + 1}: </span>
              {(["planning", "text", "review", "image"] as const).map(
                (stage) => {
                  const status = progress.stages[`${index}:${stage}`];
                  const label = {
                    planning: "Тема",
                    text: "Текст",
                    review: "Проверка",
                    image: "Медиа",
                  }[stage];
                  return (
                    <span key={stage} className="mr-2">
                      {label}:{" "}
                      {status === "COMPLETED"
                        ? "готово"
                        : status === "FAILED"
                          ? "ошибка"
                          : status === "RUNNING"
                            ? "в процессе"
                            : "ожидает"}
                    </span>
                  );
                },
              )}
            </div>
          ))}
        </div>
      )}
      <AiPostingTestConsoleError code={errorCode} status={errorStatus} />
      {!generate.isPending &&
        (runs.data ?? []).some((run) => run.status === "RUNNING") && (
          <p role="status" className="text-sm text-amber-200">
            В истории есть незавершённый запуск. Завершённые этапы и причины
            ошибок сохранены ниже; повторная генерация создаст новый запуск.
          </p>
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
      {(runs.data ?? []).length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <h3 className="text-sm font-semibold text-neutral-200">
            {historyExpanded ? "История генераций" : "Последняя генерация"}
          </h3>
          <div className="flex flex-wrap gap-2">
            {previousRunCount > 0 && (
              <Button
                variant="secondary"
                aria-expanded={historyExpanded}
                onClick={() => setHistoryExpanded((expanded) => !expanded)}
              >
                {historyExpanded
                  ? "Свернуть прошлые варианты"
                  : `Показать прошлые варианты · ${previousRunCount}`}
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
              <Trash2 size={15} /> Очистить прошлые варианты
            </Button>
          </div>
        </div>
      )}
      {displayedRuns.map((run) => (
        <AiPostingTestRunCard
          key={run.id}
          run={run}
          channelTitle={channelTitle}
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
      {!runs.isLoading && !runs.isError && !runs.data?.length && (
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
        description="Удалятся записи прошлых тестовых запусков и их превью. Сохранённые черновики и публикации не затрагиваются; текущий запуск останется, а зависшие запуски старше 30 минут будут удалены."
      />
    </div>
  );
}
