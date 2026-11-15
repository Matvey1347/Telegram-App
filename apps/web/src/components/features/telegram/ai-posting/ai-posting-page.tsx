"use client";

import { useEffect, useState } from "react";
import { Save, Sparkles } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  CustomSelect,
  FormField,
  ToggleRow,
  Tooltip,
  Textarea,
} from "@/components/ui/primitives";
import { DateInput } from "@/components/ui/date-inputs";
import {
  telegramChannelKeys,
} from "@/lib/query-keys";
import {
  api,
  telegramChannelsApi,
} from "@/lib/api";
import { AiPostingChat } from "./ai-posting-chat";
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
import { AiPostingSettingsTransfer } from "./ai-posting-settings-transfer";
import {
  AiPostingSettingsTabs,
  type AiPostingSettingsTab,
} from "./ai-posting-settings-tabs";
import { TelegramCustomEmojiPickerModal } from "../telegram/telegram-custom-emoji-picker-modal";
import { TelegramCustomEmojiPacksModal } from "../telegram/telegram-custom-emoji-packs-modal";
import { EditableTelegramPreviewText } from "../telegram/telegram-post-preview";
import { customEmojiToken } from "../telegram/telegram-custom-emoji";
import { workspaceKeys } from "@/lib/query-keys";
import type { ResolvedEmoji } from "@telegram-system/shared";
import type { TelegramCustomEmoji } from "@telegram-system/shared";
import type { TelegramChannelSelectOption } from "@/lib/api-types/telegram/telegram-channels";

