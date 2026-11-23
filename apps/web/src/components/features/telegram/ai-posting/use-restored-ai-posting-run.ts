"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { TelegramAiPostingRunProgressRead } from "@telegram-system/shared";
import { api } from "@/lib/api";
import { useOperationFeedback } from "@/providers/toast-provider";
import { aiPostingTestRunKeys, generationStageLabel, publicationBatchProgress, type TestRun } from "./ai-posting-test-console-model";

const PROGRESS_REFRESH_MS = 5_000;

export function useRestoredAiPostingRun(channelId: string, run: TestRun | undefined) {
  const client = useQueryClient();
  const { start } = useOperationFeedback();
  const handle = useRef<ReturnType<typeof start> | null>(null);
  const runId = run?.id;
  const query = useQuery({
    queryKey: aiPostingTestRunKeys(channelId).progress(runId ?? ""),
    enabled: Boolean(runId),
    queryFn: async ({ signal }) =>
      (await api.get<TelegramAiPostingRunProgressRead>(
        `/telegram-channels/${channelId}/ai-posting/test-runs/${runId}/progress`,
        { signal },
      )).data,
    retry: false,
    refetchInterval: ({ state }) =>
      runId && state.errorUpdateCount < 6 && (state.data?.status ?? "RUNNING") === "RUNNING"
        ? PROGRESS_REFRESH_MS
        : false,
  });
  const fromQuery = query.data;
  const latest = fromQuery && (!run?.updatedAt || !fromQuery.updatedAt || fromQuery.updatedAt >= run.updatedAt)
    ? fromQuery : run;
  const status = latest?.status;
  const progress = latest?.progress;
  const activeRunId = status === "RUNNING" ? runId : undefined;
  const preparedCount = query.data?.preparedCount ?? 0;
  const visibleCount = run?.publications.length ?? 0;

  useEffect(() => {
    if (!runId || (status === "RUNNING" && preparedCount <= visibleCount)) return;
    void client.invalidateQueries({ queryKey: aiPostingTestRunKeys(channelId).runs });
  }, [channelId, client, preparedCount, runId, status, visibleCount]);

  useEffect(() => {
    if (!activeRunId) return;
    const operation = start({
      id: `ai-posting-restored:${channelId}:${activeRunId}`,
      title: "Генерация публикаций",
      message: "Проверяю прогресс запуска…",
    });
    handle.current = operation;
    return () => {
      operation.dismiss();
      handle.current = null;
    };
  }, [activeRunId, channelId, start]);

  useEffect(() => {
    if (!activeRunId || !progress) return;
    const { current, total } = publicationBatchProgress(progress);
    const stage = current === total
      ? "Сохраняю результаты"
      : generationStageLabel[progress.stage ?? ""] ?? "Подготавливаю запуск";
    const message = `Публикация ${progress.publicationIndex + 1} из ${total} · ${stage}`;
    handle.current?.update({ message, current, total });
  }, [activeRunId, progress]);

  if (!run) return undefined;
  return {
    run: {
      ...run,
      status: status && status !== "RUNNING" && status !== "INTERRUPTED" ? "SYNCING" : status ?? run.status,
      progress: status === "RUNNING" ? progress : undefined,
    },
    refreshError: query.isError,
    refresh: query.refetch,
  };
}
