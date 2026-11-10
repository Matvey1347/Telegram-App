"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Clock3,
  ImagePlus,
  RotateCw,
  Save,
  ThumbsDown,
  ThumbsUp,
  WandSparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  Button,
  Card,
  FormField,
  Input,
  StatusPill,
  Textarea,
} from "@/components/ui/primitives";
import { TelegramPostPreview } from "@/components/features/telegram/telegram/telegram-post-preview";

type Publication = {
  topic: string;
  title: string;
  text: string;
  imageUrl: string | null;
  imageSourceId: string | null;
  savedPostId: string | null;
  status: string;
  rejectionReason: string | null;
  format: string;
  category: string;
  costs: Record<string, string | null>;
  operations: Array<{
    stage: string;
    model: string;
    actualCost: string | null;
    pricingStatus?: string;
    status: string;
  }>;
  ideaSources: Array<{ id: string; type: string; value: string }>;
};
type TestRun = {
  id: string;
  version: number;
  status: string;
  settingsVersion: number;
  createdAt: string;
  publications: Publication[];
  failures: Array<{ topic?: string; code: string }>;
  feedback: Array<{
    id: string;
    feedback: string;
    key: string;
    value: string;
    reason: string;
    status: string;
  }>;
  planningCost?: string;
  textCost?: string;
  imageCost?: string;
  reviewCost?: string;
};
const key = (id: string) => ["telegram-ai-posting", id] as const;
const runsKey = (id: string) => [...key(id), "test-runs"] as const;

