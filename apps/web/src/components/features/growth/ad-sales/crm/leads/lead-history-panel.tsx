"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/primitives";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import { leadKeys } from "@/lib/features/growth/lead-discovery-query";

const labels = {
  RUNNING: "Собираем историю",
  PAUSING: "Останавливаем после текущей страницы",
  PAUSED: "Сбор на паузе",
  COMPLETED: "Сбор завершён",
  FAILED: "Сбор остановлен из-за ошибки",
} as const;

/** Open only on request; no background polling or per-source reads on page load. */
export function LeadHistoryPanel({
  workspace,
  sourceId,
  enabled,
  canManage,
}: {
  workspace: string;
  sourceId: string;
  enabled: boolean;
  canManage: boolean;
}) {
  const client = useQueryClient();
  const key = leadKeys.history(workspace, sourceId);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      leadDiscoveryApi.pipelineProgress(sourceId, signal),
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const action = useMutation({
    mutationFn: (value: "start" | "pause" | "resume") =>
      leadDiscoveryApi.historyAction(sourceId, value),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: key, refetchType: "active" });
    },
    retry: false,
  });
  const progress = query.data;
  const job = progress?.collection;
  const counts = progress?.analysis;
  const active = Boolean(
    progress?.admittedAiOperations ||
    (counts && (counts.waiting || counts.running || counts.other)) ||
    progress?.reconciliationPending,
  );
  const attention = Boolean(
    counts &&
    (counts.needsMetadata ||
      counts.needsMediaAnalysis ||
      counts.failed ||
      counts.unknown),
  );
  const complete = job?.status === "COMPLETED" && !active && !attention;
  const canAct = enabled && canManage && !action.isPending && !query.isFetching;
  const refresh = async () => {
    const result = await query.refetch();
    if (result.isSuccess)
      await Promise.all([
        client.invalidateQueries({
          queryKey: leadKeys.sourcesRoot(workspace),
          refetchType: "active",
        }),
        client.invalidateQueries({
          queryKey: leadKeys.feedRoot(workspace),
          refetchType: "active",
        }),
        client.invalidateQueries({
          queryKey: leadKeys.candidatesRoot(workspace),
          refetchType: "active",
        }),
      ]);
  };
  return (
    <div
      className="mt-3 space-y-2 rounded-lg border border-neutral-700 p-3 text-xs"
      aria-label="Сбор истории канала"
    >
      <p className="text-neutral-300">
        Запуск собирает историю за 90 дней и автоматически анализирует доступные
        публикации. AI-анализ может расходовать бюджет в рамках разрешений и
        установленных лимитов.
      </p>
      {query.isLoading ? <p role="status">Загружаем состояние…</p> : null}
      {query.isError ? (
        <p role="alert" className="text-amber-200">
          Не удалось загрузить состояние сбора.{" "}
          <button
            type="button"
            className="text-blue-300 underline"
            onClick={() => void refresh()}
          >
            Повторить
          </button>
        </p>
      ) : null}
      {query.isSuccess ? (
        <>
          <p role="status" className="text-neutral-200">
            {job?.lastErrorCode === "ACCOUNT_NOT_CONNECTED"
              ? "Ожидаем подключения Telegram"
              : job
                ? labels[job.status]
                : "Сбор ещё не запускался"}
          </p>
          {job ? (
            <p className="text-neutral-400">
              Получено из Telegram: {job.received} · Страниц: {job.pages}
            </p>
          ) : null}
          {job && counts ? (
            <>
              <p className="text-neutral-200">
                Анализ: ожидают {counts.waiting} · выполняются {counts.running}{" "}
                · завершены {counts.completed}
              </p>
              <p className="text-neutral-400">
                Допущенные AI-операции: {progress.admittedAiOperations}
              </p>
              <p className="text-neutral-400">
                Нужны метаданные: {counts.needsMetadata} · нужен анализ медиа:{" "}
                {counts.needsMediaAnalysis} · ошибки: {counts.failed} ·
                неизвестный результат: {counts.unknown}
                {counts.other ? ` · другие состояния: ${counts.other}` : ""}
              </p>
              <p role="status" className="text-neutral-200">
                {!progress.analysisEnabled
                  ? "Анализ на паузе"
                  : complete
                    ? "Анализ завершён, кандидаты готовы"
                    : attention && !active && job.status === "COMPLETED"
                      ? "Есть публикации, требующие внимания"
                      : "Анализ продолжается"}
              </p>
              {!progress.analysisEnabled ? (
                <p className="text-neutral-400">
                  Уже допущенный AI-запрос может быть отправлен или завершиться
                  и быть тарифицирован.
                </p>
              ) : null}
            </>
          ) : null}
          {job ? (
            <p className="text-neutral-400">
              {job.coverage === "GAPPED"
                ? "В истории есть пропуски."
                : "Полнота истории ещё не подтверждена."}
            </p>
          ) : null}
          {job?.status === "FAILED" ? (
            <p className="text-amber-200">
              Проверьте доступ к каналу и подключение Telegram, затем продолжите
              сбор.
            </p>
          ) : null}
          {job?.lastErrorCode === "ACCOUNT_NOT_CONNECTED" ? (
            <p className="text-amber-200">
              Подключите Telegram-аккаунт: сбор продолжится после восстановления
              соединения.
            </p>
          ) : null}
          {job?.lastErrorCode &&
          job.lastErrorCode !== "ACCOUNT_NOT_CONNECTED" &&
          job.status !== "FAILED" ? (
            <p className="text-amber-200">
              {job.lastErrorCode === "LEAD_DAILY_POST_QUOTA"
                ? "Достигнут суточный лимит публикаций. Продолжите сбор позднее."
                : "Сбор остановлен из-за ограничения или ошибки. Проверьте доступ к источнику и повторите."}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {canManage && !job ? (
              <Button disabled={!canAct} onClick={() => action.mutate("start")}>
                Проанализировать 90 дней
              </Button>
            ) : null}
            {canManage &&
            job?.status === "COMPLETED" &&
            !active &&
            progress?.analysisEnabled ? (
              <Button
                variant="secondary"
                disabled={!canAct}
                onClick={() => action.mutate("start")}
              >
                Повторить сбор
              </Button>
            ) : null}
            {canManage &&
            job &&
            progress?.analysisEnabled &&
            (job.status === "RUNNING" || active) ? (
              <Button
                variant="secondary"
                disabled={!canAct}
                onClick={() => action.mutate("pause")}
              >
                Пауза
              </Button>
            ) : null}
            {canManage &&
            (job?.status === "PAUSED" ||
              job?.status === "FAILED" ||
              (job?.status === "COMPLETED" && !progress?.analysisEnabled)) ? (
              <Button
                variant="secondary"
                disabled={!canAct}
                onClick={() => action.mutate("resume")}
              >
                Продолжить обработку
              </Button>
            ) : null}
            {job ? (
              <Button
                variant="secondary"
                disabled={query.isFetching || action.isPending}
                onClick={() => void refresh()}
              >
                Обновить состояние
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
      {action.isError ? (
        <p role="alert" className="text-amber-200">
          Не удалось изменить состояние сбора. Проверьте доступ и повторите.
        </p>
      ) : null}
    </div>
  );
}
