"use client";

import {
  Button,
  Card,
  CustomSelect,
  FormField,
  IconButton,
  Input,
  ToggleRow,
} from "@/components/ui/primitives";
import * as Slider from "@radix-ui/react-slider";
import { Blend, Images, WandSparkles } from "lucide-react";
import { AiPostingMediaPreferenceEditor } from "./ai-posting-media-preference-editor";
import type { AiPostingMediaPreference } from "./ai-posting-media-preferences";

export function AiPostingImagesSection({
  mode,
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
  mode: string;
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
              label: "Найденные медиа",
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
            ? "Сначала ищем подходящее изображение в открытом каталоге Openverse. Если подходящего не найдётся, создаём новое с помощью AI. Кнопка «Новое медиа» создаёт AI-замену только для открытой публикации."
            : "Для новых публикаций выбираются медиа из включённых источников и открытого каталога. Кнопка «Новое медиа» создаёт AI-замену только для открытой публикации."}
      </p>
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
        <div className="grid gap-3 rounded-lg border border-blue-900/70 bg-blue-950/20 p-3 sm:grid-cols-2">
          <WatermarkSlider label="Размер водяного знака" value={watermarkSize} min={5} max={30} step={1} onChange={onWatermarkSize} />
          <WatermarkSlider label="Непрозрачность водяного знака" value={watermarkOpacity} min={10} max={100} step={5} onChange={onWatermarkOpacity} />
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

function WatermarkSlider({ label, value, min, max, step, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange?: (value: number) => void;
}) {
  return (
    <div className="min-w-0 text-sm">
      <div className="flex justify-between gap-2">
        <span>{label}</span>
        <span className="text-blue-200">{value}%</span>
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
