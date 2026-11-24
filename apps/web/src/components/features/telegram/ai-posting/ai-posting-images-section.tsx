"use client";

import { DEFAULT_TELEGRAM_AI_POSTING_SEARCH_PERCENT, DEFAULT_TELEGRAM_AI_POSTING_IMAGE_URLS } from "@telegram-system/shared";

import {
  Button,
  Card,
  CustomSelect,
  FormField,
  IconButton,
  Input,
  ToggleRow,
  Textarea,
} from "@/components/ui/primitives";
import * as Slider from "@radix-ui/react-slider";
import { Blend, Images, WandSparkles } from "lucide-react";
import { AiPostingMediaPreferenceEditor } from "./ai-posting-media-preference-editor";
import type { AiPostingMediaPreference } from "./ai-posting-media-preferences";

export function AiPostingImagesSection({
  channelId,
  mode,
  hybridSearchPercent = DEFAULT_TELEGRAM_AI_POSTING_SEARCH_PERCENT,
  onHybridSearchPercent,
  imageSearchSources,
  onImageSearchSources,
  preferences,
  avoidances,
  channelAvatarUrl,
  useChannelAvatarInMedia,
  watermarkSize = 12,
  watermarkOpacity = 100,
  watermarkX = 100,
  watermarkY = 100,
  onWatermarkPosition,
  onMode,
  onPreferences,
  onAvoidances,
  onUseChannelAvatarInMedia,
  onWatermarkSize,
  onWatermarkOpacity,
}: {
  channelId?: string;
  mode: string;
  hybridSearchPercent?: number;
  imageSearchSources?: string[];
  onImageSearchSources?: (value: string[]) => void;
  onHybridSearchPercent?: (value: number) => void;
  preferences: AiPostingMediaPreference[];
  avoidances: string[];
  channelAvatarUrl: string | null;
  useChannelAvatarInMedia: boolean;
  watermarkSize?: number;
  watermarkOpacity?: number;
  watermarkX?: number;
  watermarkY?: number;
  onWatermarkPosition?: (x: number, y: number) => void;
  onMode: (value: string) => void;
  onPreferences: (value: AiPostingMediaPreference[]) => void;
  onAvoidances: (value: string[]) => void;
  onUseChannelAvatarInMedia: (value: boolean) => void;
  onWatermarkSize?: (value: number) => void;
  onWatermarkOpacity?: (value: number) => void;
}) {
  return (
    <Card className="space-y-4 bg-neutral-900/60">
      <h2 className="text-lg font-semibold">Медиа</h2>
      <FormField label="Медиа для публикаций">
        <CustomSelect
          value={mode}
          onChange={onMode}
          options={[
            {
              value: "found",
              label: "Сначала поиск",
              icon: <Images size={16} />,
            },
            {
              value: "ai",
              label: "AI-генерация для каждой публикации",
              icon: <WandSparkles size={16} />,
            },
            {
              value: "hybrid",
              label: "Гибридный режим",
              icon: <Blend size={16} />,
            },
          ]}
        />
      </FormField>
      <p className="text-xs text-neutral-400">
        {mode === "ai"
          ? "Каждая новая публикация получает новое AI-медиа. Кнопка «Новое медиа» меняет только открытую публикацию; прежнее визуальное направление запоминается и исключается из будущих запросов."
          : mode === "hybrid"
            ? "Доли задают план подбора. При приоритете поиска AI может заменить неудачные поиски, но не займёт больше половины слотов. Если лимит исчерпан, текст сохраняется для повторного подбора."
            : "Сначала ищем во включённых источниках и открытых каталогах. Если подходящего изображения нет, AI создаёт его."}
      </p>
      {mode !== "ai" && onImageSearchSources && (
        <FormField label="Источники поиска">
          <Textarea
            aria-label="Источники поиска"
            rows={3}
            value={(imageSearchSources ?? DEFAULT_TELEGRAM_AI_POSTING_IMAGE_URLS).join("\n")}
            onChange={(event) => onImageSearchSources(event.target.value.split("\n"))}
            onBlur={(event) => onImageSearchSources(event.target.value.split("\n").map((url) => url.trim()).filter(Boolean))}
            placeholder="https://www.pinterest.com/"
          />
          <p className="text-xs text-neutral-400">Одна ссылка на сайт в каждой строке. Поиск идёт в указанном порядке.</p>
        </FormField>
      )}
      {mode === "hybrid" && (
        <div className="rounded-lg border border-neutral-800 p-3">
          <MediaPercentSlider
            label="Поиск изображений"
            value={hybridSearchPercent}
            min={0}
            max={100}
            step={1}
            onChange={onHybridSearchPercent}
            complement="AI-генерация"
          />
        </div>
      )}
      <ToggleRow
        checked={useChannelAvatarInMedia}
        onChange={onUseChannelAvatarInMedia}
        label="Добавлять аватар канала на медиа"
        className="min-h-12 min-w-0 px-3 py-1.5 text-sm"
      />
      {!channelAvatarUrl && useChannelAvatarInMedia ? (
        <p className="text-xs text-amber-300">
          У канала пока нет загруженного аватара.
        </p>
      ) : null}
      <p className="-mt-2 text-xs text-neutral-400">
        Перетащите водяной знак на фото в превью, чтобы изменить его положение.
      </p>
      {useChannelAvatarInMedia ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3 rounded-lg border border-blue-900/70 bg-blue-950/20 p-3">
          <MediaPercentSlider label="Размер водяного знака" value={watermarkSize} min={5} max={30} step={1} onChange={onWatermarkSize} />
          <MediaPercentSlider label="Непрозрачность водяного знака" value={watermarkOpacity} min={10} max={100} step={5} onChange={onWatermarkOpacity} />
          {(["X", "Y"] as const).map((axis) => (
            <label key={axis} className="space-y-1 text-sm">
              <span>{axis} (%)</span>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                aria-label={axis}
                value={axis === "X" ? watermarkX : watermarkY}
                onChange={(event) => {
                  const value = event.currentTarget.valueAsNumber;
                  if (!Number.isFinite(value)) return;
                  const position = Math.max(0, Math.min(100, value));
                  onWatermarkPosition?.(
                    axis === "X" ? position : watermarkX,
                    axis === "Y" ? position : watermarkY,
                  );
                }}
              />
            </label>
          ))}
        </div>
      ) : null}
      <AiPostingMediaPreferenceEditor
        channelId={channelId}
        preferences={preferences}
        onChange={onPreferences}
      />
      {avoidances.length > 0 && (
        <details className="rounded-md border border-neutral-800 p-3">
          <summary className="cursor-pointer text-sm text-neutral-200">
            Избегать в будущем медиа ({avoidances.length})
          </summary>
          <p className="mt-2 text-xs text-neutral-400">
            Когда вы нажимаете «Новое медиа», прежнее направление добавляется
            сюда. Оно учитывается при следующих генерациях.
          </p>
          <ul className="mt-2 space-y-2">
            {avoidances.map((avoidance, index) => (
              <li
                key={`${avoidance}-${index}`}
                className="flex min-w-0 items-start justify-between gap-2 rounded border border-neutral-800 px-2 py-1.5 text-xs"
              >
                <span className="min-w-0 break-words">{avoidance}</span>
                <IconButton
                  type="button"
                  kind="delete"
                  aria-label={`Удалить нежелательное направление ${index + 1}`}
                  title="Перестать избегать"
                  onClick={() =>
                    onAvoidances(avoidances.filter((_, i) => i !== index))
                  }
                />
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="secondary"
            className="mt-2"
            onClick={() => onAvoidances([])}
          >
            Очистить список
          </Button>
        </details>
      )}
    </Card>
  );
}

function MediaPercentSlider({ label, value, min, max, step, onChange, complement }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange?: (value: number) => void;
  complement?: string;
}) {
  return (
    <div className="min-w-0 text-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <span>{label} <span className="text-blue-200">{value}%</span></span>
        {complement && <span>{complement} {100 - value}%</span>}
      </div>
      <Slider.Root value={[value]} min={min} max={max} step={step}
        onValueChange={([next]) => onChange?.(next)}
        className="relative flex h-8 w-full touch-none select-none items-center">
        <Slider.Track className="relative h-2 grow overflow-hidden rounded-full bg-neutral-800">
          <Slider.Range className="absolute h-full rounded-full bg-blue-500" />
        </Slider.Track>
        <Slider.Thumb aria-label={label} className="block size-4 rounded-full border-2 border-white bg-blue-500 outline-none focus-visible:ring-4 focus-visible:ring-blue-500/40" />
      </Slider.Root>
    </div>
  );
}
