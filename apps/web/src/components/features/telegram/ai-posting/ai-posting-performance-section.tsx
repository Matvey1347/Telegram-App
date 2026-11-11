"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { telegramAiPostingKeys } from "@/lib/query-keys";
import { Button, Card } from "@/components/ui/primitives";

type Summary = {
  currentNorm24h: number | null;
  normSampleSize: number;
  normReason: string | null;
  scoreablePosts: number;
  origin: Array<{
    origin: string;
    medianScore: number | null;
    postCount: number;
    lowSample: boolean;
  }>;
};
type Group = {
  value: string | number | boolean;
  medianScore: number | null;
  postCount: number;
  lowSample: boolean;
};
type PerformanceData = {
  summary: Summary;
  breakdowns: Record<string, Group[]>;
  posts: Array<{
    telegramPostId: string;
    publishedAt: string;
    origin: string;
    textStart: string;
    views24h: number | null;
    views72h: number | null;
    views7d: number | null;
    score: number | null;
    scoreWindow: string | null;
    engagementPer1k24h: number | null;
    excludedReason: string | null;
    manualClassification: string | null;
    suggestedPromotion: boolean;
  }>;
};

const labels: Record<string, string> = {
  AI: "AI",
  SYSTEM_MANUAL: "Ручные",
  EXTERNAL: "Внешние",
  short: "Короткие",
  medium: "Средние",
  long: "Длинные",
  true: "Есть",
  false: "Нет",
  media: "Медиа",
  endsWithQuestion: "Вопрос в конце",
  lengthBand: "Длина текста",
  hourBlocks: "Время публикации (3 часа)",
  weekday: "День недели",
  0: "Воскресенье",
  1: "Понедельник",
  2: "Вторник",
  3: "Среда",
  4: "Четверг",
  5: "Пятница",
  6: "Суббота",
};
const scoreText = (value: number | null) =>
  value === null
    ? "мало данных"
    : `×${value.toFixed(2)} — ${value >= 1 ? `на ${Math.round((value - 1) * 100)}% выше` : `на ${Math.round((1 - value) * 100)}% ниже`} обычного для канала`;
const numberText = (value: number | null) =>
  value === null ? "—" : new Intl.NumberFormat("ru-RU").format(value);

