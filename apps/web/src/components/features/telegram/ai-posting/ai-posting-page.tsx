"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  CustomSelect,
  FormField,
  ToggleRow,
  Textarea,
} from "@/components/ui/primitives";
import { DateInput } from "@/components/ui/date-inputs";
import {
  telegramContentHypothesisKeys,
  telegramChannelKeys,
  telegramPostKeys,
} from "@/lib/query-keys";
import {
  api,
  telegramChannelsApi,
  telegramContentHypothesesApi,
} from "@/lib/api";
import { AiPostingSourcesSection } from "./ai-posting-sources-section";
import { AiPostingStructureSection } from "./ai-posting-structure-section";
import { AiPostingImagesSection } from "./ai-posting-images-section";
import { AiPostingLengthTooltip } from "./ai-posting-length-tooltip";
import {
  appendAiPostingImageFeedback,
  normalizeAiPostingMediaPreferences,
  type AiPostingMediaPreference,
} from "./ai-posting-media-preferences";
import { AiPostingTestConsole } from "./ai-posting-test-console";
import { AiPostingAutopilotHistory } from "./ai-posting-autopilot-history";
import {
  AiPostingRulesSection,
  type AiPostingRule,
} from "./ai-posting-rules-section";
import { AiPostingVersionsSection } from "./ai-posting-versions-section";
import { AiPostingPerformanceSection } from "./ai-posting-performance-section";
import { AiPostingRhythmSection } from "./ai-posting-rhythm-section";
import { AiPostingReviewQueue } from "./ai-posting-review-queue";
import { AiPostingAutopilotSettingsSection } from "./ai-posting-autopilot-settings-section";
import {
  AiPostingSettingsTabs,
  type AiPostingSettingsTab,
} from "./ai-posting-settings-tabs";
import { TelegramCustomEmojiPickerModal } from "../telegram/telegram-custom-emoji-picker-modal";
import { TelegramCustomEmojiPacksModal } from "../telegram/telegram-custom-emoji-packs-modal";
import { customEmojiToken } from "../telegram/telegram-custom-emoji";
import { workspaceKeys } from "@/lib/query-keys";
import type { TelegramCustomEmoji } from "@telegram-system/shared";
import type { TelegramChannelSelectOption } from "@/lib/api-types/telegram/telegram-channels";

