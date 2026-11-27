"use client";

import { useId, useState } from "react";
import type {
  DashboardTrafficKind,
  DashboardTrafficSource,
} from "@telegram-system/shared";
import { Input } from "@/components/ui/primitives";

export function DashboardTrafficRates({
  sources,
  labels,
  t,
  count,
  percent,
}: {
  sources: DashboardTrafficSource[];
  labels: Record<DashboardTrafficKind, string>;
  t: (en: string, ru: string) => string;
  count: (value: number | null | undefined) => string;
  percent: (value: number | null) => string;
}) {
  const forecastId = useId();
  const [forecast, setForecast] = useState("30000");
  const botRequests = sources.find(({ kind }) => kind === "BOT")?.requests;
  const inboundRequests = sources.reduce<number | null>(
    (total, { kind, requests }) => {
      if (kind === "BOT" || requests == null) return total;
      return (total ?? 0) + requests;
    },
    null,
  );
  const botRate =
    botRequests != null && inboundRequests != null && inboundRequests > 0
      ? botRequests / inboundRequests
      : null;
  const expectedRequests =
    botRate != null &&
    /^\d+$/.test(forecast) &&
    Number.isSafeInteger(Number(forecast))
      ? Math.round(Number(forecast) * botRate)
      : null;
  const rows = sources
    .map(({ kind, arrivals, departures }) => ({
      kind,
      arrivals,
      departures,
      rate:
        arrivals != null && arrivals > 0 && departures != null
          ? (100 * departures) / arrivals
          : null,
    }))
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));
  const maxRate = Math.max(100, ...rows.map(({ rate }) => rate ?? 0));

  return (
    <div className="mb-4 grid gap-3">
      <section
        className="rounded-lg border border-neutral-800 p-4"
        aria-label={t("Bot conversion", "Конверсия в бота")}
      >
        <h4 className="text-sm font-medium text-neutral-200">
          {t("Bot conversion", "Конверсия в бота")}
        </h4>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-2xl font-semibold tabular-nums text-sky-200">
              {percent(botRate == null ? null : 100 * botRate)}
            </p>
            <p className="text-sm text-neutral-400">
              {count(botRequests)} {t("bot requests", "заявок через бота")} /{" "}
              {count(inboundRequests)}{" "}
              {t("measured inbound requests", "измеренных входящих заявок")}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label
                className="mb-1 block text-xs text-neutral-400"
                htmlFor={forecastId}
              >
                {t("Planned inbound requests", "План входящих заявок")}
              </label>
              <Input
                id={forecastId}
                type="number"
                min={0}
                step={1}
                value={forecast}
                onChange={(event) => setForecast(event.target.value)}
                className="w-40 max-w-full tabular-nums"
              />
            </div>
            <div aria-live="polite">
              <p className="text-xs text-neutral-400">
                {t("Estimated bot requests", "Прогноз заявок через бота")}
              </p>
              <p className="text-lg font-semibold tabular-nums text-white">
                {count(expectedRequests)}
              </p>
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-neutral-400">
          {t(
            "Uses measured requests from other sources in the same period. This estimate is based on aggregate counters.",
            "Входящие заявки считаются по остальным источникам за тот же период. Конверсия оценочная, по общим счётчикам.",
          )}
        </p>
      </section>
      <section
        className="rounded-lg border border-neutral-800 p-4"
        aria-label={t(
          "Unsubscribe rate by source",
          "Процент отписок по источникам",
        )}
      >
        <h4 className="text-sm font-medium text-neutral-200">
          {t("Unsubscribe rate by source", "Процент отписок по источникам")}
        </h4>
        <ul className="mt-3 space-y-3">
          {rows.map(({ kind, departures, arrivals, rate }) => (
            <li key={kind} className="text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-neutral-200">{labels[kind]}</span>
                <span className="tabular-nums text-neutral-400">
                  {count(departures)} / {count(arrivals)}{" "}
                  <strong className="ml-1 font-medium text-white">
                    {percent(rate)}
                  </strong>
                </span>
              </div>
              {rate != null && (
                <div
                  className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-800"
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full bg-rose-400"
                    style={{ width: `${(100 * rate) / maxRate}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-neutral-400">
          {t(
            "Unsubscribes divided by arrivals in the selected period. Earlier subscribers can also leave during this period.",
            "Отписки ÷ привлечённые за выбранный период. В отписках также учитываются подписчики, пришедшие раньше.",
          )}
        </p>
      </section>
    </div>
  );
}
