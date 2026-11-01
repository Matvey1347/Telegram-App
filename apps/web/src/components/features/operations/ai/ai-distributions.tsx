"use client";
import type { AiUsageDashboard } from "@telegram-system/shared";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/primitives";
import { aiCategory, aiCost, aiDisplayMoney, aiMoney } from "./ai-format";
import { useAiText } from "./ai-copy";
export function AiDistributions({ data }: { data: AiUsageDashboard }) {
  const t = useAiText();
  const groups = [
    {
      title: "By feature",
      rows: data.byFeature.map((v) => ({
        ...v,
        label: aiCategory(v.category),
      })),
    },
    {
      title: "By model",
      rows: data.byModel.map((v) => ({ ...v, label: v.model })),
    },
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {groups.map((group) => (
        <Card key={group.title}>
          <h3 className="text-lg font-semibold">{t(group.title)}</h3>
          {group.rows.length ? (
            <>
              <div className="mt-3 h-40 min-w-0" aria-label={t(group.title)}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={group.rows.map((v) => ({
                      label: v.label,
                      cost: Number(v.knownCost),
                    }))}
                  >
                    <CartesianGrid stroke="#333" strokeDasharray="3 3" />
                    <XAxis dataKey="label" hide />
                    <YAxis width={45} tick={{ fill: "#aaa", fontSize: 11 }} />
                    <Tooltip />
                    <Bar
                      isAnimationActive={false}
                      dataKey="cost"
                      name="Known cost USD"
                      fill="#60a5fa"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 space-y-3">
                {group.rows.map((v) => (
                  <div
                    key={v.label}
                    className="border-t border-neutral-800 pt-3 text-sm"
                  >
                    <p className="break-words font-medium">{v.label}</p>
                    <p className="mt-1 text-neutral-400">
                      {aiCost(v)} · {v.requests} {t("Requests")} ·{" "}
                      {t("Average priced request")}{" "}
                      {aiDisplayMoney(v.averageKnownCost)}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-neutral-400">
              {t("No recorded usage.")}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}
export function AiBudgetTrend({ data }: { data: AiUsageDashboard }) {
  const t = useAiText();
  const budget = data.budgets.find(
    (v) => v.scope === "WORKSPACE" && v.period === "MONTH",
  );
  if (!budget) return null;
  // Rounded chart coordinates only; authoritative monetary values remain decimal strings.
  const points = [...data.timeline]
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((v) => v.date.slice(0, 7) === data.asOf.slice(0, 7))
    .reduce<Array<{ date: string; cost: number }>>(
      (points, v) => [
        ...points,
        {
          date: v.date.slice(5, 10),
          cost: (points.at(-1)?.cost ?? 0) + Number(v.knownCost),
        },
      ],
      [],
    );
  return (
    <Card>
      <h3 className="text-lg font-semibold">{t("Monthly budget trend")}</h3>
      <p className="mt-1 text-xs text-neutral-400">
        {t(
          "Cumulative known costs within the selected days of this month. Unknown charges and reservations are excluded.",
        )}{" "}
        · {t("Monthly budget (USD)")}: {aiMoney(budget.limit)}
      </p>
      {points.length ? (
        <div className="mt-4 h-48 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <CartesianGrid stroke="#333" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: "#aaa", fontSize: 11 }} />
              <YAxis width={45} tick={{ fill: "#aaa", fontSize: 11 }} />
              <Tooltip />
              <Line
                isAnimationActive={false}
                dataKey="cost"
                name="Known cost USD"
                stroke="#60a5fa"
                dot={false}
              />
              {budget.limit === null ? null : (
                <ReferenceLine
                  ifOverflow="extendDomain"
                  y={Number(budget.limit)}
                  stroke="#fbbf24"
                  strokeDasharray="4 4"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-3 text-sm text-neutral-400">
          {t("No usage in this period.")}
        </p>
      )}
    </Card>
  );
}