type Config = {
  language: string;
  topic: string;
  audience: string;
  historyMode: string;
  historyFrom: string;
  variedLength: boolean;
  emojiPolicy: "start" | "contextual";
  ending: string;
  hashtags: string;
  imageMode: string;
  mediaPreferences?: AiPostingMediaPreference[];
  spheres: AiPostingSphere[];
  rubrics: AiPostingRubric[];
  lengths: AiPostingLength[];
  imageAvoidances?: string[];
  useChannelAvatarInMedia: boolean;
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
  imageMode: "ai",
  mediaPreferences: [],
  spheres: [],
  rubrics: [],
  lengths: DEFAULT_AI_POSTING_LENGTHS,
  imageAvoidances: [],
  useChannelAvatarInMedia: false,
};
const key = (id: string) => ["telegram-ai-posting", id] as const;
type SettingsResponse = {
  mediaPreferenceIcons?: Record<string, ResolvedEmoji>;
  channel?: { photoUrl?: string | null };
  configuration: Config;
  mode: "TEST" | "REVIEW";
  draftExpirationDays: number;
  configured: boolean;
  detectedLanguage: string;
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
    useState<AiPostingSettingsTab>("idea");
  useEffect(() => {
    const syncTabFromUrl = () => {
      const requested = new URLSearchParams(window.location.search).get("aiPostingTab");
      if (["chat", "idea", "writing", "images", "transfer"].includes(requested ?? "")) {
        setSettingsTab(requested as AiPostingSettingsTab);
      } else {
        setSettingsTab("idea");
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
  const [endingPremiumPickerOpen, setEndingPremiumPickerOpen] = useState(false);
  const [endingEmojiPacksOpen, setEndingEmojiPacksOpen] = useState(false);
  const [endingPremiumEmojiRequested, setEndingPremiumEmojiRequested] =
    useState(false);
  const settings = useQuery<SettingsResponse>({
    queryKey: key(channelId),
    queryFn: async () =>
      (await api.get(`/telegram-channels/${channelId}/ai-posting`)).data as {
        configuration: Config;
        mode: SettingsResponse["mode"];
        draftExpirationDays: number;
        configured: boolean;
        detectedLanguage: string;
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
  const endingEmojiPacks = useQuery({
    queryKey: workspaceKeys.telegramCustomEmojiPacks(),
    queryFn: () => telegramChannelsApi.customEmojiPacks(),
    enabled:
      /!\[[^\]\n]*\]\(tg:\/\/emoji\?id=\d+\)/.test(config.ending) ||
      endingEmojiPacksOpen ||
      (endingPremiumPickerOpen && endingPremiumEmojiRequested),
  });
  const endingEmoji = useEndingEmojiPacks(
    config.ending,
    endingEmojiPacks.data?.packs,
  );
  const effectiveConfig = {
    ...config,
    mediaPreferences: normalizeAiPostingMediaPreferences(config),
  };
  const saveValues = {
    mode: settings.data?.mode ?? "TEST",
    draftExpirationDays: settings.data?.draftExpirationDays ?? 30,
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
                customEmojiPacks={endingEmoji.packs}
                preferenceIcons={aiPostingPreferenceIcons(effectiveConfig.mediaPreferences, settings.data?.mediaPreferenceIcons)}
                dailyPostCount={3}
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
                onChange={changeSettingsTab}
                hrefForTab={settingsTabHref}
              />
              <div hidden={settingsTab !== "chat"}><AiPostingChat key={channelId} channelId={channelId} active={settingsTab === "chat"} settingsReady={settingsReady} /></div>
              <div hidden={settingsTab !== "idea"}>
                <Card className={section}>
                  <h2 className="text-lg font-semibold">Идея канала</h2>
                  <p className="text-sm text-neutral-400">Определите аудиторию и ценность канала. Язык задаёт язык публикаций.</p>
                  <div className="grid min-w-0 gap-3 md:grid-cols-2">
                    <FormField label="Для кого этот канал">
                      <Textarea value={config.audience} onChange={(e) => patch({ audience: e.target.value })} rows={3} placeholder="Кому адресованы публикации и что важно этой аудитории" />
                    </FormField>
                    <FormField label="Что я хочу дать аудитории">
                      <Textarea value={config.topic} onChange={(e) => patch({ topic: e.target.value })} rows={3} placeholder="Какую пользу, знания или эмоции должны получать читатели" />
                    </FormField>
                  </div>
                  <FormField label="Язык">
                    <CustomSelect value={config.language} onChange={(language) => patch({ language })} placeholder="Автоопределение из канала" options={[
                      { value: "", label: `Автоопределение · ${({ ru: "🇷🇺 Русский", en: "🇬🇧 English", uk: "🇺🇦 Українська", de: "🇩🇪 Deutsch", es: "🇪🇸 Español" } as Record<string, string>)[settings.data?.detectedLanguage ?? ""] || "выберите язык вручную"}` },
                      { value: "ru", label: "Русский", iconEmoji: "🇷🇺" }, { value: "en", label: "English", iconEmoji: "🇬🇧" }, { value: "uk", label: "Українська", iconEmoji: "🇺🇦" }, { value: "de", label: "Deutsch", iconEmoji: "🇩🇪" }, { value: "es", label: "Español", iconEmoji: "🇪🇸" },
                    ]} />
                  </FormField>
                  <AiPostingTaxonomyEditor
                    spheres={config.spheres ?? []}
                    rubrics={config.rubrics ?? []}
                    lengths={config.lengths?.length ? config.lengths : DEFAULT_AI_POSTING_LENGTHS}
                    mediaPreferences={effectiveConfig.mediaPreferences ?? []}
                    onSpheres={(spheres) => patch({ spheres })}
                    onRubrics={(rubrics) => patch({ rubrics })}
                    onLengths={(lengths) => patch({ lengths })}
                  />
                </Card>
              </div>
              <div hidden={settingsTab !== "writing"}>
                <Card className={section}>
                  <h2 className="text-lg font-semibold">Как писать</h2>
                  <FormField label="Использование истории публикаций"><CustomSelect value={config.historyMode} onChange={(historyMode) => patch({ historyMode })} options={[{ value: "all", label: "Вся история" }, { value: "since", label: "С выбранной даты" }, { value: "none", label: "Не использовать" }]} /></FormField>
                  {config.historyMode === "since" && <FormField label="Начальная дата"><DateInput type="date" value={config.historyFrom} onChange={(e) => patch({ historyFrom: e.target.value })} /></FormField>}
                  <ToggleRow checked={config.variedLength} onChange={(variedLength) => patch({ variedLength })} label="Автоопределять длину публикации" />
                  <FormField label="Эмодзи в публикациях"><CustomSelect value={config.emojiPolicy} onChange={(emojiPolicy) => patch({ emojiPolicy: emojiPolicy as Config["emojiPolicy"] })} options={[{ value: "start", label: "Один уместный эмодзи в начале" }, { value: "contextual", label: "Уместные эмодзи по тексту" }]} /></FormField>
                  <FormField label="Постоянная концовка"><div className="relative min-h-[60px] rounded-md border border-neutral-700 bg-neutral-900 py-2 pl-3 pr-12 focus-within:border-blue-500 [&_[role=textbox]]:min-h-[40px]"><EditableTelegramPreviewText value={config.ending} onChange={(ending) => patch({ ending })} customEmojiPacks={endingEmojiPacks.data?.packs ?? []} ariaLabel="Постоянная концовка" /><div className="absolute right-2 top-2"><Tooltip content="Вставить Premium-эмодзи"><button type="button" aria-label="Вставить Premium-эмодзи" onClick={() => { setEndingPremiumPickerOpen(true); setEndingPremiumEmojiRequested(true); }} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><Sparkles size={16}/></button></Tooltip></div></div><p className="text-xs text-neutral-500">Аватар можно добавить как custom emoji в Telegram.</p></FormField>
                  <FormField label="Хэштеги"><CustomSelect ariaLabel="Хэштеги" value={config.hashtags} onChange={(hashtags) => patch({ hashtags })} options={[{ value: "disabled", label: "Отключены" }, { value: "start", label: "В начале публикации" }, { value: "end", label: "В конце публикации" }, { value: "ending_inline", label: "Один хэштег рядом с концовкой" }]} /></FormField>
                </Card>
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
              <div hidden={settingsTab !== "transfer"}>
                <Card className={section}>
                  <AiPostingSettingsTransfer channelId={channelId} configuration={effectiveConfig} onImported={async () => {
                    setConfigs((current) => { const next = { ...current }; delete next[channelId]; return next; });
                    await client.invalidateQueries({ queryKey: key(channelId) });
                  }}/>
                </Card>
              </div>
              {settingsTab !== "chat" && settingsTab !== "transfer" ? <div className="flex justify-end border-t border-neutral-800 pt-3">
                <Button
                  disabled={save.isPending}
                  onClick={() => save.mutate(effectiveConfig)}
                >
                  <Save size={16} />
                  {save.isPending ? "Сохраняем…" : "Сохранить настройки"}
                </Button>
              </div> : null}
              {save.isError && (
                <p role="alert" className="text-sm text-rose-300">
                  Не удалось сохранить настройки.
                </p>
              )}
            </section>
          </div>
        </>
      )}
      {endingPremiumPickerOpen && (
        <TelegramCustomEmojiPickerModal
          open
          onClose={() => setEndingPremiumPickerOpen(false)}
          packs={endingEmojiPacks.data?.packs ?? []}
          onSelect={(emoji: TelegramCustomEmoji) => {
            const ending = config.ending.trimEnd();
            patch({
              ending: `${ending}${ending ? " " : ""}${customEmojiToken(emoji)}`,
            });
            setEndingPremiumPickerOpen(false);
          }}
          onSelectStandard={(emoji) => {
            const ending = config.ending.trimEnd();
            patch({ ending: `${ending}${ending ? " " : ""}${emoji}` });
            setEndingPremiumPickerOpen(false);
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
