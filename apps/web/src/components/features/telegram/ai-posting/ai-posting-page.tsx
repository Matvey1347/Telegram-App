"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Save, Pencil, RotateCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  CustomSelect,
  FormField,
  ToggleRow,
  Textarea,
  Modal,
} from "@/components/ui/primitives";
import { DateInput } from "@/components/ui/date-inputs";
import { telegramAiPostingKeys, telegramChannelKeys, telegramPostKeys } from "@/lib/query-keys";
import { api, telegramChannelsApi } from "@/lib/api";
import { AiPostingChannelAnalysis } from "./ai-posting-channel-analysis";
import { AiPostingSphereWeights } from "./ai-posting-sphere-weights";
import { AiPostingChat } from "./ai-posting-chat";
import { appendChannelEndingSignature } from "./channel-ending-signature";
import type { ChannelEndingSignatureSource } from "./channel-ending-signature";
import { useEndingEmojiPacks } from "./use-ending-emoji-packs";
import { aiPostingPreferenceIcons } from "./ai-posting-entity-icons";
import { AiPostingImagesSection } from "./ai-posting-images-section";
import { AiPostingTaxonomyEditor } from "./ai-posting-taxonomy-editor";
import {
  DEFAULT_AI_POSTING_LENGTHS,
  type AiPostingLength,
  type AiPostingRubric,
  type AiPostingSphere,
} from "./ai-posting-content-model";
import {
  appendAiPostingImageFeedback,
  normalizeAiPostingMediaPreferences,
  type AiPostingMediaPreference,
} from "./ai-posting-media-preferences";
import { AiPostingTestConsole } from "./ai-posting-test-console";
import { AiPostingReviewQueue } from "./ai-posting-review-queue";
import { AiPostingAutopilot } from "./ai-posting-autopilot";
import { AiPostingSettingsTransfer } from "./ai-posting-settings-transfer";
import { RenderedPreviewText } from "@/components/features/telegram/telegram/telegram-post-preview-content";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import {
  AiPostingSettingsTabs,
  type AiPostingSettingsTab,
} from "./ai-posting-settings-tabs";
import { TelegramCustomEmojiPacksModal } from "../telegram/telegram-custom-emoji-packs-modal";
import { EditableTelegramPreviewText } from "../telegram/telegram-post-preview";
import { workspaceKeys } from "@/lib/query-keys";
import { DEFAULT_TELEGRAM_AI_POSTING_SEARCH_PERCENT, telegramAiPostingImageSourceUrls, type ResolvedEmoji } from "@telegram-system/shared";
import type { TelegramChannelSelectOption } from "@/lib/api-types/telegram/telegram-channels";

