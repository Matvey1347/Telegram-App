"use client";

import { RotateCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card } from "@/components/ui/primitives";
import { api } from "@/lib/api";

type Stage = {
  id: string;
  stage: string;
  status: string;
  attempt: number;
  postId?: string | null;
  errorType?: string | null;
  errorMessage?: string | null;
  startedAt: string;
};
type Run = {
  id: string;
  status: string;
  trigger: string;
  settingsVersion: number;
  currentStage?: string | null;
  startedAt: string;
  completedAt?: string | null;
  failureType?: string | null;
  failureMessage?: string | null;
  summary?: {
    coverageDays?: number;
    readyDrafts?: number;
    generated?: number;
    scheduledInWindow?: number;
    scheduleMode?: string;
  } | null;
  stages: Stage[];
};
const queryKey = (channelId: string) =>
  ["telegram-ai-posting-autopilot-runs", channelId] as const;

export function AiPostingAutopilotHistory({
  channelId,
}: {
  channelId: string;
}) {
  const client = useQueryClient();
  const runs = useQuery({
    queryKey: queryKey(channelId),
    queryFn: async () =>
      (
        await api.get<Run[]>(
          `/telegram-channels/${channelId}/ai-posting/autopilot/runs`,
        )
      ).data,
    enabled: Boolean(channelId),
  });
  const retry = useMutation({
    mutationFn: (runId: string) =>
      api.post(
        `/telegram-channels/${channelId}/ai-posting/autopilot/runs/${runId}/retry`,
        {},
      ),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKey(channelId) }),
  });
  return (
    <Card className="mt-5 space-y-3 bg-neutral-900/60">
      <h2 className="text-lg font-semibold">История запусков автопилота</h2>
      {runs.isLoading ? (
        <p className="text-sm text-neutral-400">Загружаем историю…</p>
      ) : runs.isError ? (
        <p role="alert" className="text-sm text-rose-300">
          Не удалось загрузить историю.
        </p>
      ) : runs.data?.length ? (
        runs.data.map((run) => (
          <Card key={run.id} className="p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-white">
                  {run.status} · {run.currentStage ?? run.trigger}
                </p>
                <p className="text-xs text-neutral-500">
                  {new Date(run.startedAt).toLocaleString()}
                  {` · версия настроек ${run.settingsVersion}`}
                </p>
              </div>
              {["FAILED", "PARTIAL", "CRITICAL_COVERAGE"].includes(
                run.status,
              ) && (
                <Button
                  variant="secondary"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate(run.id)}
                >
                  <RotateCcw size={14} />
                  Повторить задачу
                </Button>
              )}
            </div>
            {run.summary && (
              <p className="mt-2 text-xs text-neutral-300">
                Покрытие: {run.summary.coverageDays ?? 0} дн. · черновики:{" "}
                {run.summary.readyDrafts ?? 0} · создано:{" "}
                {run.summary.generated ?? 0} · расписание:{" "}
                {run.summary.scheduleMode ?? "—"}
              </p>
            )}
            {run.failureType && (
              <p className="mt-2 text-xs text-rose-300">
                {run.failureType}: {run.failureMessage}
              </p>
            )}
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-neutral-400">
                Этапы · {run.stages.length}
              </summary>
              <ul className="mt-2 space-y-1">
                {run.stages.map((stage) => (
                  <li key={stage.id} className="text-xs text-neutral-400">
                    {stage.stage}: {stage.status}
                    {stage.errorType ? ` · ${stage.errorType}` : ""}
                    {stage.postId ? ` · ${stage.postId}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          </Card>
        ))
      ) : (
        <p className="text-sm text-neutral-400">Запусков пока нет.</p>
      )}
      {retry.isError && (
        <p role="alert" className="text-xs text-rose-300">
          Не удалось поставить задачу на повтор.
        </p>
      )}
    </Card>
  );
}
