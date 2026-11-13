"use client";

import {
  Button,
  Card,
  CustomSelect,
  FormField,
  IconButton,
  ToggleRow,
} from "@/components/ui/primitives";
import { TelegramEntityAvatar } from "../telegram/telegram-entity-avatar";
import { AiPostingMediaPreferenceEditor } from "./ai-posting-media-preference-editor";
import type { AiPostingMediaPreference } from "./ai-posting-media-preferences";

export function AiPostingImagesSection({
  mode,
  preferences,
  avoidances,
  channelAvatarUrl,
  useChannelAvatarInMedia,
  onMode,
  onPreferences,
  onAvoidances,
  onUseChannelAvatarInMedia,
}: {
  mode: string;
  preferences: AiPostingMediaPreference[];
  avoidances: string[];
  channelAvatarUrl: string | null;
  useChannelAvatarInMedia: boolean;
  onMode: (value: string) => void;
  onPreferences: (value: AiPostingMediaPreference[]) => void;
  onAvoidances: (value: string[]) => void;
  onUseChannelAvatarInMedia: (value: boolean) => void;
}) {
  return (
    <Card className="space-y-4 bg-neutral-900/60">
      <h2 className="text-lg font-semibold">Медиа</h2>
      <FormField label="Медиа для публикаций">
        <CustomSelect
          value={mode}
          onChange={onMode}
          options={[
            { value: "found", label: "Найденные медиа" },
            { value: "ai", label: "AI-генерация для каждой публикации" },
            { value: "hybrid", label: "Гибридный режим" },
          ]}
        />
      </FormField>
      <p className="text-xs text-neutral-400">
        {mode === "ai"
          ? "Каждая новая публикация получает новое AI-медиа. Кнопка «Новое медиа» меняет только открытую публикацию; прежнее визуальное направление запоминается и исключается из будущих запросов."
          : mode === "hybrid"
            ? "Режим чередует поиск в открытом каталоге Openverse и AI-генерацию. Кнопка «Новое медиа» создаёт AI-замену только для открытой публикации."
            : "Для новых публикаций выбираются медиа из включённых источников и открытого каталога. Кнопка «Новое медиа» создаёт AI-замену только для открытой публикации."}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-800 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ToggleRow
            checked={useChannelAvatarInMedia}
            onChange={onUseChannelAvatarInMedia}
            label="Добавлять аватар канала на медиа"
            className="min-w-0 flex-1 border-0 p-0"
          />
          {channelAvatarUrl && useChannelAvatarInMedia ? (
            <TelegramEntityAvatar
              imageUrl={channelAvatarUrl}
              kind="channel"
              alt="Аватар канала для водяного знака"
              size="sm"
            />
          ) : null}
        </div>
        {!channelAvatarUrl && useChannelAvatarInMedia ? (
          <p className="basis-full text-xs text-amber-300">
            У канала пока нет загруженного аватара.
          </p>
        ) : null}
      </div>
      <p className="-mt-2 text-xs text-neutral-400">
        Логотип появится в правом нижнем углу изображения.
      </p>
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
