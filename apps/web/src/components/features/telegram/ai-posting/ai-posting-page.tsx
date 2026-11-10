"use client";

import { useState } from "react";
import { Plus, CheckCircle2, Save, Play, Square } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  CustomSelect,
  FormField,
  Input,
  Textarea,
  ToggleRow,
} from "@/components/ui/primitives";
import { DateInput } from "@/components/ui/date-inputs";
import { api } from "@/lib/api";
import { AiPostingSourcesSection } from "./ai-posting-sources-section";
import { AiPostingTestConsole } from "./ai-posting-test-console";
import { AiPostingAutopilotHistory } from "./ai-posting-autopilot-history";
import { AiPostingAnalytics } from "./ai-posting-analytics";
import {
  AiPostingSettingsTabs,
  type AiPostingSettingsTab,
} from "./ai-posting-settings-tabs";

type Source = {
  id: string;
  type: "website" | "rss" | "telegram" | "history";
  value: string;
  enabled: boolean;
  checked?: string;
};
type Config = {
  language: string;
  topic: string;
  audience: string;
  style: string;
  instructions: string;
  historyMode: string;
  historyFrom: string;
  sources: Source[];
  categories: string[];
  formats: string[];
  suggestCategories: boolean;
  variedLength: boolean;
  variedFormats: boolean;
  ending: string;
  hashtags: string;
  imageMode: string;
};
const initial: Config = {
  language: "",
  topic: "",
  audience: "",
  style: "",
  instructions: "",
  historyMode: "all",
  historyFrom: "",
  sources: [],
  categories: [],
  formats: [],
  suggestCategories: true,
  variedLength: true,
  variedFormats: true,
  ending: "",
  hashtags: "disabled",
  imageMode: "found",
};
const key = (id: string) => ["telegram-ai-posting", id] as const;
type SettingsResponse = {
  configuration: Config;
  autopilotEnabled: boolean;
  configured: boolean;
  detectedLanguage: string;
  autopilot: {
    postsPerDay: number;
    targetReadyDrafts: number;
    maxReadyDrafts: number;
    targetCoverageDays: number;
    criticalCoverageDays: number;
    aiDailyBudget?: string;
    aiMonthlyBudget?: string;
    lastStatus?: string | null;
    lastError?: string | null;
    lastSummary?: { scheduleMode?: string } | null;
  };
};

