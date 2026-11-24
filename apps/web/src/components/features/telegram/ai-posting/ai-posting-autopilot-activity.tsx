import { RefreshCw } from "lucide-react";
import type { TelegramAiPostingAutopilotState } from "@telegram-system/shared";
import { Button } from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";

export function AiPostingAutopilotActivity({
  state,
  refreshing,
  refresh,
  date,
}: {
  state: TelegramAiPostingAutopilotState;
  refreshing: boolean;
  refresh: () => void;
  date: (value: string | null) => string;
}) {
  const { t } = useI18n();
  const history = state.history ?? [];
  const active = history.find(({ id }) => id === state.activeRunId);
  const latestStage = active?.stages.at(-1);
  const stageLabels: Record<string, string> = {
    START: t("telegram.posts.aiPostingAutopilot.starting"),
    SCHEDULE_DRAFTS: t("telegram.posts.aiPostingAutopilot.scheduling"),
    GENERATE_DRAFTS: t("telegram.posts.aiPostingAutopilot.generating"),
    RUN: t("telegram.posts.aiPostingAutopilot.historyRun"),
  };
  const statusLabels: Record<string, string> = {
    COMPLETED: t("telegram.posts.aiPostingAutopilot.historyCompleted"),
    PARTIAL: t("telegram.posts.aiPostingAutopilot.historyPartial"),
    STOPPED: t("telegram.posts.aiPostingAutopilot.historyStopped"),
    FAILED: t("telegram.posts.aiPostingAutopilot.historyFailed"),
    CRITICAL_COVERAGE: t("telegram.posts.aiPostingAutopilot.historyCritical"),
    RUNNING: t("telegram.posts.aiPostingAutopilot.historyUnfinished"),
  };
  const errorLabels: Record<string, string> = {
    AI_AUTOMATIC_DISABLED: t("telegram.posts.aiPostingAutopilot.historyAiDisabled"),
    AI_API_UNAVAILABLE: t("telegram.posts.aiPostingAutopilot.historyAiUnavailable"),
    AI_BUDGET_OR_QUOTA: t("telegram.posts.aiPostingAutopilot.historyAiLimit"),
    PUBLICATION_PLAN_REQUIRED: t("telegram.posts.aiPostingAutopilot.noPlan"),
  };
  const costLabels: Record<string, string> = {
    planning: t("telegram.posts.aiPostingAutopilot.planning"),
    text: t("telegram.posts.aiPostingAutopilot.text"),
    search: t("telegram.posts.aiPostingAutopilot.search"),
    image: t("telegram.posts.aiPostingAutopilot.image"),
    review: t("telegram.posts.aiPostingAutopilot.review"),
  };
  const target = (count: number | null) =>
    count === null ? null : ` · ${t("telegram.posts.aiPostingAutopilot.historyTarget")} ${count}`;

  return (
    <section aria-label={t("telegram.posts.aiPostingAutopilot.activity")} className="space-y-3 border-t border-neutral-800 pt-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{t("telegram.posts.aiPostingAutopilot.activity")}</h4>
        <Button type="button" variant="secondary" onClick={refresh} disabled={refreshing}>
          <RefreshCw size={14} aria-hidden="true" className={refreshing ? "motion-safe:animate-spin" : undefined} />
          {t("telegram.posts.aiPostingAutopilot.activityRefresh")}
        </Button>
      </div>

      {state.activeStage ? (
        <p role="status" className="rounded-md bg-blue-950/40 px-3 py-2 text-blue-200">
          {stageLabels[state.activeStage] ?? state.activeStage}
          {latestStage?.stage === state.activeStage ? target(latestStage.targetCount) : null}
        </p>
      ) : null}

      {state.enabled && state.nextRunAt && !state.activeStage ? (
        <div className="rounded-md border border-neutral-800 px-3 py-2">
          <p className="font-medium">{t("telegram.posts.aiPostingAutopilot.next")} · {date(state.nextRunAt)}</p>
          <p className="mt-1 text-neutral-400">
            {t("telegram.posts.aiPostingAutopilot.activityPlanSlots")}{" "}
            {state.automaticGenerationAvailable ? t("telegram.posts.aiPostingAutopilot.activityPlanStock") : null}
          </p>
        </div>
      ) : null}

      {history.length ? (
        <ol className="space-y-2">
          {history.map((run) => (
            <li key={run.id} className="rounded-md border border-neutral-800 px-3 py-2">
              <details>
                <summary className="cursor-pointer break-words font-medium">
                  <time dateTime={run.startedAt}>{date(run.startedAt)}</time>
                  {" · "}{run.id === state.activeRunId ? t("telegram.posts.aiPostingAutopilot.historyRunning") : statusLabels[run.status] ?? run.status}
                </summary>
                {run.stages.length ? (
                  <ol className="mt-2 space-y-1 border-l border-neutral-700 pl-3 text-neutral-300">
                    {run.stages.map((stage) => (
                      <li key={stage.id}>
                        <time dateTime={stage.startedAt} className="text-neutral-400">{date(stage.startedAt)}</time>
                        {" · "}{stageLabels[stage.stage] ?? stage.stage}{target(stage.targetCount)}
                      </li>
                    ))}
                  </ol>
                ) : null}
                {run.completedAt ? (
                  <p className="mt-2 text-neutral-400">
                    {t("telegram.posts.aiPostingAutopilot.historyFinishedAt")} · <time dateTime={run.completedAt}>{date(run.completedAt)}</time>
                  </p>
                ) : null}
                <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-neutral-400">
                  {Object.entries(run.summary?.costs ?? {}).map(([key, value]) => (
                    <div key={key} className="flex gap-1">
                      <dt>{costLabels[key] ?? key}</dt>
                      <dd className="text-neutral-200">{`$${value}`}</dd>
                    </div>
                  ))}
                </dl>
                {run.summary?.unknownCosts ? (
                  <p className="mt-1 text-amber-200">{t("telegram.posts.aiPostingAutopilot.unknownCosts")} {run.summary.unknownCosts}</p>
                ) : null}
              </details>
              {run.errorCodes.length ? (
                <p className="mt-1 break-words text-amber-200">
                  {run.errorCodes.map((code) => errorLabels[code] ?? code).join(" · ")}
                </p>
              ) : null}
              {run.summary ? (
                <p className="mt-1 text-neutral-400">
                  {t("telegram.posts.aiPostingAutopilot.generated")} {run.summary.generated}
                  {" · "}{t("telegram.posts.aiPostingAutopilot.scheduled")} {run.summary.scheduled}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-neutral-400">{t("telegram.posts.aiPostingAutopilot.activityEmpty")}</p>
      )}
    </section>
  );
}
