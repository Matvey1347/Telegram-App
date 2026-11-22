"use client";

import { TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES, TELEGRAM_AI_POSTING_MAX_REFERENCE_IMAGE_BYTES } from "@telegram-system/shared";
import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { IconPicker } from "@/components/icons/icon-picker";
import {
  Button,
  FormField,
  IconButton,
  Input,
  Textarea,
} from "@/components/ui/primitives";
import { TelegramPostMediaUpload } from "../telegram/telegram-post-media-upload";
import type { AiPostingMediaPreference } from "./ai-posting-media-preferences";

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const blankPreference = (): AiPostingMediaPreference => ({
  id: "",
  name: "",
  description: "",
  emoji: "🎨",
  references: [],
  purpose: "BOTH",
});

export function AiPostingMediaPreferenceEditor({
  preferences,
  onChange,
}: {
  preferences: AiPostingMediaPreference[];
  onChange: (value: AiPostingMediaPreference[]) => void;
}) {
  const [draft, setDraft] = useState<AiPostingMediaPreference | null>(null);
  const isEditing = Boolean(draft?.id);
  const updateDraft = (patch: Partial<AiPostingMediaPreference>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));
  const save = () => {
    if (!draft?.name.trim()) return;
    const value = {
      ...draft,
      id: draft.id || newId(),
      name: draft.name.trim(),
    };
    onChange(
      draft.id
        ? preferences.map((item) => (item.id === draft.id ? value : item))
        : [...preferences, value],
    );
    setDraft(null);
  };

  return (
    <section className="space-y-3" aria-label="Предпочтения к медиа">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Предпочтения к медиа</h3>
        </div>
        <Button
          type="button"
          disabled={preferences.length >= 10}
          onClick={() => setDraft(blankPreference())}
        >
          <Plus size={15} /> Добавить предпочтение
        </Button>
      </div>

      {preferences.length >= 10 ? (
        <p className="text-xs text-neutral-400">
          Достигнут лимит в 10 предпочтений.
        </p>
      ) : null}
      {!preferences.length ? (
        <p className="rounded-lg border border-dashed border-neutral-800 p-4 text-sm text-neutral-500">
          Предпочтения ещё не добавлены.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {preferences.map((preference, index) => (
            <div
              key={preference.id}
              className="flex min-h-[68px] min-w-0 items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 px-2 py-1.5"
            >
              {preference.emojiIconId ? (
                <IconPicker
                  iconId={preference.emojiIconId}
                  onChange={(emojiIconId, icon) =>
                    onChange(
                      preferences.map((item) =>
                        item.id === preference.id
                          ? {
                              ...item,
                              emojiIconId: emojiIconId ?? undefined,
                              emoji:
                                icon?.type === "unicode"
                                  ? icon.value
                                  : item.emoji,
                            }
                          : item,
                      ),
                    )
                  }
                  buttonLabel="Эмодзи предпочтения"
                  ariaLabel={`Эмодзи предпочтения ${index + 1}`}
                  allowImages
                  compact
                  className="!h-8 !w-8 !min-w-8 !p-0.5"
                  iconClassName="!h-6 !w-6 !border-0 !bg-transparent"
                />
              ) : (
                <IconAvatar
                  icon={{ type: "unicode", value: preference.emoji || "🎨" }}
                  label={preference.name}
                  size="sm"
                  bordered={false}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">
                  {preference.name}
                </p>
                <div className="mt-0.5 flex min-w-0 items-center gap-2">
                  <span className="inline-flex rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300">
                    {preference.purpose === "SEARCH"
                      ? "Для поиска"
                      : preference.purpose === "GENERATION"
                        ? "Для генерации"
                        : "Поиск и генерация"}
                  </span>
                  <span
                    className="shrink-0 text-[10px] text-neutral-500"
                    aria-label={`${preference.references.length} референсов`}
                  >
                    {preference.references.length} реф.
                  </span>
                </div>
              </div>
              <Button
                type="button"
                className="h-8 w-8 !p-0"
                onClick={() => setDraft({ ...preference })}
                aria-label={`Редактировать предпочтение ${index + 1}`}
                title="Редактировать"
              >
                <Pencil size={14} />
              </Button>
              <IconButton
                type="button"
                kind="delete"
                className="!h-8 !w-8"
                aria-label={`Удалить предпочтение ${index + 1}`}
                title="Удалить предпочтение"
                onClick={() =>
                  onChange(
                    preferences.filter((item) => item.id !== preference.id),
                  )
                }
              />
            </div>
          ))}
        </div>
      )}

      {draft ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDraft(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="media-preference-dialog-title"
            className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
          >
            <header className="flex items-center justify-between gap-3">
              <h3
                id="media-preference-dialog-title"
                className="text-lg font-semibold text-white"
              >
                {isEditing
                  ? "Редактировать предпочтение"
                  : "Добавить предпочтение"}
              </h3>
              <IconButton
                type="button"
                aria-label="Закрыть"
                title="Закрыть"
                onClick={() => setDraft(null)}
              >
                <X size={16} />
              </IconButton>
            </header>
            <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
              <div>
                <label className="mb-1 block text-sm text-neutral-300">
                  Эмодзи
                </label>
                <IconPicker
                  iconId={draft.emojiIconId}
                  icon={
                    draft.emojiIconId
                      ? undefined
                      : { type: "unicode", value: draft.emoji || "🎨" }
                  }
                  onChange={(iconId, icon) =>
                    updateDraft({
                      emojiIconId: iconId ?? undefined,
                      emoji:
                        icon?.type === "unicode"
                          ? icon.value.slice(0, 16)
                          : "🎨",
                    })
                  }
                  buttonLabel="Выбрать эмодзи"
                  ariaLabel="Выбрать эмодзи предпочтения"
                  allowImages
                  compact
                />
              </div>
              <FormField label="Название предпочтения">
                <Input
                  aria-label="Название предпочтения"
                  value={draft.name}
                  onChange={(event) =>
                    updateDraft({ name: event.target.value })
                  }
                  maxLength={80}
                  placeholder="Например: рисованные бизнес-схемы"
                />
              </FormField>
            </div>
            <FormField label="Описание">
              <Textarea
                aria-label="Описание предпочтения"
                value={draft.description}
                onChange={(event) =>
                  updateDraft({ description: event.target.value })
                }
                maxLength={500}
                rows={3}
                placeholder="Палитра, композиция и детали, которые хочется видеть"
              />
            </FormField>
            <FormField label="Использовать предпочтение для">
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-neutral-800 bg-neutral-950 p-1">
                {(
                  [
                    ["SEARCH", "Поиска"],
                    ["GENERATION", "Генерации"],
                    ["BOTH", "Обоих"],
                  ] as const
                ).map(([purpose, label]) => (
                  <button
                    key={purpose}
                    type="button"
                    aria-pressed={(draft.purpose ?? "BOTH") === purpose}
                    onClick={() => updateDraft({ purpose })}
                    className={`rounded-md px-2 py-2 text-xs transition ${
                      (draft.purpose ?? "BOTH") === purpose
                        ? "bg-blue-600 text-white"
                        : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </FormField>
            <div>
              <p className="mb-1 text-sm font-medium text-neutral-200">
                Визуальные референсы · до{" "}
                {TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES}
              </p>
              <TelegramPostMediaUpload
                value={draft.references.map((url) => ({
                  kind: "PHOTO" as const,
                  url,
                }))}
                onChange={(items) =>
                  updateDraft({ references: items.map((item) => item.url) })
                }
                allowedKinds={["PHOTO"]}
                maxItems={TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES}
                maxFileSizeBytes={TELEGRAM_AI_POSTING_MAX_REFERENCE_IMAGE_BYTES}
                label="Добавить референсы"
                dropAreaLabel="Область референсов для предпочтения"
                dropPrompt="Перетащите изображение сюда или вставьте через ⌘/Ctrl+V"
                browseLabel="Выбрать файлы"
                sizeHint={`JPEG, PNG или WebP до 10 МБ · до ${TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES} изображений`}
                removeLabel="Удалить референс"
                showUrlInput={false}
              />
            </div>
            <footer className="flex justify-end gap-2 border-t border-neutral-800 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDraft(null)}
              >
                Отмена
              </Button>
              <Button
                type="button"
                disabled={!draft.name.trim()}
                onClick={save}
              >
                {isEditing ? "Сохранить" : "Добавить"}
              </Button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
