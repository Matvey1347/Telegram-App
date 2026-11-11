"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Textarea } from "@/components/ui/primitives";
import { TelegramPostPreview } from "@/components/features/telegram/telegram/telegram-post-preview";

type Publication = {
  topic?: string;
  title: string;
  text: string;
  imageUrl?: string | null;
  imageUrls?: string[];
  status?: string;
  reviewQueue?: boolean;
};
type TestRun = {
  id: string;
  version: number;
  createdAt: string;
  publications: Publication[];
};

export function AiPostingReviewQueue({
  channelId,
  channelTitle,
  active,
}: {
  channelId: string;
  channelTitle: string;
  active: boolean;
}) {
  const client = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const key = ["telegram-ai-posting-review-queue", channelId] as const;
  const query = useQuery<TestRun[]>({
    queryKey: key,
    queryFn: async () =>
      (await api.get(`/telegram-channels/${channelId}/ai-posting/test-runs`))
        .data as TestRun[],
    enabled: Boolean(active && channelId),
  });
  const act = async (
    run: TestRun,
    index: number,
    action: "approve" | "edit" | "reject" | "save",
    value?: string,
  ) => {
    const result = await api.post(
      `/telegram-channels/${channelId}/ai-posting/test-runs/${run.id}/review`,
      { index, expectedVersion: run.version, action, value },
    );
    run.version = result.data.version;
  };
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({
        queryKey: ["telegram-ai-posting", channelId, "test-runs"],
      }),
    ]);
  };
  const approve = useMutation({
    mutationFn: async ({ run, index }: { run: TestRun; index: number }) => {
      const editKey = `${run.id}:${index}`;
      if (edits[editKey] !== undefined) {
        await act(run, index, "edit", edits[editKey]);
        await act(run, index, "approve");
      } else await act(run, index, "approve");
      await act(run, index, "save");
    },
    onSuccess: refresh,
  });
  const reject = useMutation({
    mutationFn: async ({ run, index }: { run: TestRun; index: number }) => {
      const reason = reasons[`${run.id}:${index}`]?.trim();
      if (!reason) throw new Error("Укажите причину отклонения.");
      await act(run, index, "reject", reason);
    },
    onSuccess: refresh,
  });
  const bulkApprove = useMutation({
    mutationFn: async (items: Array<{ run: TestRun; index: number }>) => {
      for (const item of items) {
        await act(item.run, item.index, "approve");
        await act(item.run, item.index, "save");
      }
    },
    onSuccess: refresh,
  });
  if (!active) return null;
  const pending = (query.data ?? []).flatMap((run) =>
    run.publications.flatMap((post, index) =>
      post.reviewQueue && (post.status === "PENDING" || !post.status)
        ? [{ run, post, index }]
        : [],
    ),
  );
  return (
    <Card className="space-y-4 border border-amber-800/60 bg-amber-950/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">На одобрении</h2>
          <p className="text-sm text-neutral-400">
            Публикации сохраняются только после вашего решения.
          </p>
        </div>
        {pending.length > 1 && (
          <Button
            variant="secondary"
            disabled={bulkApprove.isPending}
            onClick={() =>
              bulkApprove.mutate(pending.map(({ run, index }) => ({ run, index })))
            }
          >
            Одобрить все ({pending.length})
          </Button>
        )}
      </div>
      {query.isLoading ? (
        <p role="status" className="text-sm text-neutral-400">Загружаем очередь…</p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-rose-300">Не удалось загрузить очередь.</p>
      ) : pending.length ? (
        pending.map(({ run, post, index }) => {
          const itemKey = `${run.id}:${index}`;
          return (
            <div key={itemKey} className="space-y-3 rounded-lg border border-neutral-800 p-3">
              <p className="text-xs text-neutral-500">
                {new Date(run.createdAt).toLocaleString("ru-RU")} · {post.topic || post.title}
              </p>
              <TelegramPostPreview
                channelTitle={channelTitle}
                text={edits[itemKey] ?? post.text}
                imageUrls={post.imageUrls ?? (post.imageUrl ? [post.imageUrl] : [])}
              />
              <Textarea
                aria-label="Редактировать перед одобрением"
                rows={5}
                value={edits[itemKey] ?? post.text}
                onChange={(event) =>
                  setEdits((current) => ({ ...current, [itemKey]: event.target.value }))
                }
              />
              <Textarea
                aria-label="Причина отклонения"
                rows={2}
                value={reasons[itemKey] ?? ""}
                onChange={(event) =>
                  setReasons((current) => ({ ...current, [itemKey]: event.target.value }))
                }
                placeholder="Причина отклонения"
              />
              <div className="flex flex-wrap gap-2">
                <Button disabled={approve.isPending} onClick={() => approve.mutate({ run, index })}>
                  {edits[itemKey] !== undefined ? "Сохранить правку и одобрить" : "Одобрить"}
                </Button>
                <Button variant="secondary" disabled={reject.isPending} onClick={() => reject.mutate({ run, index })}>
                  Отклонить
                </Button>
              </div>
            </div>
          );
        })
      ) : (
        <p className="text-sm text-neutral-400">Новых публикаций на одобрении нет.</p>
      )}
      {(approve.isError || reject.isError || bulkApprove.isError) && (
        <p role="alert" className="text-sm text-rose-300">Не удалось обработать публикацию. Обновите очередь и повторите действие.</p>
      )}
    </Card>
  );
}
