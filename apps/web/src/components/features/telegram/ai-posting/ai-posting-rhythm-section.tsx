"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card } from "@/components/ui/primitives";

type Rhythm = {
  postsPerDay: number;
  slots: string[];
  samplePosts: number;
  advertisingShare: number;
  timezone: string;
};

export function AiPostingRhythmSection({
  channelId,
  active,
}: {
  channelId: string;
  active: boolean;
}) {
  const client = useQueryClient();
  const key = ["telegram-ai-posting-rhythm", channelId] as const;
  const query = useQuery<Rhythm>({
    queryKey: key,
    queryFn: async () =>
      (await api.get(`/telegram-channels/${channelId}/ai-posting/rhythm`))
        .data as Rhythm,
    enabled: Boolean(active && channelId),
  });
  const apply = useMutation({
    mutationFn: async () =>
      (
        await api.post(
          `/telegram-channels/${channelId}/ai-posting/rhythm/apply`,
        )
      ).data,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: key }),
        client.invalidateQueries({
          queryKey: ["telegram-ai-posting", channelId],
        }),
      ]);
    },
  });
  if (!active) return null;
  return (
    <Card className="space-y-3 border border-neutral-800 bg-neutral-900/60 p-4">
      <div>
        <h3 className="font-medium">Предложение по ритму</h3>
        <p className="mt-1 text-sm text-neutral-400">
          Расчёт по последним 28 дням без рекламы. {query.data
            ? `${query.data.samplePosts} публикаций, реклама — ${Math.round(query.data.advertisingShare * 100)}%.`
            : ""}
        </p>
      </div>
      {query.isLoading ? (
        <p role="status" className="text-sm text-neutral-400">
          Рассчитываем ритм…
        </p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-rose-300">
          Не удалось рассчитать ритм.
        </p>
      ) : query.data ? (
        <>
          <p className="text-sm text-neutral-200">
            {query.data.postsPerDay} поста в день · {query.data.slots.join(", ")} ·{" "}
            {query.data.timezone}
          </p>
          <Button
            variant="secondary"
            disabled={apply.isPending || query.data.samplePosts < 8}
            onClick={() => apply.mutate()}
          >
            {apply.isPending ? "Применяем…" : "Применить предложение"}
          </Button>
          {apply.isError && (
            <p role="alert" className="text-sm text-rose-300">
              Не удалось применить ритм к календарю.
            </p>
          )}
          {apply.isSuccess && (
            <p role="status" className="text-sm text-emerald-300">
              Ритм и слоты календаря обновлены.
            </p>
          )}
        </>
      ) : null}
    </Card>
  );
}