export function AiPostingPage({
  channelId,
  channelTitle,
}: {
  channelId: string;
  channelTitle: string;
}) {
  const client = useQueryClient();
  const [configs, setConfigs] = useState<Record<string, Config>>({});
  const [settingsTab, setSettingsTab] =
    useState<AiPostingSettingsTab>("context");
  const [categoryText, setCategoryText] = useState("");
  const [formatText, setFormatText] = useState("");
  const settings = useQuery<SettingsResponse>({
    queryKey: key(channelId),
    queryFn: async () =>
      (await api.get(`/telegram-channels/${channelId}/ai-posting`)).data as {
        configuration: Config;
        autopilotEnabled: boolean;
        configured: boolean;
        detectedLanguage: string;
        autopilot: {
          postsPerDay: number;
          targetReadyDrafts: number;
          maxReadyDrafts: number;
          targetCoverageDays: number;
          criticalCoverageDays: number;
          aiDailyBudget?: string;
          aiMonthlyBudget?: string;
          lastStatus?: string | null;
          lastError?: string | null;
          lastSummary?: { scheduleMode?: string } | null;
        };
      },
    enabled: Boolean(channelId),
  });
  const config = configs[channelId] ?? settings.data?.configuration ?? initial;
  const autopilot = settings.data?.autopilotEnabled ?? false;
  const autopilotValues = settings.data?.autopilot ?? {
    postsPerDay: 4,
    targetReadyDrafts: 50,
    maxReadyDrafts: 100,
    targetCoverageDays: 14,
    criticalCoverageDays: 7,
    aiDailyBudget: "",
    aiMonthlyBudget: "",
  };
  const saveValues = {
    ...autopilotValues,
    aiDailyBudget: autopilotValues.aiDailyBudget?.trim() || null,
    aiMonthlyBudget: autopilotValues.aiMonthlyBudget?.trim() || null,
  };
  const save = useMutation({
    mutationFn: async () =>
      (
        await api.put(`/telegram-channels/${channelId}/ai-posting`, {
          configuration: config,
          ...saveValues,
        })
      ).data,
    onSuccess: () => client.invalidateQueries({ queryKey: key(channelId) }),
  });
  const autopilotMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await api.put(`/telegram-channels/${channelId}/ai-posting`, {
        configuration: config,
        ...saveValues,
      });
      const result = await api.post(
        `/telegram-channels/${channelId}/ai-posting/autopilot/${enabled ? "start" : "stop"}`,
        enabled
          ? {
              postsPerDay: saveValues.postsPerDay,
              targetReadyDrafts: saveValues.targetReadyDrafts,
              maxReadyDrafts: saveValues.maxReadyDrafts,
              targetCoverageDays: saveValues.targetCoverageDays,
              criticalCoverageDays: saveValues.criticalCoverageDays,
            }
          : {},
      );
      return result.data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key(channelId) }),
  });
  const patch = (value: Partial<Config>) =>
    setConfigs((current) => ({
      ...current,
      [channelId]: { ...config, ...value },
    }));
  const addItem = (kind: "categories" | "formats") => {
    const text = kind === "categories" ? categoryText : formatText;
    if (!text.trim()) return;
    patch({ [kind]: [...config[kind], text.trim()] });
    if (kind === "categories") setCategoryText("");
    else setFormatText("");
  };
  const removeItem = (kind: "categories" | "formats", item: string) =>
    patch({ [kind]: config[kind].filter((v) => v !== item) });
  const section = "space-y-4 bg-neutral-900/60";
  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-neutral-400">
        Настройки и автопилот для канала «{channelTitle}».
      </p>
      {settings.isLoading ? (
        <Card className={section + " text-sm text-neutral-400"}>
          Загружаем настройки…
        </Card>
      ) : settings.isError ? (
        <Card className={section + " text-sm text-rose-300"}>
          Не удалось загрузить настройки. Обновите страницу.
        </Card>
      ) : (
        <>
          {settings.data?.configured && (
            <Card className="flex items-center gap-2 border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-200">
              <CheckCircle2 size={17} /> Настройки сохранены
            </Card>
          )}
          <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,1fr)_minmax(280px,0.72fr)]">
            <section aria-label="Тестовые публикации" className="min-w-0">
              <AiPostingTestConsole
                channelId={channelId}
                channelTitle={channelTitle}
                settingsReady={
                  Boolean(settings.data?.configured) &&
                  JSON.stringify(config) ===
                    JSON.stringify(settings.data?.configuration) &&
                  !save.isPending
                }
              />
            </section>
            <section
              className="min-w-0 space-y-3"
              aria-label="Настройки AI Posting"
            >
              <AiPostingSettingsTabs
                value={settingsTab}
                onChange={setSettingsTab}
              />
              {settingsTab === "context" && (
                <>
                  <Card className={section}>
                    <h2 className="text-lg font-semibold">Контекст канала</h2>
                    <div className="grid gap-4">
                      <FormField label="Язык">
                        <CustomSelect
                          value={config.language}
                          onChange={(language) => patch({ language })}
                          placeholder="Автоопределение из канала"
                          options={[
                            {
                              value: "",
                              label: `Автоопределение · ${settings.data?.detectedLanguage || "не определён"}`,
                            },
                            { value: "ru", label: "Русский" },
                            { value: "en", label: "English" },
                            { value: "uk", label: "Українська" },
                            { value: "de", label: "Deutsch" },
                            { value: "es", label: "Español" },
                          ]}
                        />
                      </FormField>
                      <FormField label="Тематика">
                        <Input
                          value={config.topic}
                          onChange={(e) => patch({ topic: e.target.value })}
                          placeholder="Например: технологии и стартапы"
                        />
                      </FormField>
                      <FormField label="Аудитория">
                        <Input
                          value={config.audience}
                          onChange={(e) => patch({ audience: e.target.value })}
                          placeholder="Кому адресованы публикации"
                        />
                      </FormField>
                      <FormField label="Стиль">
                        <Input
                          value={config.style}
                          onChange={(e) => patch({ style: e.target.value })}
                          placeholder="Экспертный, дружелюбный…"
                        />
                      </FormField>
                    </div>
                    <FormField label="Дополнительные инструкции">
                      <Textarea
                        value={config.instructions}
                        onChange={(e) =>
                          patch({ instructions: e.target.value })
                        }
                        rows={3}
                        placeholder="Что учитывать при подготовке идей"
                      />
                    </FormField>
                  </Card>
                  <Card className={section}>
                    <h2 className="text-lg font-semibold">
                      История публикаций
                    </h2>
                    <FormField label="Использование истории">
                      <CustomSelect
                        value={config.historyMode}
                        onChange={(historyMode) => patch({ historyMode })}
                        options={[
                          { value: "all", label: "Вся история" },
                          { value: "since", label: "С выбранной даты" },
                          { value: "none", label: "Не использовать" },
                        ]}
                      />
                    </FormField>
                    {config.historyMode === "since" && (
                      <FormField label="Начальная дата">
                        <DateInput
                          type="date"
                          value={config.historyFrom}
                          onChange={(e) =>
                            patch({ historyFrom: e.target.value })
                          }
                        />
                      </FormField>
                    )}
                  </Card>
                </>
              )}
              {settingsTab === "sources" && (
                <AiPostingSourcesSection
                  channelId={channelId}
                  config={config}
                  patch={patch}
                />
              )}
              {settingsTab === "formats" && (
                <>
                  <Card className={section}>
                    <h2 className="text-lg font-semibold">Рубрики и форматы</h2>
                    {(
                      [
                        [
                          "categories",
                          "Рубрики",
                          categoryText,
                          setCategoryText,
                        ],
                        [
                          "formats",
                          "Форматы публикаций",
                          formatText,
                          setFormatText,
                        ],
                      ] as const
                    ).map(([kind, label, text, setText]) => (
                      <div key={kind}>
                        <div className="mb-2 text-sm text-neutral-300">
                          {label}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder={`Добавить: ${label.toLowerCase()}`}
                          />
                          <Button
                            variant="secondary"
                            onClick={() => addItem(kind)}
                          >
                            <Plus size={16} />
                          </Button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {config[kind].map((item) => (
                            <Button
                              type="button"
                              variant="secondary"
                              key={item}
                              onClick={() => removeItem(kind, item)}
                              className="rounded-full px-3 py-1 text-xs"
                            >
                              {item} ×
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <ToggleRow
                      checked={config.suggestCategories}
                      onChange={(suggestCategories) =>
                        patch({ suggestCategories })
                      }
                      label="Предлагать новые рубрики"
                    />
                  </Card>
                  <Card className={section}>
                    <h2 className="text-lg font-semibold">
                      Вариативность и оформление
                    </h2>
                    <ToggleRow
                      checked={config.variedLength}
                      onChange={(variedLength) => patch({ variedLength })}
                      label="Разнообразить длину публикаций"
                    />
                    <ToggleRow
                      checked={config.variedFormats}
                      onChange={(variedFormats) => patch({ variedFormats })}
                      label="Разнообразить форматы публикаций"
                    />
                    <FormField label="Постоянная концовка">
                      <Textarea
                        value={config.ending}
                        onChange={(e) => patch({ ending: e.target.value })}
                        rows={2}
                        placeholder="Текст, добавляемый в конец публикаций"
                      />
                    </FormField>
                    <FormField label="Хэштеги">
                      <CustomSelect
                        value={config.hashtags}
                        onChange={(hashtags) => patch({ hashtags })}
                        options={[
                          { value: "disabled", label: "Отключены" },
                          { value: "start", label: "В начале публикации" },
                          { value: "end", label: "В конце публикации" },
                        ]}
                      />
                    </FormField>
                    <FormField label="Изображения">
                      <CustomSelect
                        value={config.imageMode}
                        onChange={(imageMode) => patch({ imageMode })}
                        options={[
                          { value: "found", label: "Найденные изображения" },
                          { value: "ai", label: "AI-генерация" },
                          { value: "hybrid", label: "Гибридный режим" },
                        ]}
                      />
                    </FormField>
                  </Card>
                </>
              )}
              {settingsTab === "autopilot" && (
                <Card className={section}>
                  <h2 className="text-lg font-semibold">Состояние</h2>
                  <p className="text-sm text-neutral-400">
                    {autopilot
                      ? "Автопилот поддерживает запас черновиков и покрытие календаря. Публикации остаются под контролем обычного механизма Nexeloq."
                      : "Автоматизация выключена. Готовые черновики и запланированные публикации сохраняются при остановке."}
                  </p>
                  <div className="grid gap-3 2xl:grid-cols-2">
                    {(
                      [
                        ["postsPerDay", "Постов в сутки", 1, 20],
                        ["targetReadyDrafts", "Целевой запас DRAFT", 0, 500],
                        ["maxReadyDrafts", "Максимальный запас", 1, 500],
                        [
                          "targetCoverageDays",
                          "Покрытие расписания, дней",
                          1,
                          62,
                        ],
                        [
                          "criticalCoverageDays",
                          "Критический минимум, дней",
                          1,
                          62,
                        ],
                      ] as const
                    ).map(([name, label, min, max]) => (
                      <FormField key={name} label={label}>
                        <Input
                          type="number"
                          min={min}
                          max={max}
                          value={
                            settings.data?.autopilot?.[name] ??
                            {
                              postsPerDay: 4,
                              targetReadyDrafts: 50,
                              maxReadyDrafts: 100,
                              targetCoverageDays: 14,
                              criticalCoverageDays: 7,
                            }[name]
                          }
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            client.setQueryData<SettingsResponse>(
                              key(channelId),
                              (old) =>
                                old
                                  ? {
                                      ...old,
                                      autopilot: {
                                        ...old.autopilot,
                                        [name]: value,
                                      },
                                    }
                                  : old,
                            );
                          }}
                        />
                      </FormField>
                    ))}
                  </div>
                  <p className="text-xs text-neutral-500">
                    Проверка дефицита выполняется по расписанию раз в неделю.
                    Планирование использует часовой пояс рабочего пространства и
                    активные слоты календаря.
                  </p>
                  <div className="grid gap-3 2xl:grid-cols-2">
                    {(
                      [
                        ["aiDailyBudget", "Дневной лимит AI, USD"],
                        ["aiMonthlyBudget", "Месячный лимит AI, USD"],
                      ] as const
                    ).map(([name, label]) => (
                      <FormField key={name} label={label}>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={settings.data?.autopilot?.[name] ?? ""}
                          placeholder="Без дополнительного лимита канала"
                          onChange={(event) => {
                            const value = event.target.value;
                            client.setQueryData<SettingsResponse>(
                              key(channelId),
                              (old) =>
                                old
                                  ? {
                                      ...old,
                                      autopilot: {
                                        ...old.autopilot,
                                        [name]: value,
                                      },
                                    }
                                  : old,
                            );
                          }}
                        />
                      </FormField>
                    ))}
                  </div>
                  <p className="text-xs text-neutral-500">
                    Применяется до отправки запроса в AI Gateway; общие
                    workspace и category лимиты сохраняют силу.
                  </p>
                  {settings.data?.autopilot?.lastStatus && (
                    <p className="text-sm text-neutral-300">
                      Последний запуск: {settings.data.autopilot.lastStatus}
                      {settings.data.autopilot.lastError
                        ? ` · ${settings.data.autopilot.lastError}`
                        : ""}
                    </p>
                  )}
                  {settings.data?.autopilot?.lastSummary?.scheduleMode && (
                    <p className="text-sm text-neutral-400">
                      Режим расписания:{" "}
                      {settings.data.autopilot.lastSummary.scheduleMode}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      disabled={autopilotMutation.isPending || autopilot}
                      onClick={() => autopilotMutation.mutate(true)}
                    >
                      <Play size={16} />
                      Включить автопилот
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={autopilotMutation.isPending || !autopilot}
                      onClick={() => autopilotMutation.mutate(false)}
                    >
                      <Square size={16} />
                      Остановить автопилот
                    </Button>
                  </div>
                  {autopilotMutation.isError && (
                    <p role="alert" className="text-sm text-rose-300">
                      Не удалось изменить режим автопилота.
                    </p>
                  )}
                </Card>
              )}
              <div className="flex justify-end">
                <Button disabled={save.isPending} onClick={() => save.mutate()}>
                  <Save size={16} />
                  {save.isPending ? "Сохраняем…" : "Сохранить настройки"}
                </Button>
              </div>
              {save.isError && (
                <p role="alert" className="text-sm text-rose-300">
                  Не удалось сохранить настройки.
                </p>
              )}
              {save.isSuccess && (
                <p
                  role="status"
                  className="text-right text-sm text-emerald-300"
                >
                  Настройки сохранены.
                </p>
              )}
            </section>
            <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start xl:overflow-y-auto">
              <AiPostingAnalytics channelId={channelId} />
              <AiPostingAutopilotHistory channelId={channelId} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
