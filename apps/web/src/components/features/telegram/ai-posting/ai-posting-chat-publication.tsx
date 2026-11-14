"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/primitives";
import { aiPostingTestRunKeys, failureMessage, resolveTestConsoleError, type TestRun } from "./ai-posting-test-console-model";

type Publication = { title: string; text: string; imageUrl?: string | null };
type Current = { runId: string; version: number; publication: Publication };

export function AiPostingChatPublication({ channelId, topic, feedback, settingsReady = true, onCurrentChange, revisedPublication }: { channelId: string; topic: string; feedback: string; settingsReady?: boolean; onCurrentChange?: (current: { runId: string; version: number; index: number } | null) => void; revisedPublication?: Current | null }) {
  const client = useQueryClient();
  const [current, setCurrent] = useState<Current | null>(null);
  const runs = useQuery({ queryKey: aiPostingTestRunKeys(channelId).runs, queryFn: async () => (await api.get(`/telegram-channels/${channelId}/ai-posting/test-runs`)).data as TestRun[], staleTime: 30000 });
  const latest = (Array.isArray(runs.data) ? runs.data : []).find((run) => run.publications?.[0] && !run.publications[0].savedPostId && run.publications[0].status !== "SAVED_DRAFT");
  const effective = current && revisedPublication?.runId === current.runId && revisedPublication.version > current.version ? revisedPublication : current;
  useEffect(() => { onCurrentChange?.(effective ? { runId: effective.runId, version: effective.version, index: 0 } : null); }, [effective, onCurrentChange]);
  const generate = useMutation({
    mutationFn: async () => (await api.post(`/telegram-channels/${channelId}/ai-posting/chat/generate`, { topic: topic.slice(0, 200) })).data as { runId: string; version: number; generated: Publication[]; failures?: unknown[] },
    onError: async () => { await client.invalidateQueries({ queryKey: aiPostingTestRunKeys(channelId).runs }); },
    onSuccess: async (result) => {
      const next = result.generated[0] ? { runId: result.runId, version: result.version, publication: result.generated[0] } : null;
      setCurrent(next);
      onCurrentChange?.(next ? { runId: next.runId, version: next.version, index: 0 } : null);
      await client.invalidateQueries({ queryKey: aiPostingTestRunKeys(channelId).runs });
    },
  });
  const revise = useMutation({
    mutationFn: async () => {
      if (!effective) throw new Error("NO_PUBLICATION");
      return (await api.post(`/telegram-channels/${channelId}/ai-posting/test-runs/${effective.runId}/review`, { index: 0, expectedVersion: effective.version, action: "regenerate-text", value: feedback })).data as { version: number; publications: Publication[] };
    },
    onSuccess: async (result) => {
      if (effective && result.publications[0]) {
        setCurrent({ ...effective, version: result.version, publication: result.publications[0] });
        onCurrentChange?.({ runId: effective.runId, version: result.version, index: 0 });
      }
      await client.invalidateQueries({ queryKey: aiPostingTestRunKeys(channelId).runs });
    },
  });
  return <div className="space-y-2 border-t border-neutral-800 pt-3">
    <p className="text-xs text-neutral-400">{topic ? `Предложенная тема: ${topic}` : "Обсудите с ассистентом тему пробной публикации."} Правки вводятся в поле сообщения.</p>
    {!effective && latest && <Button type="button" variant="secondary" onClick={() => { const next = { runId: latest.id, version: latest.version, publication: latest.publications[0] }; setCurrent(next); onCurrentChange?.({ runId: next.runId, version: next.version, index: 0 }); }}>Выбрать последнюю публикацию</Button>}
    <Button type="button" disabled={!settingsReady || !topic || generate.isPending || revise.isPending} onClick={() => generate.mutate()}>{generate.isPending ? "Создаём публикацию…" : "Попробовать сгенерировать публикацию"}</Button>
    {generate.isError && <p role="alert" className="text-sm text-rose-300">{failureMessage[resolveTestConsoleError(generate.error).code] ?? "Не удалось создать публикацию. Подробности доступны в последней генерации."}</p>}
    {generate.isSuccess && !effective && <p role="alert" className="text-sm text-rose-300">Публикация не создана. Подробности доступны в последней генерации.</p>}
    {effective && <div className="space-y-2 rounded-lg border border-neutral-700 p-3">
      <p className="text-sm font-medium">{effective.publication.title}</p>
      <p className="whitespace-pre-wrap text-sm">{effective.publication.text}</p>
      <p className="text-xs text-neutral-400">{effective.publication.imageUrl ? "Медиа доступно в карточке публикации." : "Медиа не создано. Проверьте результат в карточке публикации."}</p>
      <Button type="button" variant="secondary" disabled={!settingsReady || !feedback.trim() || generate.isPending || revise.isPending} onClick={() => revise.mutate()}>{revise.isPending ? "Дорабатываем…" : "Применить правки из поля к этой публикации"}</Button>
      {revise.isError && <p role="alert" className="text-sm text-rose-300">Не удалось применить правки. Публикация могла измениться: проверьте её карточку и повторите.</p>}
    </div>}
  </div>;
}