export function AiPostingTestConsole({
  channelId,
  channelTitle,
  settingsReady,
}: {
  channelId: string;
  channelTitle: string;
  settingsReady: boolean;
}) {
  const client = useQueryClient();
  const [reject, setReject] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const runs = useQuery({
    queryKey: runsKey(channelId),
    queryFn: async () =>
      (await api.get(`/telegram-channels/${channelId}/ai-posting/test-runs`))
        .data as TestRun[],
  });
  const generate = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/telegram-channels/${channelId}/ai-posting/generate`, {
          count: 3,
        })
      ).data as TestRun,
    onSuccess: async () =>
      client.invalidateQueries({ queryKey: runsKey(channelId) }),
    onError: async () =>
      client.invalidateQueries({ queryKey: runsKey(channelId) }),
  });
  const act = useMutation({
    mutationFn: async ({
      run,
      index,
      action,
      value,
    }: {
      run: TestRun;
      index: number;
      action: string;
      value?: string;
    }) =>
      (
        await api.post(
          `/telegram-channels/${channelId}/ai-posting/test-runs/${run.id}/review`,
          { index, expectedVersion: run.version, action, value },
        )
      ).data as TestRun,
    onSuccess: async (_data, variables) => {
      setEdits((current) => {
        const next = { ...current };
        delete next[`${variables.run.id}:${variables.index}`];
        return next;
      });
      return client.invalidateQueries({ queryKey: runsKey(channelId) });
    },
    onError: async () =>
      client.invalidateQueries({ queryKey: runsKey(channelId) }),
  });
  const suggest = useMutation({
    mutationFn: async ({ run, value }: { run: TestRun; value: string }) =>
      (
        await api.post(
          `/telegram-channels/${channelId}/ai-posting/test-runs/${run.id}/suggest-rule`,
          { expectedVersion: run.version, feedback: value },
        )
      ).data,
    onSuccess: async () =>
      client.invalidateQueries({ queryKey: runsKey(channelId) }),
  });
  const confirm = useMutation({
    mutationFn: async ({
      run,
      suggestionId,
    }: {
      run: TestRun;
      suggestionId: string;
    }) =>
      (
        await api.post(
          `/telegram-channels/${channelId}/ai-posting/test-runs/${run.id}/confirm-rule`,
          { expectedVersion: run.version, suggestionId },
        )
      ).data,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: runsKey(channelId) }),
        client.invalidateQueries({ queryKey: key(channelId) }),
      ]);
    },
  });
  const error = generate.error || act.error || suggest.error || confirm.error;
  return (
    <div className="space-y-4" aria-labelledby="ai-posting-test-title">
      <Card className="flex flex-wrap items-center justify-between gap-3 bg-neutral-900/60">
        <div>
          <h2 id="ai-posting-test-title" className="text-lg font-semibold">
            Тестирование AI Posting
          </h2>
          <p className="text-sm text-neutral-400">
            Публикации останутся в тестовом запуске, пока вы явно не сохраните
            черновик.
          </p>
        </div>
        <Button
          onClick={() => generate.mutate()}
          disabled={generate.isPending || !settingsReady}
        >
          {generate.isPending ? (
            <>
              <RotateCw size={16} className="animate-spin" /> Генерируем…
            </>
          ) : (
            "Сгенерировать 3 публикации"
          )}
        </Button>
      </Card>
      {!settingsReady && (
        <p className="text-sm text-amber-300">
          Сначала сохраните текущие настройки AI Posting.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-rose-900 bg-rose-950/30 p-3 text-sm text-rose-200"
        >
          Не удалось выполнить действие. Обновите список запусков и повторите.
        </p>
      )}
      {generate.isPending && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-neutral-800 p-4 text-sm text-neutral-300"
        >
          Идёт реальная генерация через AI Gateway. Текст и изображения проходят
          проверку.
        </div>
      )}
      {runs.isLoading && (
        <div className="rounded-lg border border-neutral-800 p-4 text-sm text-neutral-400">
          Загружаем историю тестов…
        </div>
      )}
      {runs.isError && (
        <div
          role="alert"
          className="rounded-lg border border-rose-900 p-4 text-sm text-rose-200"
        >
          Не удалось загрузить историю тестов.
        </div>
      )}
      {(runs.data ?? []).map((run) => (
        <Card key={run.id} className="space-y-4 bg-neutral-900/40">
          <header className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <Clock3 size={15} />
              <strong>{new Date(run.createdAt).toLocaleString()}</strong>
              <StatusPill value={run.status.toLowerCase()} />
            </div>
            <span className="text-neutral-400">
              Версия настроек {run.settingsVersion} · запуск v{run.version}
            </span>
          </header>
          {run.failures?.map((failure, i) => (
            <p
              key={`${failure.code}-${i}`}
              className="rounded-md border border-amber-900/70 bg-amber-950/20 p-2 text-sm text-amber-200"
            >
              Неудача {failure.topic ? `«${failure.topic}»` : "этапа запуска"}:{" "}
              {failure.code}
            </p>
          ))}
          <div className="space-y-5">
            {(run.publications ?? []).map((post, index) => (
              <div
                key={`${index}-${post.topic}`}
                className="grid min-w-0 gap-4 border-t border-neutral-800 pt-4"
              >
                <div className="min-w-0">
                  <TelegramPostPreview
                    channelTitle={channelTitle}
                    text={edits[`${run.id}:${index}`] ?? post.text}
                    imageUrls={post.imageUrl ? [post.imageUrl] : []}
                  />
                  <p className="mt-2 text-xs text-neutral-400">
                    Идея: {post.topic} · Источники идеи:{" "}
                    {post.ideaSources?.length
                      ? post.ideaSources
                          .map((source) => source.value)
                          .join(", ")
                      : "редакционный профиль и история канала"}
                    {post.imageSourceId
                      ? ` · Изображение: ${post.imageSourceId}`
                      : ""}
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs">
                      {post.status}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {post.category} · {post.format}
                    </span>
                  </div>
                  <FormField label="Текст публикации">
                    <Textarea
                      aria-label="Редактировать текст публикации"
                      value={edits[`${run.id}:${index}`] ?? post.text}
                      disabled={Boolean(post.savedPostId)}
                      onChange={(e) =>
                        setEdits((v) => ({
                          ...v,
                          [`${run.id}:${index}`]: e.target.value,
                        }))
                      }
                      rows={8}
                      className="mt-1 min-h-40 bg-neutral-950"
                    />
                  </FormField>
                  <details className="rounded-lg border border-neutral-800 p-3">
                    <summary className="cursor-pointer text-sm">
                      Модели и расходы
                    </summary>
                    <div className="mt-2 space-y-1 text-xs text-neutral-400">
                      {post.operations.map((op, i) => (
                        <p key={`${op.stage}-${i}`}>
                          {op.stage}: {op.model} ·{" "}
                          {op.actualCost === null
                            ? op.pricingStatus === "NOT_SENT"
                              ? "$0.00 (не отправлен)"
                              : "UNKNOWN/UNPRICED"
                            : `$${op.actualCost}`}{" "}
                          · {op.status}
                        </p>
                      ))}
                      {Object.entries(post.costs).map(([stage, cost]) => (
                        <p key={stage}>
                          Итого {stage}: {money(cost)}
                        </p>
                      ))}
                      <p className="border-t border-neutral-800 pt-2 font-medium text-neutral-200">
                        Текст {money(post.costs.text)} · Изображение{" "}
                        {money(post.costs.image)} · Прочие операции{" "}
                        {money(
                          addMoney(post.costs.planning, post.costs.review),
                        )}{" "}
                        · Всего {money(totalCost(post.costs))}
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        Доля планирования распределена между публикациями
                        превью; в AI Gateway операция планирования учитывается
                        один раз.
                      </p>
                    </div>
                  </details>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={act.isPending || Boolean(post.savedPostId)}
                      onClick={() =>
                        act.mutate({ run, index, action: "approve" })
                      }
                    >
                      <ThumbsUp size={15} /> Одобрить
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={act.isPending || Boolean(post.savedPostId)}
                      onClick={() =>
                        act.mutate({
                          run,
                          index,
                          action: "edit",
                          value: edits[`${run.id}:${index}`] ?? post.text,
                        })
                      }
                    >
                      <Check size={15} /> Сохранить текст
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={act.isPending || Boolean(post.savedPostId)}
                      onClick={() =>
                        act.mutate({
                          run,
                          index,
                          action: "regenerate-text",
                          value: reject[`${run.id}:${index}`],
                        })
                      }
                    >
                      <WandSparkles size={15} /> Перегенерировать текст
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={act.isPending || Boolean(post.savedPostId)}
                      onClick={() =>
                        act.mutate({
                          run,
                          index,
                          action: "save",
                          value: edits[`${run.id}:${index}`] ?? post.text,
                        })
                      }
                    >
                      <Save size={15} /> Сохранить черновик
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={act.isPending || Boolean(post.savedPostId)}
                      onClick={() =>
                        act.mutate({ run, index, action: "regenerate-image" })
                      }
                    >
                      <ImagePlus size={15} /> Новое изображение
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      aria-label="Причина отклонения или пожелание к тексту"
                      value={reject[`${run.id}:${index}`] ?? ""}
                      onChange={(e) =>
                        setReject((v) => ({
                          ...v,
                          [`${run.id}:${index}`]: e.target.value,
                        }))
                      }
                      placeholder="Почему не подошла или что улучшить?"
                      className="min-w-0 flex-1"
                    />
                    <Button
                      variant="secondary"
                      disabled={
                        act.isPending ||
                        Boolean(post.savedPostId) ||
                        !(reject[`${run.id}:${index}`] ?? "").trim()
                      }
                      onClick={() =>
                        act.mutate({
                          run,
                          index,
                          action: "reject",
                          value: reject[`${run.id}:${index}`],
                        })
                      }
                    >
                      <ThumbsDown size={15} /> Отклонить
                    </Button>
                  </div>
                  {post.rejectionReason && (
                    <p className="text-xs text-amber-300">
                      Причина: {post.rejectionReason}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <footer className="flex flex-wrap gap-4 border-t border-neutral-800 pt-3 text-xs text-neutral-400">
            <span>Планирование: {run.planningCost ?? "—"}</span>
            <span>Текст: {run.textCost ?? "—"}</span>
            <span>Изображения: {run.imageCost ?? "—"}</span>
            <span>Проверки: {run.reviewCost ?? "—"}</span>
          </footer>
          <div className="space-y-3 border-t border-neutral-800 pt-3">
            <label className="block text-sm font-medium">
              Что нужно изменить в редакционных правилах?
              <Textarea
                value={feedback[run.id] ?? ""}
                onChange={(e) =>
                  setFeedback((v) => ({ ...v, [run.id]: e.target.value }))
                }
                rows={2}
                placeholder="Например: меньше вводных фраз, больше практических примеров"
              />
            </label>
            <Button
              variant="secondary"
              disabled={suggest.isPending || !(feedback[run.id] ?? "").trim()}
              onClick={() => suggest.mutate({ run, value: feedback[run.id] })}
            >
              Предложить изменение правил
            </Button>
            {(run.feedback ?? [])
              .filter((item) => item.status === "PENDING_CONFIRMATION")
              .map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-blue-900/60 bg-blue-950/20 p-3 text-sm"
                >
                  <p>
                    <strong>Предложение:</strong> {item.key} → {item.value}
                  </p>
                  <p className="mt-1 text-neutral-300">{item.reason}</p>
                  <Button
                    className="mt-2"
                    variant="secondary"
                    disabled={confirm.isPending}
                    onClick={() =>
                      confirm.mutate({ run, suggestionId: item.id })
                    }
                  >
                    Подтвердить и применить
                  </Button>
                </div>
              ))}
          </div>
        </Card>
      ))}
      {!runs.isLoading && !runs.isError && !runs.data?.length && (
        <p className="rounded-lg border border-dashed border-neutral-700 p-6 text-center text-sm text-neutral-400">
          Тестовых запусков пока нет.
        </p>
      )}
    </div>
  );
}

function money(value: string | null | undefined) {
  return value === null || value === undefined
    ? "UNKNOWN/UNPRICED"
    : `$${value}`;
}

function addMoney(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  if (
    left === null ||
    left === undefined ||
    right === null ||
    right === undefined
  )
    return null;
  return addDecimalStrings([left, right]);
}

function totalCost(costs: Record<string, string | null>) {
  const values = ["planning", "text", "image", "review"].map(
    (stage) => costs[stage],
  );
  if (values.some((value) => value === null || value === undefined))
    return null;
  return addDecimalStrings(values as string[]);
}

function addDecimalStrings(values: string[]) {
  const scale = 12;
  const factor = BigInt(10) ** BigInt(scale);
  const total = values.reduce((sum, value) => {
    const [whole, fraction = ""] = value.split(".");
    return (
      sum +
      BigInt(whole) * factor +
      BigInt(fraction.padEnd(scale, "0").slice(0, scale))
    );
  }, BigInt(0));
  const whole = total / factor;
  const fraction = String(total % factor)
    .padStart(scale, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}