type Source = {
  id: string;
  type: "website" | "rss" | "telegram" | "history";
  value: string;
  enabled: boolean;
  checked?: string;
};
type Config = {
  language: string;
  channelDescription: string;
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
  allowCreateHypotheses?: boolean;
  allowCreateGroups?: boolean;
  variedLength: boolean;
  variedFormats: boolean;
  emojiPolicy: "start" | "contextual";
  ending: string;
  hashtags: string;
  imageMode: string;
  mediaPreferences?: AiPostingMediaPreference[];
  imageAvoidances?: string[];
  useChannelAvatarInMedia: boolean;
  rules: AiPostingRule[];
  postsPerDayMin: number;
  postsPerDayMax: number;
};
const initial: Config = {
  language: "",
  channelDescription: "",
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
  allowCreateHypotheses: false,
  allowCreateGroups: false,
  variedLength: true,
  variedFormats: true,
  emojiPolicy: "contextual",
  ending: "",
  hashtags: "disabled",
  imageMode: "ai",
  mediaPreferences: [],
  imageAvoidances: [],
  useChannelAvatarInMedia: false,
  rules: [],
  postsPerDayMin: 3,
  postsPerDayMax: 4,
};
const key = (id: string) => ["telegram-ai-posting", id] as const;
type SettingsResponse = {
  channel?: { photoUrl?: string | null };
  configuration: Config;
  autopilotEnabled: boolean;
  mode: "TEST" | "REVIEW" | "AUTOPILOT";
  draftExpirationDays: number;
  configured: boolean;
  detectedLanguage: string;
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

export function AiPostingPage({
  channelId,
  channelTitle,
}: {
  channelId: string;
  channelTitle: string;
}) {
  const client = useQueryClient();
  const [configs, setConfigs] = useState<Record<string, Config>>({});
  const [selectionTouched, setSelectionTouched] = useState<
    Record<string, { categories?: boolean; formats?: boolean }>
  >({});
  const [settingsTab, setSettingsTab] =
    useState<AiPostingSettingsTab>("context");
  const [endingEmojiPickerOpen, setEndingEmojiPickerOpen] = useState(false);
  const [endingEmojiPacksOpen, setEndingEmojiPacksOpen] = useState(false);
  const [endingPremiumEmojiRequested, setEndingPremiumEmojiRequested] =
    useState(false);
  const hypotheses = useQuery({
    queryKey: ["telegram-ai-posting-hypotheses", channelId],
    queryFn: () => telegramContentHypothesesApi.list(channelId),
    enabled: Boolean(channelId),
  });
  const postGroups = useQuery({
    queryKey: ["telegram-ai-posting-post-groups", channelId],
    queryFn: () => telegramChannelsApi.postGroupSummaries(channelId),
    enabled: Boolean(channelId),
  });
  const endingEmojiPacks = useQuery({
    queryKey: workspaceKeys.telegramCustomEmojiPacks(),
    queryFn: () => telegramChannelsApi.customEmojiPacks(),
    enabled:
      endingEmojiPacksOpen ||
      (endingEmojiPickerOpen && endingPremiumEmojiRequested),
  });
  const settings = useQuery<SettingsResponse>({
    queryKey: key(channelId),
    queryFn: async () =>
      (await api.get(`/telegram-channels/${channelId}/ai-posting`)).data as {
        configuration: Config;
        autopilotEnabled: boolean;
        mode: SettingsResponse["mode"];
        draftExpirationDays: number;
        configured: boolean;
        detectedLanguage: string;
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
      },
    enabled: Boolean(channelId),
  });
  const cachedChannelPhotoUrl =
    client
      .getQueryData<TelegramChannelSelectOption[]>(
        telegramChannelKeys.select({
          canPostMessagesOnly: true,
          owned: true,
          includeTest: true,
        }),
      )
      ?.find((channel) => channel.id === channelId)?.photoUrl ?? null;
  const config = configs[channelId] ?? settings.data?.configuration ?? initial;
  const defaultCategorySelection =
    !settings.data?.configured &&
    !selectionTouched[channelId]?.categories &&
    config.categories.length === 0;
  const defaultFormatSelection =
    !settings.data?.configured &&
    !selectionTouched[channelId]?.formats &&
    config.formats.length === 0;
  const effectiveConfig = {
    ...config,
    categories: defaultCategorySelection
      ? (hypotheses.data ?? [])
          .filter((entry) => entry.status === "ACTIVE")
          .map((entry) => entry.name)
      : config.categories,
    formats: defaultFormatSelection
      ? (postGroups.data ?? []).map((entry) => entry.title)
      : config.formats,
    mediaPreferences: normalizeAiPostingMediaPreferences(config),
  };
  const autopilotValues = settings.data?.autopilot ?? {
    postsPerDay: 4,
    targetReadyDrafts: 50,
    maxReadyDrafts: 100,
    targetCoverageDays: 14,
    criticalCoverageDays: 7,
    aiMonthlyBudget: "",
  };
  const postsPerDayMin = Math.max(1, config.postsPerDayMin ?? 3);
  const postsPerDayMax = Math.max(postsPerDayMin, config.postsPerDayMax ?? 4);
  const saveValues = {
    mode: settings.data?.mode ?? "TEST",
    draftExpirationDays: settings.data?.draftExpirationDays ?? 30,
    postsPerDay: Math.round((postsPerDayMin + postsPerDayMax) / 2),
    targetReadyDrafts: autopilotValues.targetReadyDrafts,
    maxReadyDrafts: autopilotValues.maxReadyDrafts,
    targetCoverageDays: autopilotValues.targetCoverageDays,
    criticalCoverageDays: autopilotValues.criticalCoverageDays,
    aiMonthlyBudget: autopilotValues.aiMonthlyBudget?.trim() || null,
  };
  const save = useMutation({
    onMutate: (configuration?: Config) => ({
      channelId,
      local: configs[channelId],
      configuration,
    }),
    mutationFn: async (configuration?: Config) =>
      (
        await api.put(`/telegram-channels/${channelId}/ai-posting`, {
          configuration: configuration ?? effectiveConfig,
          ...saveValues,
        })
      ).data,
    onSuccess: async (_result, _variables, snapshot) => {
      if (!snapshot) return;
      await client.invalidateQueries(
        { queryKey: key(snapshot.channelId) },
        { throwOnError: true },
      );
      setConfigs((current) => {
        if (current[snapshot.channelId] !== snapshot.local) return current;
        const next = { ...current };
        delete next[snapshot.channelId];
        return next;
      });
    },
  });
  const autopilotMutation = useMutation({
    onMutate: () => ({ channelId, local: configs[channelId] }),
    mutationFn: async (enabled: boolean) => {
      await api.put(`/telegram-channels/${channelId}/ai-posting`, {
        configuration: effectiveConfig,
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
    onSuccess: async (_result, _variables, snapshot) => {
      if (!snapshot) return;
      await client.invalidateQueries(
        { queryKey: key(snapshot.channelId) },
        { throwOnError: true },
      );
      setConfigs((current) => {
        if (current[snapshot.channelId] !== snapshot.local) return current;
        const next = { ...current };
        delete next[snapshot.channelId];
        return next;
      });
    },
  });
  const generateStructure = useMutation({
    mutationFn: async (input: {
      channelId: string;
      description: string;
      language: string;
      base: Config;
      categories: string[];
      formats: string[];
    }) =>
      (
        await api.post(
          `/telegram-channels/${input.channelId}/ai-posting/generate-structure`,
          { description: input.description, language: input.language },
        )
      ).data as { groups: string[]; hypotheses: string[] },
    onSuccess: async (created, input) => {
      setConfigs((current) => {
        const base = current[input.channelId] ?? input.base;
        return {
          ...current,
          [input.channelId]: {
            ...base,
            categories: [
              ...new Set([...input.categories, ...created.hypotheses]),
            ],
            formats: [...new Set([...input.formats, ...created.groups])],
          },
        };
      });
      setSelectionTouched((current) => ({
        ...current,
        [input.channelId]: { categories: true, formats: true },
      }));
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["telegram-ai-posting-hypotheses", input.channelId],
        }),
        client.invalidateQueries({
          queryKey: ["telegram-ai-posting-post-groups", input.channelId],
        }),
        client.invalidateQueries({
          queryKey: telegramContentHypothesisKeys.list(input.channelId),
        }),
        client.invalidateQueries({
          queryKey: telegramPostKeys.postGroups(input.channelId),
        }),
      ]);
    },
  });
  const patch = (value: Partial<Config>) =>
    setConfigs((current) => ({
      ...current,
      [channelId]: { ...(current[channelId] ?? config), ...value },
    }));
  const rememberImageRule = async (value: string) => {
    const mediaPreferences = appendAiPostingImageFeedback(
      effectiveConfig,
      value,
    );
    if (!mediaPreferences) return;
    await save.mutateAsync({
      ...effectiveConfig,
      mediaPreferences,
    });
  };
  const lookupsReady = hypotheses.isSuccess && postGroups.isSuccess;
  const settingsReady =
    Boolean(settings.data?.configured) &&
    !Object.prototype.hasOwnProperty.call(configs, channelId) &&
    !save.isPending;
  const section = "space-y-4 bg-neutral-900/60";
  return (
    <div className="mt-4 space-y-4">
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
          <AiPostingReviewQueue
            channelId={channelId}
            channelTitle={channelTitle}
            active={settings.data?.mode === "REVIEW"}
          />
          <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <section aria-label="Тестовые публикации" className="min-w-0">
              <AiPostingTestConsole
                key={channelId}
                channelId={channelId}
                channelTitle={channelTitle}
                dailyPostCount={Math.min(5, postsPerDayMax)}
                settingsReady={settingsReady}
                onRememberImageRule={rememberImageRule}
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
              <div hidden={settingsTab !== "context"}>
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
                              label: `Автоопределение · ${({ ru: "🇷🇺 Русский", en: "🇬🇧 English", uk: "🇺🇦 Українська", de: "🇩🇪 Deutsch", es: "🇪🇸 Español" } as Record<string, string>)[settings.data?.detectedLanguage ?? ""] || "выберите язык вручную"}`,
                            },
                            { value: "ru", label: "Русский", iconEmoji: "🇷🇺" },
                            { value: "en", label: "English", iconEmoji: "🇬🇧" },
                            {
                              value: "uk",
                              label: "Українська",
                              iconEmoji: "🇺🇦",
                            },
                            { value: "de", label: "Deutsch", iconEmoji: "🇩🇪" },
                            { value: "es", label: "Español", iconEmoji: "🇪🇸" },
                          ]}
                        />
                      </FormField>
                    </div>
                    <FormField label="Опишите канал своими словами">
                      <Textarea
                        value={config.channelDescription}
                        onChange={(e) =>
                          patch({ channelDescription: e.target.value })
                        }
                        rows={5}
                        placeholder="Например: канал для людей, которые интересуются психологией. Пишем о привычках, эмоциях и отношениях простым языком, с практическими примерами и без назидательного тона."
                      />
                    </FormField>
                    <p className="-mt-2 text-xs text-neutral-500">
                      Расскажите, для кого канал, о чём вы пишете и как хотите
                      звучать. Это станет основным контекстом для идей и
                      черновиков.
                    </p>
                    <AiPostingRulesSection
                      rules={config.rules ?? []}
                      onChange={(rules) => patch({ rules })}
                    />
                    <FormField label="Использование истории публикаций">
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
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <ToggleRow
                          checked={config.variedLength}
                          onChange={(variedLength) => patch({ variedLength })}
                          label="Авто определяет длину"
                          className="min-w-0 flex-1"
                        />
                        <AiPostingLengthTooltip />
                      </div>
                      <FormField label="Эмодзи в публикациях">
                        <CustomSelect
                          value={config.emojiPolicy}
                          onChange={(emojiPolicy) =>
                            patch({
                              emojiPolicy: emojiPolicy as Config["emojiPolicy"],
                            })
                          }
                          options={[
                            {
                              value: "start",
                              label: "Один уместный эмодзи в начале",
                            },
                            {
                              value: "contextual",
                              label: "Уместные эмодзи по тексту",
                            },
                          ]}
                        />
                      </FormField>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <FormField label="Постоянная концовка">
                        <Textarea
                          value={config.ending}
                          onChange={(e) => patch({ ending: e.target.value })}
                          rows={2}
                          placeholder="Текст, добавляемый в конец публикаций"
                        />
                        <div className="mt-2 space-y-1">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setEndingEmojiPickerOpen(true)}
                          >
                            Вставить Premium-эмодзи
                          </Button>
                          <p className="text-xs text-neutral-500">
                            Чтобы добавить аватар канала в концовку, сначала
                            импортируйте его как custom emoji в Telegram, затем
                            выберите его здесь.
                          </p>
                        </div>
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
                    </div>
                  </Card>
                </>
              </div>
              <div hidden={settingsTab !== "sources"}>
                <AiPostingSourcesSection
                  channelId={channelId}
                  config={config}
                  patch={patch}
                />
              </div>
              <div hidden={settingsTab !== "formats"}>
                <>
                  <AiPostingStructureSection
                    categories={effectiveConfig.categories}
                    formats={effectiveConfig.formats}
                    categoryOptions={(hypotheses.data ?? [])
                      .filter((entry) => entry.status === "ACTIVE")
                      .map((entry) => ({
                        value: entry.name,
                        label: entry.name,
                        iconPresentation: entry.iconPresentation ?? undefined,
                        iconEmoji: entry.iconPresentation ? undefined : "💡",
                      }))}
                    formatOptions={(postGroups.data ?? []).map((entry) => ({
                      value: entry.title,
                      label: entry.title,
                      iconPresentation: entry.iconPresentation ?? undefined,
                      iconEmoji: entry.iconPresentation ? undefined : "📁",
                    }))}
                    allowCreateHypotheses={
                      config.allowCreateHypotheses === true
                    }
                    allowCreateGroups={config.allowCreateGroups === true}
                    pending={generateStructure.isPending}
                    ready={lookupsReady}
                    error={
                      generateStructure.isError &&
                      generateStructure.variables?.channelId === channelId
                    }
                    result={
                      generateStructure.isSuccess &&
                      generateStructure.variables?.channelId === channelId
                        ? generateStructure.data
                        : undefined
                    }
                    onCategories={(categories) => {
                      setSelectionTouched((current) => ({
                        ...current,
                        [channelId]: {
                          ...current[channelId],
                          categories: true,
                        },
                      }));
                      patch({ categories });
                    }}
                    onFormats={(formats) => {
                      setSelectionTouched((current) => ({
                        ...current,
                        [channelId]: { ...current[channelId], formats: true },
                      }));
                      patch({ formats });
                    }}
                    onAllowHypotheses={(allowCreateHypotheses) =>
                      patch({ allowCreateHypotheses })
                    }
                    onAllowGroups={(allowCreateGroups) =>
                      patch({ allowCreateGroups })
                    }
                    onGenerate={() =>
                      generateStructure.mutate({
                        channelId,
                        description: config.channelDescription.slice(0, 4000),
                        language:
                          config.language ||
                          settings.data?.detectedLanguage ||
                          "",
                        base: config,
                        categories: effectiveConfig.categories,
                        formats: effectiveConfig.formats,
                      })
                    }
                  />
                </>
              </div>
              <div hidden={settingsTab !== "images"}>
                <AiPostingImagesSection
                  key={channelId}
                  mode={config.imageMode}
                  preferences={effectiveConfig.mediaPreferences}
                  avoidances={config.imageAvoidances ?? []}
                  channelAvatarUrl={
                    settings.data?.channel?.photoUrl ?? cachedChannelPhotoUrl
                  }
                  useChannelAvatarInMedia={config.useChannelAvatarInMedia}
                  onMode={(imageMode) => patch({ imageMode })}
                  onPreferences={(mediaPreferences) =>
                    patch({ mediaPreferences })
                  }
                  onAvoidances={(imageAvoidances) => patch({ imageAvoidances })}
                  onUseChannelAvatarInMedia={(useChannelAvatarInMedia) =>
                    patch({ useChannelAvatarInMedia })
                  }
                />
              </div>
              <div hidden={settingsTab !== "autopilot"}>
                <AiPostingRhythmSection
                  channelId={channelId}
                  active={settingsTab === "autopilot"}
                />
                <AiPostingAutopilotSettingsSection
                  channelId={channelId}
                  settings={settings.data!}
                  postsPerDayMin={postsPerDayMin}
                  postsPerDayMax={postsPerDayMax}
                  onPostsPerDayRange={(postsPerDayMin, postsPerDayMax) =>
                    patch({ postsPerDayMin, postsPerDayMax })
                  }
                  lookupsReady={lookupsReady}
                  pending={autopilotMutation.isPending}
                  error={autopilotMutation.isError}
                  onStart={() => autopilotMutation.mutate(true)}
                  onStop={() => autopilotMutation.mutate(false)}
                />
              </div>
              <div hidden={settingsTab !== "performance"}>
                <AiPostingPerformanceSection
                  channelId={channelId}
                  active={settingsTab === "performance"}
                />
              </div>
              <div hidden={settingsTab !== "history"}>
                <AiPostingVersionsSection
                  channelId={channelId}
                  active={settingsTab === "history"}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  disabled={
                    save.isPending ||
                    (!settings.data?.configured && !lookupsReady)
                  }
                  onClick={() => save.mutate(effectiveConfig)}
                >
                  <Save size={16} />
                  {save.isPending ? "Сохраняем…" : "Сохранить настройки"}
                </Button>
              </div>
              {save.isError && (
                <p role="alert" className="text-sm text-rose-300">
                  Не удалось сохранить настройки.
                </p>
              )}
            </section>
            <div className="min-w-0 xl:col-span-2">
              <AiPostingAutopilotHistory channelId={channelId} />
            </div>
          </div>
        </>
      )}
      {endingEmojiPickerOpen && (
        <TelegramCustomEmojiPickerModal
          open
          onClose={() => setEndingEmojiPickerOpen(false)}
          packs={endingEmojiPacks.data?.packs ?? []}
          onSelect={(emoji: TelegramCustomEmoji) => {
            const ending = config.ending.trimEnd();
            patch({
              ending: `${ending}${ending ? " " : ""}${customEmojiToken(emoji)}`,
            });
            setEndingEmojiPickerOpen(false);
          }}
          onSelectStandard={(emoji) => {
            const ending = config.ending.trimEnd();
            patch({ ending: `${ending}${ending ? " " : ""}${emoji}` });
            setEndingEmojiPickerOpen(false);
          }}
          onPremiumTabOpen={() => setEndingPremiumEmojiRequested(true)}
          onManage={() => setEndingEmojiPacksOpen(true)}
          premiumLoading={endingEmojiPacks.isLoading}
          premiumError={endingEmojiPacks.isError}
          onRetryPremium={() => void endingEmojiPacks.refetch()}
        />
      )}
      {endingEmojiPacksOpen && (
        <TelegramCustomEmojiPacksModal
          open
          onClose={() => setEndingEmojiPacksOpen(false)}
          packs={endingEmojiPacks.data?.packs ?? []}
          onImport={async (input) => {
            await telegramChannelsApi.importCustomEmojiPack(input);
            await endingEmojiPacks.refetch();
          }}
          onDetach={async (packId) => {
            await telegramChannelsApi.detachCustomEmojiPack(packId);
            await endingEmojiPacks.refetch();
          }}
          onRefresh={async (packId) => {
            await telegramChannelsApi.refreshCustomEmojiPack(packId);
            await endingEmojiPacks.refetch();
          }}
        />
      )}
    </div>
  );
}
