"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Play, Square } from "lucide-react";
import { Button, Card, FormField, Input } from "@/components/ui/primitives";
import { AiPostingModeFields, type AiPostingMode } from "./ai-posting-mode-fields";

type Settings = {
  mode: AiPostingMode;
  draftExpirationDays: number;
  configured: boolean;
  autopilotEnabled?: boolean;
  autopilot: {
    postsPerDay: number;
    targetReadyDrafts: number;
    maxReadyDrafts: number;
    targetCoverageDays: number;
    criticalCoverageDays: number;
    aiMonthlyBudget?: string;
    lastStatus?: string | null;
    lastError?: string | null;
    lastSummary?: { scheduleMode?: string } | null;
  };
};
const settingsKey = (channelId: string) => ["telegram-ai-posting", channelId] as const;

export function AiPostingAutopilotSettingsSection({
  channelId,
  settings,
  lookupsReady,
  pending,
  error,
  onStart,
  onStop,
}: {
  channelId: string;
  settings: Settings;
  lookupsReady: boolean;
  pending: boolean;
  error: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const client = useQueryClient();
  const autopilot = settings.mode !== "TEST";
  const update = (patch: Partial<Settings>) =>
    client.setQueryData<Settings>(settingsKey(channelId), (old) =>
      old ? { ...old, ...patch } : old,
    );
  const updateAutopilot = (name: keyof Settings["autopilot"], value: number | string) =>
    client.setQueryData<Settings>(settingsKey(channelId), (old) =>
      old ? { ...old, autopilot: { ...old.autopilot, [name]: value } } : old,
    );
  return (
    <Card className="space-y-4 bg-neutral-900/60">
      <h2 className="text-lg font-semibold">Состояние</h2>
      <p className="text-sm text-neutral-400">
        {autopilot
          ? "Автопилот поддерживает запас черновиков и покрытие календаря. Публикации остаются под контролем обычного механизма Nexeloq."
          : "Автоматизация выключена. Готовые черновики и запланированные публикации сохраняются при остановке."}
      </p>
      <div className="grid gap-3 2xl:grid-cols-2">
        <AiPostingModeFields
          mode={settings.mode}
          draftExpirationDays={settings.draftExpirationDays}
          onModeChange={(mode) =>
            update({ mode, autopilotEnabled: mode !== "TEST" } as Partial<Settings>)
          }
          onDraftExpirationChange={(draftExpirationDays) => update({ draftExpirationDays })}
        />
        {(
          [
            ["postsPerDay", "Постов в сутки", 1, 20],
            ["targetReadyDrafts", "Целевой запас DRAFT", 0, 500],
            ["maxReadyDrafts", "Максимальный запас", 1, 500],
            ["targetCoverageDays", "Покрытие расписания, дней", 1, 62],
            ["criticalCoverageDays", "Критический минимум, дней", 1, 62],
          ] as const
        ).map(([name, label, min, max]) => (
          <FormField key={name} label={label}>
            <Input
              type="number"
              min={min}
              max={max}
              value={settings.autopilot[name]}
              onChange={(event) => updateAutopilot(name, Number(event.target.value))}
            />
          </FormField>
        ))}
      </div>
      <p className="text-xs text-neutral-500">
        Проверка дефицита выполняется по расписанию раз в неделю. Планирование
        использует часовой пояс рабочего пространства и активные слоты календаря.
      </p>
      <FormField label="Месячный лимит AI, USD">
        <Input
          type="number"
          min="0"
          step="0.01"
          value={settings.autopilot.aiMonthlyBudget ?? ""}
          placeholder="Без дополнительного лимита канала"
          onChange={(event) => updateAutopilot("aiMonthlyBudget", event.target.value)}
        />
      </FormField>
      {settings.autopilot.lastStatus && (
        <p className="text-sm text-neutral-300">
          Последний запуск: {settings.autopilot.lastStatus}
          {settings.autopilot.lastError ? ` · ${settings.autopilot.lastError}` : ""}
        </p>
      )}
      {settings.autopilot.lastSummary?.scheduleMode && (
        <p className="text-sm text-neutral-400">
          Режим расписания: {settings.autopilot.lastSummary.scheduleMode}
        </p>
      )}
      <div className="flex gap-2">
        <Button disabled={pending || autopilot || (!settings.configured && !lookupsReady)} onClick={onStart}>
          <Play size={16} /> Включить автопилот
        </Button>
        <Button variant="secondary" disabled={pending || !autopilot} onClick={onStop}>
          <Square size={16} /> Остановить автопилот
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-300">Не удалось изменить режим автопилота.</p>}
    </Card>
  );
}
