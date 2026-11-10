"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, FormField } from "@/components/ui/primitives";
import { DateRangeInput } from "@/components/ui/date-inputs";
import type { TelegramAiPostingAnalytics } from "@telegram-system/shared";
import { telegramAiPostingKeys } from "@/lib/query-keys";

const today = () => new Date().toISOString().slice(0, 10);
const initialFrom = () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 29);
  return date.toISOString().slice(0, 10);
};
const amount = (value: string | null | undefined) =>
  value === null || value === undefined
    ? "UNKNOWN/UNPRICED"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 6,
      }).format(Number(value));

export function AiPostingAnalytics({ channelId }: { channelId: string }) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(today);
  const analytics = useQuery<TelegramAiPostingAnalytics>({
    queryKey: telegramAiPostingKeys.analytics(channelId, from, to),
    queryFn: async () =>
      (
        await api.get(`/telegram-channels/${channelId}/ai-posting/analytics`, {
          params: { from, to },
        })
      ).data as TelegramAiPostingAnalytics,
    enabled: Boolean(channelId && from && to),
  });
  const data = analytics.data;
  const section =
    "rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 sm:p-5 space-y-4";
  return (
    <Card className={section}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="ai-posting-analytics-title" className="text-lg font-semibold">
            Аналитика расходов AI Posting
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Суммы берутся из фактических записей AI Gateway и не учитывают одну
            операцию повторно.
          </p>
        </div>
        <FormField label="Период">
          <DateRangeInput
            from={from}
            to={to}
            max={today()}
            onChange={(range) => {
              setFrom(range.from);
              setTo(range.to);
            }}
            placeholder="Выберите период"
          />
        </FormField>
      </div>
      {!from || !to ? (
        <p className="text-sm text-neutral-500">Выберите начало и конец периода.</p>
      ) : analytics.isLoading ? (
        <p role="status" className="text-sm text-neutral-400">
          Загружаем расходы…
        </p>
      ) : analytics.isError ? (
        <p role="alert" className="text-sm text-rose-300">
          Не удалось загрузить аналитику расходов.
        </p>
      ) : data ? (
        <>
          <div className="grid gap-2">
            <Metric
              label="Расходы за период"
              value={amountUnlessUnknown(
                data.expenses.knownCost,
                data.expenses.unpricedOperations,
              )}
              detail={`${data.expenses.unpricedOperations} операций без подтверждённой цены${data.expenses.unpricedOperations ? ` · известная часть ${amount(data.expenses.knownCost)}` : ""}`}
            />
            <Metric
              label="Стоимость готового DRAFT"
              value={
                data.unpricedReadyPosts
                  ? "UNKNOWN/UNPRICED"
                  : data.readyPosts
                    ? amount(data.costPerReadyPost)
                    : "—"
              }
              detail={`${data.readyPosts} готовых черновиков${data.unpricedReadyPosts ? ` · ${data.unpricedReadyPosts} без цены` : ""}`}
            />
            <Metric
              label="Отклонённые тесты"
              value={amountUnlessUnknown(
                data.rejectedTests.knownCost,
                data.rejectedTests.unpricedOperations,
              )}
              detail={`${data.rejectedTests.unpricedOperations} операций без цены${data.rejectedTests.unpricedOperations ? ` · известная часть ${amount(data.rejectedTests.knownCost)}` : ""}`}
            />
            <Metric
              label="Прогноз на месяц"
              value={amountUnlessUnknown(
                data.monthlyForecast.knownCost,
                data.monthlyForecast.unpricedOperations,
              )}
              detail={`Темп последних ${data.monthlyForecast.basisDays} дней · ${data.monthlyForecast.unpricedOperations} неизвестных${data.monthlyForecast.unpricedOperations ? ` · известная часть ${amount(data.monthlyForecast.knownCost)}` : ""}`}
            />
          </div>
          <div className="grid gap-3">
            <Card className="p-3">
              <h3 className="mb-3 text-sm font-medium">
                Расходы по типу операции
              </h3>
              <div className="space-y-2">
                {data.byStage.map((item) => (
                  <div
                    key={item.stage}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="capitalize text-neutral-300">
                      {stageTitle(item.stage)}
                    </span>
                    <span className="tabular-nums text-neutral-100">
                      {amountUnlessUnknown(
                        item.knownCost,
                        item.unpricedOperations,
                      )}
                      {item.unpricedOperations
                        ? ` · известная часть ${amount(item.knownCost)}`
                        : ""}
                    </span>
                  </div>
                ))}
                {!data.byStage.length && (
                  <p className="text-sm text-neutral-500">
                    За выбранный период операций нет.
                  </p>
                )}
              </div>
            </Card>
            <Card className="p-3">
              <h3 className="mb-3 text-sm font-medium">Тесты и автопилот</h3>
              <div className="space-y-2">
                {data.byMode.map((item) => (
                  <div
                    key={item.mode}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-neutral-300">
                      {item.mode === "AUTOMATIC"
                        ? "Автоматический режим"
                        : "Тестовый режим"}
                    </span>
                    <span className="tabular-nums text-neutral-100">
                      {amountUnlessUnknown(
                        item.knownCost,
                        item.unpricedOperations,
                      )}{" "}
                      · {item.operations} операций
                    </span>
                  </div>
                ))}
                <p className="border-t border-neutral-800 pt-2 text-sm text-neutral-400">
                  Неудачные операции: {data.expenses.failedOperations} ·
                  Повторные попытки: {data.expenses.retryOperations}
                </p>
                <p className="text-sm text-neutral-400">
                  Канал: {amount(data.expenses.knownCost)}
                </p>
              </div>
            </Card>
          </div>
          <Card className="p-3">
            <h3 className="mb-2 text-sm font-medium">Лимиты канала</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <Budget label="День" budget={data.budgets.daily} />
              <Budget label="Месяц" budget={data.budgets.monthly} />
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              При превышении лимита блокируются новые платные AI-операции этого
              канала. Уже готовые черновики и публикации продолжают
              обрабатываться обычным календарём.
            </p>
          </Card>
        </>
      ) : null}
    </Card>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="p-3">
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{detail}</p>
    </Card>
  );
}

function Budget({
  label,
  budget,
}: {
  label: string;
  budget: TelegramAiPostingAnalytics["budgets"]["daily"];
}) {
  return (
    <p className="flex flex-wrap justify-between gap-2 text-sm">
      <span className="text-neutral-300">{label}</span>
      <span className="tabular-nums text-neutral-400">
        {budget.limit
          ? `${amount(budget.spent)} / ${amount(budget.limit)} · резерв ${amount(budget.reserved)}`
          : "Лимит не задан"}
        {budget.exhausted ? " · исчерпан" : ""}
      </span>
    </p>
  );
}

function stageTitle(stage: string) {
  return (
    (
      {
        text: "Текст",
        image: "Изображения",
        planning: "Планирование",
        checks: "AI-проверки",
        other: "Прочие операции",
      } as Record<string, string>
    )[stage] ?? stage
  );
}

function amountUnlessUnknown(value: string, unpricedOperations: number) {
  return unpricedOperations > 0 ? "UNKNOWN/UNPRICED" : amount(value);
}