type Config = {
  language: string;
  topic: string;
  style?: string;
  visualStyle?: string;
  visualVariety?: boolean;
  sphereWeights?: Record<string, number>;
  audience: string;
  historyMode: string;
  historyFrom: string;
  variedLength: boolean;
  emojiPolicy: "start" | "contextual";
  ending: string;
  hashtags: string;
  imageMode: string;
  hybridSearchPercent?: number;
  imageSearchSources?: string[];
  mediaPreferences?: AiPostingMediaPreference[];
  spheres: AiPostingSphere[];
  rubrics: AiPostingRubric[];
  lengths: AiPostingLength[];
  imageAvoidances?: string[];
  useChannelAvatarInMedia: boolean;
  channelAvatarWatermarkSize: number;
  channelAvatarWatermarkOpacity: number;
  channelAvatarWatermarkX?: number;
  channelAvatarWatermarkY?: number;
};
const initial: Config = {
  language: "",
  topic: "",
  audience: "",
  historyMode: "all",
  historyFrom: "",
  variedLength: true,
  emojiPolicy: "contextual",
  ending: "",
  hashtags: "disabled",
  imageMode: "hybrid",
  hybridSearchPercent: DEFAULT_TELEGRAM_AI_POSTING_SEARCH_PERCENT,
  mediaPreferences: [],
  spheres: [],
  rubrics: [],
  lengths: DEFAULT_AI_POSTING_LENGTHS,
  imageAvoidances: [],
  useChannelAvatarInMedia: false,
  channelAvatarWatermarkSize: 12,
  channelAvatarWatermarkOpacity: 100,
};
function comparableConfig(value?: Config): Config {
  const config = value ?? initial;
  return {
    language: config.language ?? "",
    topic: config.topic ?? "",
    style: config.style ?? "",
    visualStyle: config.visualStyle ?? "",
    visualVariety: config.visualVariety ?? false,
    sphereWeights: Object.fromEntries(Object.entries(config.sphereWeights ?? {}).sort()),
    audience: config.audience ?? "",
    historyMode: config.historyMode ?? "all",
    historyFrom: config.historyFrom ?? "",
    variedLength: config.variedLength ?? true,
    emojiPolicy: config.emojiPolicy ?? "contextual",
    ending: config.ending ?? "",
    hashtags: config.hashtags ?? "disabled",
    imageMode: config.imageMode ?? "hybrid",
    imageSearchSources: telegramAiPostingImageSourceUrls(config.imageSearchSources),
    hybridSearchPercent: config.hybridSearchPercent ?? DEFAULT_TELEGRAM_AI_POSTING_SEARCH_PERCENT,
    mediaPreferences: normalizeAiPostingMediaPreferences(config),
    spheres: config.spheres ?? [],
    rubrics: config.rubrics ?? [],
    lengths: config.lengths ?? DEFAULT_AI_POSTING_LENGTHS,
    imageAvoidances: config.imageAvoidances ?? [],
    useChannelAvatarInMedia: config.useChannelAvatarInMedia ?? false,
    channelAvatarWatermarkSize: config.channelAvatarWatermarkSize ?? 12,
    channelAvatarWatermarkOpacity: config.channelAvatarWatermarkOpacity ?? 100,
    channelAvatarWatermarkX: config.channelAvatarWatermarkX ?? 100,
    channelAvatarWatermarkY: config.channelAvatarWatermarkY ?? 100,
  };
}
export function isAiPostingConfigDirty(current?: Config, saved?: Config) {
  return (
    JSON.stringify(comparableConfig(current)) !==
    JSON.stringify(comparableConfig(saved))
  );
}
const key = telegramAiPostingKeys.settings;
type SettingsResponse = {
  mediaPreferenceIcons?: Record<string, ResolvedEmoji>;
  channel?: ChannelEndingSignatureSource & { photoUrl?: string | null };
  configuration: Config;
  mode: "TEST" | "REVIEW";
  draftExpirationDays: number;
  configured: boolean;
  configurationVersion: number;
  detectedLanguage: string;
};

