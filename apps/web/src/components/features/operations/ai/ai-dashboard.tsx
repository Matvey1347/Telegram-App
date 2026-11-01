"use client";
import { useAiText } from "./ai-copy";
import type { AiUsageDashboard } from "@telegram-system/shared";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AiBudgetTrend, AiDistributions } from "./ai-distributions";
import { Card } from "@/components/ui/primitives";
import {
  aiCategory,
  aiCost,
  aiDisplayMoney,
  aiMoney,
  aiNumber,
} from "./ai-format";
export function AiDashboard({ data }: { data: AiUsageDashboard }) {
  const t = useAiText();
  const selected = data.summary.selected;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {[
          ["Today", data.summary.today],
          ["7 days", data.summary.sevenDays],
          ["30 days", data.summary.thirtyDays],
          ["This month", data.summary.month],
        ].map(
          ([label, value]) =>
            typeof value !== "string" && (
              <Card key={t(String(label))}>
                <div className="text-sm text-neutral-400">
                  {t(String(label))} · USD
                </div>
                <div className="mt-2 break-words text-lg font-semibold tabular-nums">
                  {aiCost(value)}
                </div>
                <div className="mt-1 text-xs text-neutral-400">
                  {value.requests} requests
                </div>
              </Card>
            ),
        )}
      </div>
      <Card>
        <h3 className="text-lg font-semibold">{t("Selected period")}</h3>
        <dl className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            ["Known cost", aiCost(selected)],
            ["Requests / errors", `${selected.requests} / ${selected.errors}`],
            [
              "Average priced request",
              aiDisplayMoney(selected.averageKnownCost),
            ],
            [
              "Pending / unresolved",
              `${data.pendingRequests} / ${data.unresolvedRequests}`,
            ],
            ["Input tokens", aiNumber(selected.inputTokens)],
            ["Output tokens", aiNumber(selected.outputTokens)],
            ["Total tokens", aiNumber(selected.totalTokens)],
            [
              "Cached / cache write",
              `${aiNumber(selected.cachedInputTokens)} / ${aiNumber(selected.cacheWriteTokens)}`,
            ],
            ["Reasoning (within output)", aiNumber(selected.reasoningTokens)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-neutral-400">{t(label)}</dt>
              <dd className="mt-1 break-all font-medium tabular-nums">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {selected.unpricedRequests || selected.unknownUsageRequests ? (
          <p role="status" className="mt-4 text-sm text-amber-200">
            Costs are incomplete: {selected.unpricedRequests} unpriced requests;{" "}
            {selected.unknownUsageRequests} requests have unknown usage.
            Reservations remain until verified settlement.
          </p>
        ) : null}
      </Card>
      <Card>
        <h3 className="text-lg font-semibold">{t("Daily known cost · USD")}</h3>
        <p className="text-xs text-neutral-400">
          {t(
            "Unknown charges are excluded. Chart values are rounded for display.",
          )}
        </p>
        {data.timeline.length ? (
          <div className="mt-4 h-56 min-w-0" aria-label="Daily cost timeline">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.timeline.map((v) => ({
                  date: v.date.slice(5, 10),
                  cost: Number(v.knownCost),
                }))}
              >
                <CartesianGrid stroke="#333" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: "#aaa", fontSize: 11 }} />
                <YAxis width={45} tick={{ fill: "#aaa", fontSize: 11 }} />
                <Tooltip />
                <Line
                  isAnimationActive={false}
                  name="Known cost USD"
                  dataKey="cost"
                  stroke="#60a5fa"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-6 text-sm text-neutral-400">
            {t("No usage in this period.")}
          </p>
        )}
      </Card>
      <Card>
        <h3 className="text-lg font-semibold">{t("Budget balances")}</h3>
        <p className="mt-1 text-xs text-neutral-400">
          {t(
            "Spent and reserved charges count toward limits. Unconfigured workspace limits block execution.",
          )}
        </p>
        <div className="mt-3 space-y-3">
          {data.budgets.map((v) => (
            <div
              key={`${v.scope}-${v.period}`}
              className="border-t border-neutral-800 pt-3 text-sm"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <strong>
                  {aiCategory(v.scope)} · {v.period}
                </strong>
                <span
                  className={
                    v.exhausted || v.warning
                      ? "text-amber-200"
                      : "text-neutral-300"
                  }
                >
                  {v.exhausted ? "Exhausted · " : v.warning ? "Warning · " : ""}
                  {v.limit === null
                    ? "Not configured"
                    : `Limit ${aiMoney(v.limit)}`}
                </span>
              </div>
              <p className="mt-1 break-words text-neutral-400">
                Spent {aiMoney(v.spent)} · Reserved {aiMoney(v.reserved)} ·
                Remaining {aiMoney(v.remaining)}
              </p>
            </div>
          ))}
        </div>
      </Card>
      <AiBudgetTrend data={data} />
      <AiDistributions data={data} />
    </div>
  );
}
