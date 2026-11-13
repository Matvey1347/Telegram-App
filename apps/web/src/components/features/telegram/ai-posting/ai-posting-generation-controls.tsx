"use client";

import { RotateCw } from "lucide-react";
import { Button, Card, Input } from "@/components/ui/primitives";

export function AiPostingGenerationControls({
  dailyPostCount,
  requestedCount,
  pending,
  settingsReady,
  onCountChange,
  onGenerate,
}: {
  dailyPostCount: number;
  requestedCount: string;
  pending: boolean;
  settingsReady: boolean;
  onCountChange: (value: string) => void;
  onGenerate: () => void;
}) {
  return (
    <>
      <Card className="flex flex-wrap items-center justify-between gap-3 bg-neutral-900/60">
        <div>
          <h2 id="ai-posting-test-title" className="text-lg font-semibold">
            Тестирование AI Posting
          </h2>
          <p className="text-sm text-neutral-400">
            Публикации останутся в тестовом запуске, пока вы явно не сохраните
            черновик.
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Пачки сохраняются в истории ниже. Текст можно править прямо в превью,
            а заметки к тексту и медиа задаются отдельно.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="w-24 text-xs text-neutral-400">
            Число постов
            <Input
              aria-label="Число публикаций"
              type="number"
              min={1}
              max={5}
              value={requestedCount}
              disabled={pending}
              onChange={(event) => onCountChange(event.target.value)}
            />
          </label>
          <Button onClick={onGenerate} disabled={pending || !settingsReady}>
            {pending ? (
              <>
                <RotateCw size={16} className="animate-spin" /> Генерируем…
              </>
            ) : Number(requestedCount) === dailyPostCount ? (
              "Сгенерировать на день"
            ) : (
              `Сгенерировать · ${requestedCount} ${Number(requestedCount) === 1 ? "публикацию" : Number(requestedCount) < 5 ? "публикации" : "публикаций"}`
            )}
          </Button>
        </div>
      </Card>
      {!settingsReady && (
        <p className="text-sm text-amber-300">
          Сначала сохраните текущие настройки AI Posting.
        </p>
      )}
    </>
  );
}
