import type {
  CrmAutomationExecutionStatus,
  CrmAutomationStatusResponse,
  CrmCustomerAutomationType,
} from "@telegram-system/shared";
import { Button, EmptyState } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/date-format";

const automationTypes: Array<{
  type: CrmCustomerAutomationType;
  label: string;
}> = [
  { type: "PRE_PUBLICATION_REMINDER", label: "Pre-publication" },
  { type: "PUBLISHED_LINKS", label: "Published links" },
  { type: "FOLLOW_UP", label: "Customer follow-up" },
];

function machineLabel(value: string) {
  return value
    .toLocaleLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(" ");
}

function executionTone(status: CrmAutomationExecutionStatus) {
  if (status === "SENT")
    return "border-emerald-800 bg-emerald-950/40 text-emerald-200";
  if (status === "FAILED")
    return "border-rose-800 bg-rose-950/40 text-rose-200";
  if (status === "SKIPPED" || status === "CANCELLED")
    return "border-neutral-700 bg-neutral-900 text-neutral-300";
  return "border-amber-800 bg-amber-950/40 text-amber-200";
}

export function CrmAutomationStatus({
  status,
  refreshing,
  onRefresh,
}: {
  status: CrmAutomationStatusResponse;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/55 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-white">
            Current server safety-gate readiness
          </h3>
          <p className="mt-1 text-xs text-neutral-400">
            Gates ready does not mean an occurrence exists: a fresh source event
            plus type-specific facts are still required. Reasons come from the
            server, historical execution rows remain separate, and this page
            does not poll.
          </p>
        </div>
        <Button variant="secondary" disabled={refreshing} onClick={onRefresh}>
          {refreshing ? "Refreshing…" : "Refresh status"}
        </Button>
      </div>

      {!status.deals.length ? (
        <div className="mt-4">
          <EmptyState text="No Deal automation status or executions are available. Manual messages remain available." />
        </div>
      ) : (
        <div className="mt-4 divide-y divide-neutral-800">
          {status.deals.map((deal) => (
            <article key={deal.dealId} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-medium text-white">
                    Deal {deal.dealId.slice(0, 8)}
                  </h4>
                  <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300">
                    {deal.override}
                  </span>
                  {deal.eligibleAt === null ? (
                    <span className="rounded-full border border-amber-800 bg-amber-950/30 px-2 py-0.5 text-xs text-amber-200">
                      Protected legacy state
                    </span>
                  ) : null}
                </div>
                <span className="text-xs text-neutral-500">
                  {deal.conversationId
                    ? `Conversation ${deal.conversationId.slice(0, 8)}`
                    : "Conversation chosen at send time"}
                </span>
              </div>

              <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                {automationTypes.map(({ type, label }) => {
                  const evaluated = deal.evaluated[type];
                  return (
                    <div
                      key={type}
                      className="rounded-lg bg-neutral-950/50 px-3 py-2"
                    >
                      <dt className="text-xs text-neutral-400">{label}</dt>
                      <dd
                        className={
                          evaluated.allowed
                            ? "mt-1 text-sm text-emerald-300"
                            : "mt-1 text-sm text-amber-200"
                        }
                      >
                        {evaluated.allowed
                          ? "Gates ready"
                          : machineLabel(evaluated.reason)}
                      </dd>
                    </div>
                  );
                })}
              </dl>

              <div className="mt-3">
                <h5 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Recent executions
                </h5>
                {!deal.latestExecutions.length ? (
                  <p className="mt-2 text-sm text-neutral-500">
                    No recent executions for this Deal.
                  </p>
                ) : (
                  <ol className="mt-2 divide-y divide-neutral-800 border-y border-neutral-800">
                    {deal.latestExecutions.map((execution) => (
                      <li
                        key={execution.id}
                        className="grid gap-2 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_auto]"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-neutral-200">
                              {machineLabel(execution.automationType)}
                            </span>
                            <span
                              className={`rounded-full border px-2 py-0.5 ${executionTone(execution.status)}`}
                            >
                              {machineLabel(execution.status)}
                            </span>
                          </div>
                          <p className="mt-1 text-neutral-500">
                            Event {formatDateTime(execution.eventOccurredAt)}
                            {execution.dueAt
                              ? ` · due ${formatDateTime(execution.dueAt)}`
                              : ""}{" "}
                            · attempts {execution.attempts}/
                            {execution.maxAttempts}
                          </p>
                          {execution.templateKey || execution.locale ? (
                            <p className="mt-1 truncate text-neutral-500">
                              {execution.templateKey ?? "No template"}
                              {execution.locale
                                ? ` · ${execution.locale.toUpperCase()}`
                                : ""}
                            </p>
                          ) : null}
                          {execution.reason ? (
                            <p className="mt-1 text-amber-200">
                              Reason: {machineLabel(execution.reason)}
                            </p>
                          ) : null}
                          {execution.lastError ? (
                            <p className="mt-1 break-words text-rose-300">
                              Error: {execution.lastError}
                            </p>
                          ) : null}
                        </div>
                        <span className="text-neutral-500">
                          {execution.completedAt
                            ? `Completed ${formatDateTime(execution.completedAt)}`
                            : `Created ${formatDateTime(execution.createdAt)}`}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
