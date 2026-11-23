"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, Circle, CircleX, ListChecks, Loader2 } from "lucide-react";
import type { TelegramAiPostingRunProgress } from "@telegram-system/shared";
import { generationStageLabel, publicationBatchProgress } from "./ai-posting-test-console-model";

export function AiPostingRunProgress({ progress, active }: {
  progress: TelegramAiPostingRunProgress;
  active: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { percent, current, total } = publicationBatchProgress(progress);
  return (
    <div
      role="status"
      className={`rounded-lg border p-3 text-sm ${active ? "border-blue-900 bg-blue-950/30" : "border-neutral-700 bg-neutral-900"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>
          Публикация {Math.min(progress.publicationIndex + 1, progress.count)} из {progress.count}
          {active ? " · в процессе" : progress.failed ? " · есть ошибки" : progress.current >= progress.total
            ? Object.values(progress.stages).includes("MISSING") ? " · не все медиа найдены" : " · готово"
            : " · в процессе"}
        </strong>
        <span className="text-neutral-400">
          {percent}% · готово {progress.complete} из {total}
        </span>
      </div>
      {active && (
        <p className="mt-1 text-blue-200">
          {current === total
            ? "Сохраняю результаты"
            : generationStageLabel[progress.stage ?? ""] ?? "Подготавливаю запуск"}
          {current < total && progress.attempt && progress.attempt > 1 ? ` · попытка ${progress.attempt}` : ""}
        </p>
      )}
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800"
        role="progressbar"
        aria-label="Прогресс генерации AI Posting"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`Обработано ${current} из ${total}, готово ${progress.complete}`}
      >
        <div
          className="h-full rounded-full bg-blue-500 motion-safe:transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((expanded) => !expanded)}
        className="mt-2 inline-flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200"
      >
        <ChevronDown size={14} className={expanded ? "rotate-180" : ""} />
        {expanded ? "Скрыть этапы" : "Показать этапы"}
      </button>
      {expanded && Array.from({ length: progress.count }, (_, index) => (
        <div
          key={index}
          className="mt-3 rounded-md border border-neutral-800 bg-neutral-950/60 p-3 text-neutral-300"
        >
          <div className="flex items-center gap-2 font-medium text-neutral-100">
            <ListChecks
              aria-hidden="true"
              size={16}
              className="text-blue-300"
            />
            Публикация {index + 1}
          </div>
          <div className="mt-2 grid gap-1 pl-6 sm:grid-cols-2">
            {(["planning", "text", "review", "image"] as const).map(
              (stage) => {
                const status = progress.stages[`${index}:${stage}`];
                const label = {
                  planning: "Тема",
                  text: "Текст",
                  review: "Проверка",
                  image: "Медиа",
                }[stage];
                const statusLabel =
                  status === "COMPLETED"
                    ? "готово"
                    : status === "FAILED"
                      ? "ошибка"
                      : status === "RUNNING"
                        ? "в процессе"
                        : status === "MISSING" ? "не найдено" : "ожидает";
                const StatusIcon =
                  status === "COMPLETED"
                    ? CheckCircle2
                    : status === "FAILED"
                      ? CircleX
                      : status === "RUNNING"
                        ? Loader2
                        : Circle;
                const iconClass =
                  status === "COMPLETED"
                    ? "text-emerald-400"
                    : status === "FAILED"
                      ? "text-rose-400"
                      : status === "RUNNING"
                        ? "motion-safe:animate-spin text-blue-300"
                        : status === "MISSING" ? "text-amber-400" : "text-neutral-500";
                return (
                  <span
                    key={stage}
                    className="inline-flex items-center gap-1.5 text-sm"
                  >
                    <StatusIcon
                      aria-hidden="true"
                      size={15}
                      className={iconClass}
                    />
                    {label}: {statusLabel}
                  </span>
                );
              },
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
