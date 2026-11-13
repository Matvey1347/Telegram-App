"use client";

import { useState } from "react";
import { Info, Pencil, Plus, X } from "lucide-react";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { IconPicker } from "@/components/icons/icon-picker";
import {
  Button,
  Card,
  FormField,
  IconButton,
  Input,
  Textarea,
  Tooltip,
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
          <div>
            <h3 className="text-sm font-medium">Предпочтения к медиа</h3>
            <p className="mt-1 text-xs text-neutral-400">
              У каждого направления свои описание и референсы. AI выбирает
              подходящее для темы.
            </p>
          </div>
          <Tooltip
            content={
              <span className="block max-w-xs">
                При генерации AI создаёт новое изображение, используя референсы
                как ориентир, а не копируя их. В режиме «Найденные медиа»
                референсы не влияют на поиск.
              </span>
            }
          >
            <span
              tabIndex={0}
              role="button"
              aria-label="Как используются визуальные референсы"
              className="inline-flex h-7 w-7 shrink-0 cursor-help items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Info size={15} />
            </span>
          </Tooltip>
        </div>
        <Button
          type="button"
          variant="secondary"
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
            <Card
              key={preference.id}
              className="flex min-w-0 items-center gap-3 p-3"
            >
              {preference.emojiIconId ? (
                <IconPicker
                  iconId={preference.emojiIconId}
                  onChange={() => undefined}
                  buttonLabel="Эмодзи предпочтения"
                  ariaLabel={`Эмодзи предпочтения ${index + 1}`}
                  allowImages={false}
                  disabled
                  compact
                  className="!h-10 !w-10 !min-w-10 !p-1"
                  iconClassName="!h-7 !w-7 !border-0 !bg-transparent"
                />
              ) : (
                <IconAvatar
                  icon={{ type: "unicode", value: preference.emoji || "🎨" }}
                  label={preference.name}
                  size="md"
                  bordered={false}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {preference.name}
                </p>
                <p className="truncate text-xs text-neutral-400">
                  {preference.description || "Без описания"} ·{" "}
                  {preference.references.length} референсов
                </p>
              </div>
              <Button
                type="button"
                className="h-10 w-10 !p-0"
                onClick={() => setDraft({ ...preference })}
                aria-label={`Редактировать предпочтение ${index + 1}`}
                title="Редактировать"
              >
                <Pencil size={16} />
              </Button>
              <IconButton
                type="button"
                kind="delete"
                aria-label={`Удалить предпочтение ${index + 1}`}
                title="Удалить предпочтение"
                onClick={() =>
                  onChange(
                    preferences.filter((item) => item.id !== preference.id),
                  )
                }
              />
            </Card>
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
                  allowImages={false}
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
            <div>
              <p className="mb-1 text-sm font-medium text-neutral-200">
                Визуальные референсы · до 4
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
                maxItems={4}
                maxFileSizeBytes={2 * 1024 * 1024}
                label="Добавить референсы"
                dropAreaLabel="Область референсов для предпочтения"
                dropPrompt="Перетащите изображение сюда или вставьте через ⌘/Ctrl+V"
                browseLabel="Выбрать файлы"
                sizeHint="JPEG, PNG или WebP до 2 МБ · до 4 изображений"
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