export function AiPostingPerformanceSection({
  channelId,
  active,
}: {
  channelId: string;
  active: boolean;
}) {
  const days = 28;
  const client = useQueryClient();
  const query = useQuery<PerformanceData>({
    queryKey: telegramAiPostingKeys.performance(channelId, days),
    queryFn: async () =>
      (
        await api.get(
          `/telegram-channels/${channelId}/ai-posting/performance`,
          { params: { days } },
        )
      ).data as PerformanceData,
    enabled: Boolean(active && channelId),
  });
  const data = query.data;
  const classify = useMutation({
    mutationFn: async (input: {
      ids: string[];
      classification: "AD" | "MUTUAL_PROMO" | "EXCLUDED" | null;
    }) => {
      for (let offset = 0; offset < input.ids.length; offset += 100) {
        await api.put(
          `/telegram-channels/${channelId}/ai-posting/performance/classification`,
          {
            telegramPostIds: input.ids.slice(offset, offset + 100),
            classification: input.classification,
          },
        );
      }
    },
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: telegramAiPostingKeys.performance(channelId, days),
      });
    },
  });
  return (
    <Card className="space-y-5 border border-neutral-800 bg-neutral-900/60 p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold">Эффективность публикаций</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Период: последние 28 дней. Скор сравнивает просмотры поста с обычным
          результатом похожих публикаций канала.
        </p>
      </div>
      {!active ? null : query.isLoading ? (
        <p role="status" className="text-sm text-neutral-400">
          Загружаем результаты…
        </p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-rose-300">
          Не удалось загрузить результаты.
        </p>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric
              title="Обычные просмотры за 24 часа"
              value={
                data.summary.normReason === "NOT_ENOUGH_DATA"
                  ? "мало данных"
                  : numberText(data.summary.currentNorm24h)
              }
              detail={`${data.summary.normSampleSize} сопоставимых постов в расчёте нормы`}
            />
            <Metric
              title="Посты с рассчитанным скором"
              value={numberText(data.summary.scoreablePosts)}
              detail="Медианный результат за период"
            />
          </div>
          {data.posts.some((post) => post.suggestedPromotion) && (
            <section className="rounded-lg border border-amber-800/70 bg-amber-950/20 p-3">
              <p className="text-sm text-amber-200">
                Похоже на рекламу или промо — проверьте подсказки.
              </p>
              <ul className="mt-2 list-disc pl-5 text-xs text-neutral-300">
                {data.posts.filter((post) => post.suggestedPromotion).map((post) => (
                  <li key={post.telegramPostId}>{post.textStart}</li>
                ))}
              </ul>
              <Button
                className="mt-3"
                variant="secondary"
                disabled={classify.isPending}
                onClick={() => classify.mutate({
                  ids: data.posts.filter((post) => post.suggestedPromotion).map((post) => post.telegramPostId),
                  classification: "EXCLUDED",
                })}
              >
                Исключить все
              </Button>
            </section>
          )}
          {classify.isError && (
            <p role="alert" className="text-sm text-rose-300">
              Не удалось сохранить отметку.
            </p>
          )}
          <section className="space-y-2">
            <h3 className="text-sm font-medium">
              Медианный скор по происхождению
            </h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {data.summary.origin.map((item) => (
                <Metric
                  key={item.origin}
                  title={labels[item.origin] ?? item.origin}
                  value={scoreText(item.medianScore)}
                  detail={`${item.postCount} постов`}
                />
              ))}
            </div>
          </section>
          <section className="grid gap-4 lg:grid-cols-2">
            {Object.entries(data.breakdowns).map(([key, groups]) => (
              <div key={key} className="space-y-2">
                <h3 className="text-sm font-medium">{labels[key] ?? key}</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {groups.map((group) => (
                    <Metric
                      key={String(group.value)}
                      title={groupTitle(key, group.value)}
                      value={
                        group.postCount < 5
                          ? "мало данных"
                          : scoreText(group.medianScore)
                      }
                      detail={`n = ${group.postCount}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Публикации</h3>
            <div className="overflow-x-auto rounded-lg border border-neutral-800">
              <table className="min-w-[900px] w-full text-left text-xs">
                <thead className="bg-neutral-950 text-neutral-400">
                  <tr>
                    {[
                      "Дата",
                      "Источник",
                      "Начало текста",
                      "Просмотры 24ч / 72ч / 7д",
                      "Скор",
                      "ER / 1k",
                      "Исключение",
                    ].map((title) => (
                      <th key={title} className="px-3 py-2 font-medium">
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.posts.map((post) => (
                    <tr
                      key={post.telegramPostId}
                      className="border-t border-neutral-800"
                    >
                      <td className="whitespace-nowrap px-3 py-2">
                        {new Date(post.publishedAt).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="px-3 py-2">
                        {labels[post.origin] ?? post.origin}
                      </td>
                      <td className="max-w-sm px-3 py-2">
                        {post.textStart || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {numberText(post.views24h)} /{" "}
                        {numberText(post.views72h)} / {numberText(post.views7d)}
                      </td>
                      <td className="px-3 py-2">{scoreText(post.score)}</td>
                      <td className="px-3 py-2">
                        {post.engagementPer1k24h?.toFixed(1) ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {post.excludedReason ?? "—"}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {([
                            ["AD", "Реклама"],
                            ["MUTUAL_PROMO", "ВП / промо"],
                            ["EXCLUDED", "Исключить"],
                          ] as const).map(([classification, label]) => (
                            <button
                              key={classification}
                              type="button"
                              className="rounded border border-neutral-700 px-1.5 py-1 text-[10px] hover:bg-neutral-800"
                              aria-pressed={post.manualClassification === classification}
                              onClick={() => classify.mutate({
                                ids: [post.telegramPostId],
                                classification: post.manualClassification === classification ? null : classification,
                              })}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </Card>
  );
}

function groupTitle(key: string, value: Group["value"]) {
  if (key === "hourBlocks")
    return `${String(value).padStart(2, "0")}:00–${String(Number(value) + 2).padStart(2, "0")}:59`;
  return labels[String(value)] ?? String(value);
}

function Metric({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
      <p className="text-xs text-neutral-500">{title}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{detail}</p>
    </div>
  );
}
