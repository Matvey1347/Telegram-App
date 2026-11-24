"use client";

import { useState } from "react";
import {
  Layers3,
  Plus,
  Target,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { IconPicker } from "@/components/icons/icon-picker";
import { IconAvatar } from "@/components/icons/icon-avatar";
import type { ResolvedEmoji } from "@telegram-system/shared";
import {
  Button,
  Card,
  CustomSelect,
  FormField,
  Input,
  Modal,
  Textarea,
} from "@/components/ui/primitives";
import type {
  AiPostingLength,
  AiPostingRubric,
  AiPostingSphere,
} from "./ai-posting-content-model";
import type { AiPostingMediaPreference } from "./ai-posting-media-preferences";

import {
  AiPostingSettingsCardActions,
  settingsCardContent,
  settingsCardDetails,
  settingsCardGrid,
  settingsCardRow,
  settingsCardTitle,
} from "./ai-posting-settings-card-layout";

const id = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `entity-${Date.now()}-${Math.random().toString(36).slice(2)}`;
type Section = "spheres" | "rubrics" | "lengths";
type LengthDraft = {
  id: string;
  name: string;
  emoji: string;
  min: string;
  max: string;
};

export function AiPostingTaxonomyEditor({
  spheres,
  rubrics,
  lengths,
  mediaPreferences,
  iconPresentations = {},
  onSpheres,
  onRubrics,
  onLengths,
}: {
  spheres: AiPostingSphere[];
  rubrics: AiPostingRubric[];
  lengths: AiPostingLength[];
  mediaPreferences: AiPostingMediaPreference[];
  iconPresentations?: Record<string, ResolvedEmoji>;
  onSpheres: (value: AiPostingSphere[]) => void;
  onRubrics: (value: AiPostingRubric[]) => void;
  onLengths: (value: AiPostingLength[]) => void;
}) {
  const [section, setSection] = useState<Section>("spheres");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [editingSphereId, setEditingSphereId] = useState<string | null>(null);
  const [editingRubricId, setEditingRubricId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LengthDraft | null>(null);
  const roots = spheres.filter((sphere) => !sphere.parentId);
  const editingSphere =
    spheres.find((sphere) => sphere.id === editingSphereId) ?? null;
  const editingRubric =
    rubrics.find((rubric) => rubric.id === editingRubricId) ?? null;
  const addSphere = (parentId: string | null = null) => {
    const next = {
      id: id(),
      name: "",
      emoji: "✨",
      tier: (parentId ? "SECONDARY" : "PRIMARY") as AiPostingSphere["tier"],
      parentId,
      description: "",
      sources: [],
      mediaPreferenceId: null,
    };
    onSpheres([...spheres, next]);
    if (parentId)
      setExpanded((value) =>
        value.includes(parentId) ? value : [...value, parentId],
      );
    setEditingSphereId(next.id);
  };
  const addRubric = () => {
    const next = {
      id: id(),
      sphereId: roots[0]?.id ?? null,
      name: "",
      emoji: "📝",
      description: "",
      goal: "",
      lengthIds: lengths.map((item) => item.id),
    };
    onRubrics([...rubrics, next]);
    setEditingRubricId(next.id);
  };
  const patchSphere = (sphereId: string, patch: Partial<AiPostingSphere>) =>
    onSpheres(
      spheres.map((item) =>
        item.id === sphereId ? { ...item, ...patch } : item,
      ),
    );
  const patchRubric = (rubricId: string, patch: Partial<AiPostingRubric>) =>
    onRubrics(
      rubrics.map((item) =>
        item.id === rubricId ? { ...item, ...patch } : item,
      ),
    );
  const deleteSphere = (sphereId: string) => {
    const descendants = new Set([
      sphereId,
      ...spheres
        .filter((item) => item.parentId === sphereId)
        .map((item) => item.id),
    ]);
    onSpheres(spheres.filter((item) => !descendants.has(item.id)));
    onRubrics(
      rubrics.filter(
        (item) => !item.sphereId || !descendants.has(item.sphereId),
      ),
    );
    setEditingSphereId(null);
  };
  const saveLength = () => {
    if (!draft || !draft.name.trim() || draft.min === "") return;
    const item = {
      id: draft.id || id(),
      name: draft.name.trim(),
      emoji: draft.emoji || "✍️",
      minCharacters: Number(draft.min),
      maxCharacters: draft.max === "" ? null : Number(draft.max),
    };
    if (
      !Number.isInteger(item.minCharacters) ||
      item.minCharacters < 0 ||
      (item.maxCharacters !== null &&
        (!Number.isInteger(item.maxCharacters) ||
          item.maxCharacters < item.minCharacters))
    )
      return;
    onLengths(
      draft.id
        ? lengths.map((length) => (length.id === draft.id ? item : length))
        : [...lengths, item],
    );
    setDraft(null);
  };
  const startLengthEdit = (item: AiPostingLength) =>
    setDraft({
      id: item.id,
      name: item.name,
      emoji: item.emoji,
      min: String(item.minCharacters),
      max: item.maxCharacters === null ? "" : String(item.maxCharacters),
    });
  const sourceText = (sphere: AiPostingSphere) => sphere.sources.join("\n");
  const patchSources = (sphere: AiPostingSphere, value: string) =>
    patchSphere(sphere.id, {
      sources: value
        .split(/\n/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 10),
    });

  return (
    <div className="min-w-0 space-y-3">
      <div
        role="tablist"
        aria-label="Настройка контента"
        className="flex w-full flex-wrap gap-1 rounded-lg border border-neutral-800 bg-neutral-950 p-1"
      >
        {(
          [
            ["spheres", "Сферы", Layers3],
            ["rubrics", "Рубрики", Target],
            ["lengths", "Длины", null],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={section === key}
            onClick={() => setSection(key)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm ${section === key ? "bg-blue-600 text-white" : "text-neutral-400 hover:bg-neutral-800"}`}
          >
            {Icon ? <Icon size={15} aria-hidden="true" /> : null}
            {label}
          </button>
        ))}
      </div>

      {section === "spheres" ? (
        <Card className="space-y-3 bg-neutral-900/60">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">Сферы и подсферы</h3>
              <p className="text-xs text-neutral-400">
                Откройте сферу, чтобы увидеть подсферы. Каждую запись можно
                редактировать отдельно.
              </p>
            </div>
            <Button type="button" onClick={() => addSphere()}>
              <Plus size={15} /> Добавить сферу
            </Button>
          </div>
          {!roots.length ? (
            <p className="text-sm text-neutral-500">Сферы пока не добавлены.</p>
          ) : (
            <div className={settingsCardGrid}>
              {roots.map((sphere) => {
                const children = spheres.filter(
                  (item) => item.parentId === sphere.id,
                );
                const isExpanded = expanded.includes(sphere.id);
                return (
                  <div
                    key={sphere.id}
                    className={`min-w-0 overflow-hidden rounded-xl border ${sphere.tier === "PRIMARY" ? "border-blue-700/70 bg-blue-950/25" : "border-neutral-700 bg-neutral-950/70"}`}
                  >
                    <div className={settingsCardRow}>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpanded((value) =>
                            isExpanded
                              ? value.filter((entry) => entry !== sphere.id)
                              : [...value, sphere.id],
                          )
                        }
                        className={settingsCardContent}
                      >
                        {sphere.emojiIconId &&
                        iconPresentations[sphere.emojiIconId] ? (
                          <IconAvatar
                            icon={iconPresentations[sphere.emojiIconId]}
                            label={sphere.name}
                            size="md"
                          />
                        ) : (
                          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-neutral-800 text-xl">
                            {sphere.emoji || "✨"}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className={settingsCardTitle}>
                            {sphere.name || "Новая сфера"}
                          </span>
                          <span className={settingsCardDetails}>
                            {sphere.tier === "PRIMARY"
                              ? "Основная"
                              : "Второстепенная"}{" "}
                            · {children.length} подсфер
                          </span>
                        </span>
                        <ChevronDown
                          size={16}
                          className={`shrink-0 text-neutral-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </button>
                      <AiPostingSettingsCardActions
                        editLabel={`Редактировать сферу ${sphere.name || "без названия"}`}
                        onEdit={() => setEditingSphereId(sphere.id)}
                        deleteLabel={`Удалить сферу ${sphere.name || "без названия"} и подсферы`}
                        deleteTitle="Удалить сферу вместе с подсферами"
                        onDelete={() => deleteSphere(sphere.id)}
                      />
                    </div>
                    {isExpanded ? (
                      <div className="space-y-2 border-t border-neutral-800/80 p-2">
                        {children.map((child) => (
                          <div
                            key={child.id}
                            className={`${settingsCardRow} rounded-lg border border-neutral-800 bg-neutral-900/80`}
                          >
                            <div className={settingsCardContent}>
                              {child.emojiIconId &&
                              iconPresentations[child.emojiIconId] ? (
                                <IconAvatar
                                  icon={iconPresentations[child.emojiIconId]}
                                  label={child.name}
                                  size="sm"
                                />
                              ) : (
                                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-neutral-800 text-lg">
                                  {child.emoji || "✨"}
                                </span>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className={`text-sm ${settingsCardTitle}`}>{child.name || "Новая подсфера"}</p>
                                <p className={`line-clamp-2 ${settingsCardDetails}`}>{child.description || "Без описания"}</p>
                              </div>
                            </div>
                            <AiPostingSettingsCardActions
                              editLabel={`Редактировать подсферу ${child.name || "без названия"}`}
                              onEdit={() => setEditingSphereId(child.id)}
                              deleteLabel={`Удалить подсферу ${child.name || "без названия"}`}
                              onDelete={() => deleteSphere(child.id)}
                            />
                          </div>
                        ))}
                        <Button type="button" className="h-9 px-3 text-sm" onClick={() => addSphere(sphere.id)}>
                          <Plus size={14} /> Добавить подсферу
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      ) : null}

      {section === "rubrics" ? (
        <Card className="space-y-3 bg-neutral-900/60">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">Рубрики</h3>
              <p className="text-xs text-neutral-400">
                Рубрики компактно сгруппированы; подробные поля открываются при редактировании.
              </p>
            </div>
            <Button type="button" onClick={addRubric}>
              <Plus size={15} /> Добавить рубрику
            </Button>
          </div>
          {!rubrics.length ? (
            <p className="text-sm text-neutral-500">Рубрики пока не добавлены.</p>
          ) : (
            <div className={settingsCardGrid}>
              {rubrics.map((rubric) => {
                const sphere = spheres.find((item) => item.id === rubric.sphereId);
                return (
                  <div key={rubric.id} className={`${settingsCardRow} rounded-xl border border-neutral-700 bg-neutral-950/70`}>
                    <div className={settingsCardContent}>
                      {rubric.emojiIconId && iconPresentations[rubric.emojiIconId] ? (
                        <IconAvatar icon={iconPresentations[rubric.emojiIconId]} label={rubric.name} size="sm" />
                      ) : (
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-neutral-800 text-lg">
                          {rubric.emoji || "📝"}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={`text-sm ${settingsCardTitle}`}>{rubric.name || "Новая рубрика"}</span>
                        <span className={settingsCardDetails}>
                          {sphere ? `${sphere.emoji} ${sphere.name}` : "Любая сфера"} · {rubric.lengthIds.length} длин
                        </span>
                      </span>
                    </div>
                    <AiPostingSettingsCardActions
                      editLabel={`Редактировать рубрику ${rubric.name}`}
                      onEdit={() => setEditingRubricId(rubric.id)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      ) : null}

      {section === "lengths" ? (
        <Card className="space-y-3 bg-neutral-900/60">
          <div>
            <h3 className="font-semibold">Длины публикаций</h3>
            <p className="text-xs text-neutral-400">Настройте допустимые диапазоны длины.</p>
          </div>
          <ul className={settingsCardGrid}>
            {lengths.map((length) => (
              <li key={length.id} className={`${settingsCardRow} rounded-xl border border-neutral-700 bg-neutral-950/70`}>
                <div className={settingsCardContent}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-neutral-800 text-lg">
                    {length.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`text-sm ${settingsCardTitle}`}>{length.name}</span>
                    <span className={settingsCardDetails}>{length.minCharacters}–{length.maxCharacters ?? "∞"} символов</span>
                  </span>
                </div>
                <AiPostingSettingsCardActions
                  editLabel={`Редактировать длину ${length.name}`}
                  onEdit={() => startLengthEdit(length)}
                  deleteLabel={`Удалить длину ${length.name}`}
                  deleteTitle="Удалить длину"
                  onDelete={() => {
                    onLengths(lengths.filter((item) => item.id !== length.id));
                    onRubrics(
                      rubrics.map((item) => ({
                        ...item,
                        lengthIds: item.lengthIds.filter(
                          (itemId) => itemId !== length.id,
                        ),
                      })),
                    );
                    if (draft?.id === length.id) setDraft(null);
                  }}
                />
              </li>
            ))}
          </ul>
          {draft ? (
            <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-end gap-2">
              <FormField label="Эмодзи">
                <IconPicker
                  compact
                  allowImages={false}
                  onChange={() => undefined}
                  onEmojiChange={(emoji) =>
                    setDraft({ ...draft, emoji: emoji ?? "✍️" })
                  }
                  buttonLabel={draft.emoji}
                  ariaLabel="Выбрать эмодзи длины"
                  className="!h-10 !w-12 !min-w-12"
                />
              </FormField>
              <FormField label="Название">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </FormField>
              <FormField label="От символов">
                <Input
                  type="number"
                  min="0"
                  value={draft.min}
                  onChange={(e) => setDraft({ ...draft, min: e.target.value })}
                />
              </FormField>
              <FormField label="До (пусто = ∞)">
                <Input
                  type="number"
                  min={draft.min || 0}
                  value={draft.max}
                  onChange={(e) => setDraft({ ...draft, max: e.target.value })}
                />
              </FormField>
              <Button
                type="button"
                onClick={saveLength}
                disabled={!draft.name.trim() || draft.min === ""}
              >
                Сохранить
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDraft(null)}
              >
                Отмена
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              onClick={() =>
                setDraft({ id: "", name: "", emoji: "✍️", min: "", max: "" })
              }
            >
              <Plus size={14} /> Добавить длину
            </Button>
          )}
        </Card>
      ) : null}

      <Modal
        open={Boolean(editingSphere)}
        onClose={() =>
          editingSphere && !editingSphere.name.trim()
            ? deleteSphere(editingSphere.id)
            : setEditingSphereId(null)
        }
        title={
          editingSphere?.parentId
            ? "Редактировать подсферу"
            : "Редактировать сферу"
        }
        size="md"
        footer={
          <div className="flex flex-wrap justify-between gap-2">
            {editingSphere ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => deleteSphere(editingSphere.id)}
              >
                <Trash2 size={15} /> Удалить
                {editingSphere.parentId ? " подсферу" : " сферу и подсферы"}
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={() =>
                editingSphere && !editingSphere.name.trim()
                  ? deleteSphere(editingSphere.id)
                  : setEditingSphereId(null)
              }
            >
              Готово
            </Button>
          </div>
        }
      >
        {editingSphere ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
              <FormField label="Эмодзи / иконка">
                <IconPicker
                  iconId={editingSphere.emojiIconId}
                  icon={
                    editingSphere.emojiIconId
                      ? undefined
                      : { type: "unicode", value: editingSphere.emoji || "✨" }
                  }
                  onChange={(iconId, icon) =>
                    patchSphere(editingSphere.id, {
                      emojiIconId: iconId ?? undefined,
                      emoji:
                        icon?.type === "unicode"
                          ? icon.value
                          : editingSphere.emoji,
                    })
                  }
                  buttonLabel={editingSphere.emoji || "✨"}
                  ariaLabel="Выбрать эмодзи сферы"
                  allowImages
                  className="!h-11 !w-14 !min-w-14"
                />
                <span className="mt-1 block text-xs text-neutral-500">
                  Можно выбрать эмодзи или загрузить изображение.
                </span>
              </FormField>
              <FormField
                label={
                  editingSphere.parentId
                    ? "Название подсферы"
                    : "Название сферы"
                }
              >
                <Input
                  autoFocus
                  value={editingSphere.name}
                  onChange={(event) =>
                    patchSphere(editingSphere.id, { name: event.target.value })
                  }
                  placeholder="Название"
                />
              </FormField>
            </div>
            {!editingSphere.parentId ? (
              <FormField label="Приоритет">
                <CustomSelect
                  value={editingSphere.tier}
                  onChange={(tier) =>
                    patchSphere(editingSphere.id, {
                      tier: tier as AiPostingSphere["tier"],
                    })
                  }
                  options={[
                    {
                      value: "PRIMARY",
                      label: "Основная",
                      icon: <Target size={15} className="text-emerald-300" />,
                    },
                    {
                      value: "SECONDARY",
                      label: "Второстепенная",
                      icon: <Layers3 size={15} className="text-sky-300" />,
                    },
                  ]}
                />
              </FormField>
            ) : null}
            <FormField label="Описание">
              <Textarea
                rows={3}
                value={editingSphere.description}
                onChange={(event) =>
                  patchSphere(editingSphere.id, {
                    description: event.target.value,
                  })
                }
              />
            </FormField>
            <FormField label="Источники (по одному URL на строку, необязательно)">
              <Textarea
                rows={3}
                value={sourceText(editingSphere)}
                onChange={(event) =>
                  patchSources(editingSphere, event.target.value)
                }
                placeholder="https://example.com/news"
              />
            </FormField>
            <FormField label="Предпочтение к медиа">
              <CustomSelect
                value={editingSphere.mediaPreferenceId ?? ""}
                onChange={(mediaPreferenceId) =>
                  patchSphere(editingSphere.id, {
                    mediaPreferenceId: mediaPreferenceId || null,
                  })
                }
                options={[
                  { value: "", label: "Любое предпочтение" },
                  ...mediaPreferences.map((item) => ({
                    value: item.id,
                    label: `${item.emoji} ${item.name}`,
                  })),
                ]}
              />
            </FormField>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(editingRubric)}
        onClose={() => setEditingRubricId(null)}
        title="Редактировать рубрику"
        size="md"
        footer={
          <div className="flex flex-wrap justify-between gap-2">
            {editingRubric ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  onRubrics(
                    rubrics.filter((item) => item.id !== editingRubric.id),
                  );
                  setEditingRubricId(null);
                }}
              >
                <Trash2 size={15} /> Удалить рубрику
              </Button>
            ) : null}
            <Button type="button" onClick={() => setEditingRubricId(null)}>
              Готово
            </Button>
          </div>
        }
      >
        {editingRubric ? (
          <div className="space-y-3">
            <div className="grid grid-cols-[48px_minmax(0,1fr)] items-end gap-2 sm:grid-cols-[56px_minmax(0,1fr)]">
              <div className="flex justify-center pb-1">
                <IconPicker
                  iconId={editingRubric.emojiIconId}
                  icon={
                    editingRubric.emojiIconId
                      ? undefined
                      : { type: "unicode", value: editingRubric.emoji || "📝" }
                  }
                  onChange={(iconId, icon) =>
                    patchRubric(editingRubric.id, {
                      emojiIconId: iconId ?? undefined,
                      emoji:
                        icon?.type === "unicode"
                          ? icon.value
                          : editingRubric.emoji,
                    })
                  }
                  buttonLabel={editingRubric.emoji || "📝"}
                  ariaLabel="Эмодзи рубрики"
                  allowImages
                  className="!h-10 !w-12 !min-w-12"
                />
              </div>
              <FormField label="Название">
                <Input
                  autoFocus
                  value={editingRubric.name}
                  onChange={(event) =>
                    patchRubric(editingRubric.id, { name: event.target.value })
                  }
                  placeholder="Название рубрики"
                />
              </FormField>
            </div>
            <FormField label="Сфера">
              <CustomSelect
                value={editingRubric.sphereId ?? ""}
                onChange={(sphereId) =>
                  patchRubric(editingRubric.id, { sphereId: sphereId || null })
                }
                options={[
                  { value: "", label: "Любая сфера" },
                  ...spheres.map((item) => ({
                    value: item.id,
                    label: `${item.emoji} ${item.name || "Без названия"}`,
                  })),
                ]}
              />
            </FormField>
            <FormField label="Описание">
              <Textarea
                rows={2}
                value={editingRubric.description}
                onChange={(event) =>
                  patchRubric(editingRubric.id, {
                    description: event.target.value,
                  })
                }
                placeholder="О чём эта рубрика"
              />
            </FormField>
            <FormField label="Цель">
              <Input
                value={editingRubric.goal}
                onChange={(event) =>
                  patchRubric(editingRubric.id, { goal: event.target.value })
                }
                placeholder="Например, пригласить читателя оставить комментарий"
              />
            </FormField>
            <fieldset className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-2">
              <legend className="mb-1 text-xs text-neutral-400">
                Доступные длины
              </legend>
              {lengths.map((length) => (
                <label
                  key={length.id}
                  className="flex min-h-9 min-w-0 items-center gap-1.5 rounded border border-neutral-800 px-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={editingRubric.lengthIds.includes(length.id)}
                    onChange={(event) =>
                      patchRubric(editingRubric.id, {
                        lengthIds: event.target.checked
                          ? [...editingRubric.lengthIds, length.id]
                          : editingRubric.lengthIds.filter(
                              (id) => id !== length.id,
                            ),
                      })
                    }
                  />
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {length.emoji} {length.name}
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