export function AiPostingPage({
  viewNavigation,
  channelId,
  channelTitle,
  captionLengthMax,
  messageLengthMax,
}: {
  viewNavigation?: ReactNode;
  channelId: string;
  channelTitle: string;
  captionLengthMax?: number;
  messageLengthMax?: number;
}) {
  const client = useQueryClient();
  const [configs, setConfigs] = useState<Record<string, Config>>({});
  const [settingsTab, setSettingsTab] = useState<AiPostingSettingsTab>("autopilot");
  useEffect(() => {
    const syncTabFromUrl = () => {
      const requested = new URLSearchParams(window.location.search).get(
        "aiPostingTab",
      );
      if (
        ["chat", "idea", "writing", "images", "autopilot", "transfer"].includes(
          requested ?? "",
        )
      ) {
        setSettingsTab(requested as AiPostingSettingsTab);
      } else {
        setSettingsTab("autopilot");
      }
    };
    syncTabFromUrl();
    window.addEventListener("popstate", syncTabFromUrl);
    return () => window.removeEventListener("popstate", syncTabFromUrl);
  }, []);
  const changeSettingsTab = (tab: AiPostingSettingsTab) => {
    const url = new URL(window.location.href);
    url.searchParams.set("aiPostingTab", tab);
    window.history.pushState(window.history.state, "", url);
    setSettingsTab(tab);
  };
  const settingsTabHref = (tab: AiPostingSettingsTab) => {
    if (typeof window === "undefined") return `?aiPostingTab=${tab}`;
    const url = new URL(window.location.href);
    url.searchParams.set("aiPostingTab", tab);
    return `${url.pathname}${url.search}${url.hash}`;
  };
  const [endingEditorOpen, setEndingEditorOpen] = useState(false);
  const [endingDraft, setEndingDraft] = useState("");
  const [endingEmojiPacksOpen, setEndingEmojiPacksOpen] = useState(false);
  const settings = useQuery<SettingsResponse>({
    queryKey: key(channelId),
    queryFn: async () =>
      (await api.get<SettingsResponse>(`/telegram-channels/${channelId}/ai-posting`)).data,
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
  const baseEnding = appendChannelEndingSignature("", {
    title: channelTitle,
    ...settings.data?.channel,
  });
  const effectiveEnding = config.ending.trim() || baseEnding;
  const endingPreview =
    config.hashtags === "ending_inline" && effectiveEnding
      ? `${effectiveEnding} | #хэштег`
      : effectiveEnding;
  const endingEmojiPacks = useQuery({
    queryKey: workspaceKeys.telegramCustomEmojiPacks(),
    queryFn: () => telegramChannelsApi.customEmojiPacks(),
    enabled:
      /!\[[^\]\n]*\]\(tg:\/\/emoji\?id=\d+\)/.test(effectiveEnding) ||
      endingEmojiPacksOpen ||
      endingEditorOpen,
  });
  const endingEmoji = useEndingEmojiPacks(
    effectiveEnding,
    endingEmojiPacks.data?.packs,
  );
  const effectiveConfig = {
    ...config,
    mediaPreferences: normalizeAiPostingMediaPreferences(config),
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
          expectedConfigurationVersion: settings.data?.configurationVersion,
        })
      ).data,
    onSuccess: async (_result, _variables, snapshot) => {
      if (!snapshot) return;
      await client.invalidateQueries({ queryKey: telegramPostKeys.managedLists(snapshot.channelId) });
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
  const settingsReady =
    Boolean(settings.data) &&
    !isAiPostingConfigDirty(effectiveConfig, settings.data?.configuration) &&
    !save.isPending;
  const section = "space-y-4 bg-neutral-900/60";
  return (
    <div className="@container min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-3 @min-[54rem]:flex-nowrap @min-[54rem]:[&>[role=tablist]]:shrink-0">
        {viewNavigation}
        {settings.data && <AiPostingSettingsTabs
          value={settingsTab}
          onChange={changeSettingsTab}
          hrefForTab={settingsTabHref}
        />}
        {settings.data && <AiPostingChannelAnalysis key={channelId} channelId={channelId}
          version={settings.data.configurationVersion} dirty={!settingsReady}
          onUse={(configuration) => {
            patch(configuration as Partial<Config>);
            changeSettingsTab("writing");
          }}
        />}
      </div>
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
          <div className="grid min-w-0 grid-cols-1 gap-4 @min-[58rem]:grid-cols-[minmax(0,390px)_minmax(0,1fr)]">
            <section aria-label="Тестовые публикации" className="min-w-0">
              <AiPostingTestConsole
                key={channelId}
                channelId={channelId}
                channelTitle={channelTitle}
                captionLengthMax={captionLengthMax}
                messageLengthMax={messageLengthMax}
                channelPhotoUrl={settings.data?.channel?.photoUrl ?? cachedChannelPhotoUrl}
                watermarkPreview={{
                  enabled: config.useChannelAvatarInMedia,
                  size: config.channelAvatarWatermarkSize ?? 12,
                  opacity: config.channelAvatarWatermarkOpacity ?? 100,
                  x: config.channelAvatarWatermarkX ?? 100,
                  y: config.channelAvatarWatermarkY ?? 100,
                  legacySize: settings.data?.configuration.useChannelAvatarInMedia
                    ? settings.data.configuration.channelAvatarWatermarkSize ?? 12
                    : undefined,
                  onPositionChange: (x, y) => patch({
                    channelAvatarWatermarkX: x,
                    channelAvatarWatermarkY: y,
                  }),
                }}
                customEmojiPacks={endingEmoji.packs}
                preferenceIcons={aiPostingPreferenceIcons(
                  effectiveConfig.mediaPreferences,
                  settings.data?.mediaPreferenceIcons,
                )}
                dailyPostCount={3}
                settingsReady={settingsReady}
                onRememberImageRule={rememberImageRule}
              />
            </section>
            <section
              className="min-w-0 space-y-3"
              aria-label="Настройки AI Posting"
            >
              <div hidden={settingsTab !== "chat"}>
                <AiPostingChat
                  key={channelId}
                  channelId={channelId}
                  active={settingsTab === "chat"}
                  settingsReady={settingsReady}
                />
              </div>
              <div hidden={settingsTab !== "idea"}>
                <Card className={section}>
                  <h2 className="text-lg font-semibold">Идея канала</h2>
                  <p className="text-sm text-neutral-400">
                    Определите аудиторию и ценность канала. Язык задаёт язык
                    публикаций.
                  </p>
                  <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-3">
                    <FormField label="Для кого этот канал">
                      <Textarea
                        value={config.audience}
                        onChange={(e) => patch({ audience: e.target.value })}
                        rows={3}
                        placeholder="Кому адресованы публикации и что важно этой аудитории"
                      />
                    </FormField>
                    <FormField label="Что я хочу дать аудитории">
                      <Textarea
                        value={config.topic}
                        onChange={(e) => patch({ topic: e.target.value })}
                        rows={3}
                        placeholder="Какую пользу, знания или эмоции должны получать читатели"
                      />
                    </FormField>
                  </div>
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
                        { value: "uk", label: "Українська", iconEmoji: "🇺🇦" },
                        { value: "de", label: "Deutsch", iconEmoji: "🇩🇪" },
                        { value: "es", label: "Español", iconEmoji: "🇪🇸" },
                      ]}
                    />
                  </FormField>
                  <AiPostingTaxonomyEditor
                    spheres={config.spheres ?? []}
                    rubrics={config.rubrics ?? []}
                    lengths={
                      config.lengths?.length
                        ? config.lengths
                        : DEFAULT_AI_POSTING_LENGTHS
                    }
                    mediaPreferences={effectiveConfig.mediaPreferences ?? []}
                    iconPresentations={
                      settings.data?.mediaPreferenceIcons ?? {}
                    }
                    onSpheres={(spheres) => patch({ spheres })}
                    onRubrics={(rubrics) => patch({ rubrics })}
                    onLengths={(lengths) => patch({ lengths })}
                  />
                  <AiPostingSphereWeights spheres={config.spheres ?? []} weights={config.sphereWeights ?? {}}
                    onChange={(sphereWeights) => patch({ sphereWeights })} />
                </Card>
              </div>
              <div hidden={settingsTab !== "writing"}>
                <Card className={section}>
                  <h2 className="text-lg font-semibold">Как писать</h2>
                  <FormField label="Редакционный стиль канала">
                    <Textarea value={config.style ?? ""} rows={4} maxLength={1200}
                      onChange={(event) => patch({ style: event.currentTarget.value })} />
                  </FormField>
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
                        onChange={(e) => patch({ historyFrom: e.target.value })}
                      />
                    </FormField>
                  )}
                  <ToggleRow
                    checked={config.variedLength}
                    onChange={(variedLength) => patch({ variedLength })}
                    label="Автоопределять длину публикации"
                  />
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
                          label: "Уместные эмодзи в начале и по тексту",
                        },
                      ]}
                    />
                  </FormField>
                  <FormField label="Постоянная концовка">
                    <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/70 p-3">
                      <p className="text-xs text-neutral-400">
                        Если пользовательская концовка пустая, публикация
                        автоматически получает базовую концовку канала.
                      </p>
                      {effectiveEnding ? (
                        <div className="overflow-hidden rounded-lg border border-[#263849] bg-[#0e1621]">
                          <div className="flex items-center gap-2 border-b border-[#263849] bg-[#17212b] px-3 py-2">
                            <TelegramEntityAvatar
                              imageUrl={
                                settings.data?.channel?.photoUrl ??
                                cachedChannelPhotoUrl
                              }
                              kind="channel"
                              alt={channelTitle}
                              size="xs"
                            />
                            <span className="truncate text-xs font-medium text-white">
                              {channelTitle}
                            </span>
                          </div>
                          <div className="telegram-preview-wallpaper p-2.5">
                            <div className="telegram-message-bubble overflow-hidden rounded-[18px] rounded-bl-[5px] bg-[#182533] px-3.5 py-3 shadow-md">
                              <RenderedPreviewText
                                text={endingPreview}
                                customEmojiPacks={endingEmoji.packs}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-3 text-sm text-neutral-400">
                          У канала нет ссылки для базовой концовки.
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          onClick={() => {
                            setEndingDraft(config.ending || baseEnding);
                            setEndingEditorOpen(true);
                          }}
                        >
                          <Pencil size={15} /> Настроить концовку
                        </Button>
                        {config.ending ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => patch({ ending: "" })}
                          >
                            <RotateCcw size={15} /> Вернуть базовую
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </FormField>
                  <FormField label="Хэштеги">
                    <CustomSelect
                      ariaLabel="Хэштеги"
                      value={config.hashtags}
                      onChange={(hashtags) => patch({ hashtags })}
                      options={[
                        { value: "disabled", label: "Отключены" },
                        { value: "start", label: "В начале публикации" },
                        { value: "end", label: "В конце публикации" },
                        {
                          value: "ending_inline",
                          label: "Один хэштег рядом с концовкой",
                        },
                      ]}
                    />
                  </FormField>
                </Card>
              </div>
              <div hidden={settingsTab !== "images"} className="space-y-3">
                <Card>
                  <FormField label="Общий визуальный стиль канала">
                    <Textarea value={config.visualStyle ?? ""} rows={3} maxLength={850}
                      onChange={(event) => patch({ visualStyle: event.currentTarget.value })} />
                  </FormField>
                  <ToggleRow checked={config.visualVariety === true}
                    onChange={(visualVariety) => patch({ visualVariety })}
                    label="Чередовать формы изображений"
                    description="Натюрморт, иллюстрация, пейзаж, визуальная метафора и репортажный кадр. Для партии эти формы задают композицию вместо привязанных к сферам медиа-предпочтений." />
                </Card>
                <AiPostingImagesSection
                  key={channelId}
                  channelId={channelId}
                  mode={config.imageMode}
                  hybridSearchPercent={effectiveConfig.hybridSearchPercent}
                  imageSearchSources={effectiveConfig.imageSearchSources}
                  onImageSearchSources={(imageSearchSources) => patch({ imageSearchSources })}
                  onHybridSearchPercent={(hybridSearchPercent) => patch({ hybridSearchPercent })}
                  preferences={effectiveConfig.mediaPreferences}
                  avoidances={config.imageAvoidances ?? []}
                  channelAvatarUrl={
                    settings.data?.channel?.photoUrl ?? cachedChannelPhotoUrl
                  }
                  useChannelAvatarInMedia={config.useChannelAvatarInMedia}
                  watermarkSize={config.channelAvatarWatermarkSize ?? 12}
                  watermarkOpacity={config.channelAvatarWatermarkOpacity ?? 100}
                  watermarkX={config.channelAvatarWatermarkX ?? 100}
                  watermarkY={config.channelAvatarWatermarkY ?? 100}
                  onWatermarkPosition={(x, y) => patch({
                    channelAvatarWatermarkX: x,
                    channelAvatarWatermarkY: y,
                  })}
                  onMode={(imageMode) => patch({ imageMode })}
                  onPreferences={(mediaPreferences) =>
                    patch({ mediaPreferences })
                  }
                  onAvoidances={(imageAvoidances) => patch({ imageAvoidances })}
                  onUseChannelAvatarInMedia={(useChannelAvatarInMedia) =>
                    patch({ useChannelAvatarInMedia })
                  }
                  onWatermarkSize={(channelAvatarWatermarkSize) =>
                    patch({ channelAvatarWatermarkSize })
                  }
                  onWatermarkOpacity={(channelAvatarWatermarkOpacity) =>
                    patch({ channelAvatarWatermarkOpacity })
                  }
                />
              </div>
              {settingsTab === "autopilot" ? (
                <AiPostingAutopilot key={channelId} channelId={channelId} />
              ) : null}
              <div hidden={settingsTab !== "transfer"}>
                <Card className={section}>
                  <AiPostingSettingsTransfer
                    channelId={channelId}
                    configuration={effectiveConfig}
                    onImported={async () => {
                      setConfigs((current) => {
                        const next = { ...current };
                        delete next[channelId];
                        return next;
                      });
                      await client.invalidateQueries({
                        queryKey: key(channelId),
                      });
                    }}
                  />
                </Card>
              </div>
              {settingsTab !== "chat" && settingsTab !== "transfer" && settingsTab !== "autopilot" ? (
                <div className="flex justify-end border-t border-neutral-800 pt-3">
                  <Button
                    disabled={
                      save.isPending ||
                      !isAiPostingConfigDirty(
                        effectiveConfig,
                        settings.data?.configuration,
                      )
                    }
                    onClick={() => save.mutate(effectiveConfig)}
                  >
                    <Save size={16} />
                    {save.isPending ? "Сохраняем…" : "Сохранить настройки"}
                  </Button>
                </div>
              ) : null}
              {save.isError && (
                <p role="alert" className="text-sm text-rose-300">
                  {(save.error as { response?: { status?: number } })?.response?.status === 409
                    ? "Настройки канала изменились. Скопируйте свои правки и обновите страницу."
                    : "Не удалось сохранить настройки."}
                </p>
              )}
            </section>
          </div>
        </>
      )}
      <Modal
        open={endingEditorOpen}
        onClose={() => setEndingEditorOpen(false)}
        title="Редактор концовки"
        size="xl"
        footer={
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEndingEmojiPacksOpen(true)}
            >
              Управление наборами эмодзи
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEndingEditorOpen(false)}
              >
                Отмена
              </Button>
              <Button
                type="button"
                onClick={() => {
                  patch({
                    ending: endingDraft === baseEnding ? "" : endingDraft,
                  });
                  setEndingEditorOpen(false);
                }}
              >
                Сохранить концовку
              </Button>
            </div>
          </div>
        }
      >
        <p className="mb-3 text-sm text-neutral-400">
          Форматирование, эмодзи и ссылки можно редактировать прямо в тексте.
          Очистите поле и сохраните, чтобы снова использовать базовую концовку
          канала.
        </p>
        <div className="min-h-40 rounded-lg border border-neutral-700 bg-neutral-950 p-3 [&_[role=textbox]]:min-h-32">
          <EditableTelegramPreviewText
            value={endingDraft}
            onChange={setEndingDraft}
            customEmojiPacks={endingEmoji.packs}
            ariaLabel="Текст концовки"
          />
        </div>
      </Modal>
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
