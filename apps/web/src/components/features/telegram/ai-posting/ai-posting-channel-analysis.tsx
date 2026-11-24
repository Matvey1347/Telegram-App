"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, LoaderCircle, ScanSearch } from "lucide-react";
import type { TelegramAiPostingChannelAnalysis } from "@telegram-system/shared";
import { Button, Modal } from "@/components/ui/primitives";
import { api } from "@/lib/api";

export function AiPostingChannelAnalysis({
  channelId,
  version,
  dirty,
  onUse,
}: {
  channelId: string;
  version: number;
  dirty: boolean;
  onUse: (configuration: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const analysis = useMutation({
    mutationFn: async () => (await api.post<TelegramAiPostingChannelAnalysis>(
      `/telegram-channels/${channelId}/ai-posting/channel-analysis`,
    )).data,
  });
  const proposal = analysis.data;
  const stale = proposal && proposal.configurationVersion !== version;
  const writing = proposal?.configuration.style;
  const visuals = proposal?.configuration.visualStyle;
  const error = analysis.error as { response?: { data?: { message?: string } } } | null;
  const code = error?.response?.data?.message;
  const download = () => {
    if (!proposal) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(proposal, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `ai-posting-analysis-${channelId}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <>
    <Button type="button" variant="primary" className="ml-auto shrink-0" onClick={() => setOpen(true)}>
      <ScanSearch size={16} aria-hidden="true" /> Детальный анализ канала
    </Button>
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Детальный анализ канала"
      size="xl"
      footer={<div className="flex flex-wrap justify-end gap-2">
        {proposal && <>
          <Button type="button" variant="secondary" onClick={download}>
            <Download size={16} /> Скачать JSON
          </Button>
          <Button type="button" disabled={dirty || stale || analysis.isPending} onClick={() => {
            if (dirty || stale) return;
            onUse(proposal.configuration);
            setOpen(false);
          }}>
            Подставить в настройки
          </Button>
        </>}
        <Button type="button" variant={proposal && !stale ? "secondary" : "primary"} disabled={dirty || analysis.isPending} onClick={() => analysis.mutate()}>
          {analysis.isPending && <LoaderCircle size={16} className="animate-spin" />}
          {analysis.isPending ? "Анализируем…" : proposal ? "Обновить анализ" : "Запустить анализ"}
        </Button>
      </div>}
    >
      <div className="space-y-3 text-sm">
        {!proposal && <p className="text-neutral-300">
          AI изучит редакционную историю канала, сравнит посты по результатам за первые 24 часа и предложит настройки для будущих публикаций.
        </p>}
        {dirty && <p className="text-amber-200">Сохраните текущие правки перед анализом или подстановкой настроек.</p>}
        {stale && <p className="text-amber-200">Настройки изменились после запуска. Повторите анализ для актуальной версии.</p>}
        {analysis.isPending && <p role="status">Собираем статистику, изучаем тексты и примеры изображений.</p>}
        {analysis.isError && <p role="alert" className="text-rose-300">
          {code === "AI_POSTING_CHANNEL_HISTORY_EMPTY"
            ? "В истории канала пока нет редакционных постов с текстом."
            : `Не удалось завершить анализ.${typeof code === "string" ? ` ${code}` : ""}`}
        </p>}
        {proposal && <>
          <dl className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-800 p-3 sm:grid-cols-4">
            {[
              ["Постов в истории", proposal.coverage.organicPosts],
              ["С оценкой за 24 ч", proposal.coverage.scoredPosts],
              ["Примеров текста", proposal.coverage.sampledPosts],
              ["Примеров изображений", proposal.coverage.visualExamples],
            ].map(([label, value]) => <div key={label}><dt className="text-neutral-400">{label}</dt><dd>{value}</dd></div>)}
          </dl>
          <p className="text-neutral-400">
            {proposal.coverage.firstPost.slice(0, 10)} — {proposal.coverage.lastPost.slice(0, 10)}. Из редакционной выборки исключено {proposal.coverage.excludedPosts} постов. Для весов сфер классифицировано {proposal.coverage.classifiedPosts}.
          </p>
          <p className="whitespace-pre-wrap break-words">{proposal.findings}</p>
          {proposal.performanceExamples && proposal.coverage.scoredPosts > 0 && <details>
            <summary className="cursor-pointer font-medium">Примеры результатов за 24 часа</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {(["high", "low"] as const).map((group) => <section key={group}>
                <h3 className="font-medium">{group === "high" ? "Высокие оценки" : "Низкие оценки"}</h3>
                <ul className="mt-1 text-neutral-300">
                  {proposal.performanceExamples[group].map(({ messageId, score24h, engagementPer1k24h }) =>
                    <li key={messageId} className="tabular-nums">
                      #{messageId} · {score24h.toFixed(2)}× нормы
                      {engagementPer1k24h != null && ` · ${engagementPer1k24h.toFixed(1)} действий / 1000`}
                    </li>,
                  )}
                </ul>
              </section>)}
            </div>
          </details>}
          {typeof writing === "string" && writing && <details>
            <summary className="cursor-pointer font-medium">Предложенный редакционный стиль</summary>
            <p className="mt-1 whitespace-pre-wrap text-neutral-300">{writing}</p>
          </details>}
          {typeof visuals === "string" && visuals && <details>
            <summary className="cursor-pointer font-medium">Предложенный визуальный стиль</summary>
            <p className="mt-1 whitespace-pre-wrap text-neutral-300">{visuals}</p>
          </details>}
          <p className="text-neutral-400">Подставьте предложение, чтобы проверить его во вкладках. Сохраните настройки перед тестовой генерацией.</p>
        </>}
      </div>
    </Modal>
  </>;
}
