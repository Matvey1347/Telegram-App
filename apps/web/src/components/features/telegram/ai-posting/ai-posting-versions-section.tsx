"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card } from "@/components/ui/primitives";
import { api } from "@/lib/api";

type Version = {
  id: string;
  version: number;
  changeSource: string;
  createdAt: string;
};
const settingsKey = (id: string) => ["telegram-ai-posting", id] as const;

export function AiPostingVersionsSection({
  channelId,
  active,
}: {
  channelId: string;
  active: boolean;
}) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const versions = useQuery({
    queryKey: [...settingsKey(channelId), "versions"],
    enabled: active,
    queryFn: async () =>
      (await api.get(`/telegram-channels/${channelId}/ai-posting/versions`))
        .data as Version[],
  });
  const detail = useQuery({
    queryKey: [...settingsKey(channelId), "versions", selected],
    enabled: active && selected !== null,
    queryFn: async () =>
      (
        await api.get(
          `/telegram-channels/${channelId}/ai-posting/versions/${selected}`,
        )
      ).data as { configuration: unknown },
  });
  const rollback = useMutation({
    mutationFn: async (version: number) =>
      api.post(
        `/telegram-channels/${channelId}/ai-posting/versions/${version}/rollback`,
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries(
          { queryKey: settingsKey(channelId) },
          { throwOnError: true },
        ),
        client.invalidateQueries(
          { queryKey: [...settingsKey(channelId), "versions"] },
          { throwOnError: true },
        ),
      ]);
    },
  });
  const versionRows = Array.isArray(versions.data) ? versions.data : [];
  return (
    <Card className="space-y-3 bg-neutral-900/60">
      <h2 className="text-lg font-semibold">История профиля</h2>
      {versions.isLoading ? (
        <p className="text-sm text-neutral-400">Загружаем версии…</p>
      ) : null}
      {versions.isError ? (
        <p role="alert" className="text-sm text-rose-300">
          Не удалось загрузить историю.
        </p>
      ) : null}
      {versionRows.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-3 border-b border-neutral-800 py-2"
        >
          <div>
            <p className="text-sm">
              Версия {item.version} · {item.changeSource}
            </p>
            <p className="text-xs text-neutral-500">
              {new Date(item.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSelected(item.version)}
            >
              Просмотреть
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={rollback.isPending}
              onClick={() => rollback.mutate(item.version)}
            >
              Откатить
            </Button>
          </div>
        </div>
      ))}
      {rollback.isError ? (
        <p role="alert" className="text-sm text-rose-300">
          Не удалось создать версию из выбранного снимка.
        </p>
      ) : null}
      {selected !== null && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Содержимое версии {selected}</h3>
          {detail.isLoading ? (
            <p className="text-sm text-neutral-400">Загружаем снимок…</p>
          ) : null}
          {detail.isError ? (
            <p role="alert" className="text-sm text-rose-300">
              Не удалось загрузить снимок.
            </p>
          ) : null}
          {detail.data ? (
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-neutral-950 p-3 text-xs">
              {JSON.stringify(detail.data.configuration, null, 2)}
            </pre>
          ) : null}
        </div>
      )}
    </Card>
  );
}
