"use client";

import { useState } from "react";
import { Layers3, Plus, Target, Trash2 } from "lucide-react";
import { IconPicker } from "@/components/icons/icon-picker";
import { Button, Card, CustomSelect, FormField, IconButton, Input, Textarea } from "@/components/ui/primitives";
import type { AiPostingLength, AiPostingRubric, AiPostingSphere } from "./ai-posting-content-model";
import type { AiPostingMediaPreference } from "./ai-posting-media-preferences";

const id = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `entity-${Date.now()}-${Math.random().toString(36).slice(2)}`;
type Section = "spheres" | "rubrics" | "lengths";
type LengthDraft = { id: string; name: string; emoji: string; min: string; max: string };

export function AiPostingTaxonomyEditor({ spheres, rubrics, lengths, mediaPreferences, onSpheres, onRubrics, onLengths }: {
  spheres: AiPostingSphere[];
  rubrics: AiPostingRubric[];
  lengths: AiPostingLength[];
  mediaPreferences: AiPostingMediaPreference[];
  onSpheres: (value: AiPostingSphere[]) => void;
  onRubrics: (value: AiPostingRubric[]) => void;
  onLengths: (value: AiPostingLength[]) => void;
}) {
  const [section, setSection] = useState<Section>("spheres");
  const [draft, setDraft] = useState<LengthDraft | null>(null);
  const roots = spheres.filter((sphere) => !sphere.parentId);
  const addSphere = (parentId: string | null = null) => onSpheres([...spheres, { id: id(), name: "", emoji: "✨", tier: "SECONDARY", parentId, description: "", sources: [], mediaPreferenceId: null }]);
  const addRubric = () => onRubrics([...rubrics, { id: id(), sphereId: roots[0]?.id ?? null, name: "", emoji: "📝", description: "", goal: "", lengthIds: lengths.map((item) => item.id) }]);
  const patchSphere = (sphereId: string, patch: Partial<AiPostingSphere>) => onSpheres(spheres.map((item) => item.id === sphereId ? { ...item, ...patch } : item));
  const patchRubric = (rubricId: string, patch: Partial<AiPostingRubric>) => onRubrics(rubrics.map((item) => item.id === rubricId ? { ...item, ...patch } : item));
  const deleteSphere = (sphereId: string) => {
    const descendants = new Set([sphereId, ...spheres.filter((item) => item.parentId === sphereId).map((item) => item.id)]);
    onSpheres(spheres.filter((item) => !descendants.has(item.id)));
    onRubrics(rubrics.filter((item) => !item.sphereId || !descendants.has(item.sphereId)));
  };
  const saveLength = () => {
    if (!draft || !draft.name.trim() || draft.min === "") return;
    const item = { id: draft.id || id(), name: draft.name.trim(), emoji: draft.emoji || "✍️", minCharacters: Number(draft.min), maxCharacters: draft.max === "" ? null : Number(draft.max) };
    if (!Number.isInteger(item.minCharacters) || item.minCharacters < 0 || (item.maxCharacters !== null && (!Number.isInteger(item.maxCharacters) || item.maxCharacters < item.minCharacters))) return;
    onLengths(draft.id ? lengths.map((length) => length.id === draft.id ? item : length) : [...lengths, item]);
    setDraft(null);
  };
  const startLengthEdit = (item: AiPostingLength) => setDraft({ id: item.id, name: item.name, emoji: item.emoji, min: String(item.minCharacters), max: item.maxCharacters === null ? "" : String(item.maxCharacters) });
  return <div className="space-y-3">
    <div role="tablist" aria-label="Настройка контента" className="flex w-full gap-1 overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950 p-1">
      {([ ["spheres", "Сферы", Layers3], ["rubrics", "Рубрики", Target], ["lengths", "Длины", null] ] as const).map(([key, label, Icon]) => <button key={key} type="button" role="tab" aria-selected={section === key} onClick={() => setSection(key)} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm ${section === key ? "bg-blue-600 text-white" : "text-neutral-400 hover:bg-neutral-800"}`}>{Icon ? <Icon size={15} aria-hidden="true"/> : null}{label}</button>)}
    </div>
    {section === "spheres" ? <Card className="space-y-3 bg-neutral-900/60">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Сферы и подсферы</h3><p className="text-xs text-neutral-400">Основные и второстепенные сферы получают равный приоритет. Источники необязательны.</p></div><Button type="button" onClick={() => addSphere()}><Plus size={15}/> Добавить сферу</Button></div>
      {!roots.length ? <p className="text-sm text-neutral-500">Сферы пока не добавлены.</p> : roots.map((sphere) => {
        const children = spheres.filter((item) => item.parentId === sphere.id);
        return <Card key={sphere.id} className="space-y-3 border-neutral-800 bg-neutral-950/60 p-3">
          <div className="grid min-w-0 gap-2 sm:grid-cols-[56px_minmax(0,1fr)_minmax(150px,190px)_40px] sm:items-end">
            <FormField label="Эмодзи"><IconPicker compact allowImages={false} onChange={() => undefined} onEmojiChange={(emoji) => patchSphere(sphere.id, { emoji: emoji ?? "✨" })} buttonLabel={sphere.emoji || "✨"} ariaLabel={`Выбрать эмодзи сферы ${sphere.name || ""}`} className="!h-10 !w-12 !min-w-12"/></FormField>
            <FormField label="Название сферы"><Input value={sphere.name} onChange={(e) => patchSphere(sphere.id, { name: e.target.value })} placeholder="Например, психология"/></FormField>
            <FormField label="Приоритет"><CustomSelect value={sphere.tier} onChange={(tier) => patchSphere(sphere.id, { tier: tier as AiPostingSphere["tier"] })} options={[{ value: "PRIMARY", label: "Основная", icon: <Target size={15} className="text-emerald-300"/> }, { value: "SECONDARY", label: "Второстепенная", icon: <Layers3 size={15} className="text-sky-300"/> }]}/></FormField>
            <IconButton type="button" kind="delete" aria-label="Удалить сферу" title="Удалить сферу" onClick={() => deleteSphere(sphere.id)}/>
          </div>
          <FormField label="Описание"><Textarea rows={2} value={sphere.description} onChange={(e) => patchSphere(sphere.id, { description: e.target.value })}/></FormField>
          <FormField label="Источники (по одному URL на строку, необязательно)"><Textarea rows={2} value={sphere.sources.join("\n")} onChange={(e) => patchSphere(sphere.id, { sources: e.target.value.split(/\n/).map((value) => value.trim()).filter(Boolean).slice(0, 10) })} placeholder="https://example.com/news"/></FormField>
          <FormField label="Предпочтение к медиа"><CustomSelect value={sphere.mediaPreferenceId ?? ""} onChange={(mediaPreferenceId) => patchSphere(sphere.id, { mediaPreferenceId: mediaPreferenceId || null })} options={[{ value: "", label: "Любое предпочтение" }, ...mediaPreferences.map((item) => ({ value: item.id, label: `${item.emoji} ${item.name}` }))]}/></FormField>
          {children.map((child) => <div key={child.id} className="space-y-2 rounded-lg border-l-2 border-blue-900 bg-neutral-900/50 p-3 sm:ml-4">
            <div className="grid min-w-0 gap-2 sm:grid-cols-[56px_minmax(0,1fr)_40px] sm:items-end"><FormField label="Эмодзи"><IconPicker compact allowImages={false} onChange={() => undefined} onEmojiChange={(emoji) => patchSphere(child.id, { emoji: emoji ?? "✨" })} buttonLabel={child.emoji || "✨"} ariaLabel={`Выбрать эмодзи подсферы ${child.name || ""}`} className="!h-10 !w-12 !min-w-12"/></FormField><FormField label="Название подсферы"><Input value={child.name} onChange={(e) => patchSphere(child.id, { name: e.target.value })} placeholder="Например, уход за собой"/></FormField><IconButton type="button" kind="delete" aria-label="Удалить подсферу" onClick={() => deleteSphere(child.id)}/></div>
            <FormField label="Описание подсферы"><Textarea rows={2} value={child.description} onChange={(e) => patchSphere(child.id, { description: e.target.value })}/></FormField>
            <FormField label="Источники подсферы (необязательно)"><Textarea rows={2} value={child.sources.join("\n")} onChange={(e) => patchSphere(child.id, { sources: e.target.value.split(/\n/).map((value) => value.trim()).filter(Boolean).slice(0, 10) })} placeholder="URL по одному на строку"/></FormField>
            <FormField label="Предпочтение к медиа"><CustomSelect value={child.mediaPreferenceId ?? ""} onChange={(mediaPreferenceId) => patchSphere(child.id, { mediaPreferenceId: mediaPreferenceId || null })} options={[{ value: "", label: "Любое предпочтение" }, ...mediaPreferences.map((item) => ({ value: item.id, label: `${item.emoji} ${item.name}` }))]}/></FormField>
          </div>)}
          <Button type="button" variant="secondary" onClick={() => addSphere(sphere.id)}><Plus size={14}/> Добавить подсферу</Button>
        </Card>;
      })}
    </Card> : null}
    {section === "rubrics" ? <Card className="space-y-3 bg-neutral-900/60">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Рубрики</h3><p className="text-xs text-neutral-400">Описание объясняет содержание рубрики, цель задаёт действие читателя.</p></div><Button type="button" onClick={addRubric}><Plus size={15}/> Добавить рубрику</Button></div>
      {rubrics.map((rubric) => <Card key={rubric.id} className="space-y-2 border-neutral-800 bg-neutral-950/60 p-3"><div className="grid min-w-0 gap-2 sm:grid-cols-[56px_minmax(0,1fr)_minmax(160px,220px)_40px] sm:items-end"><FormField label="Эмодзи"><IconPicker compact allowImages={false} onChange={() => undefined} onEmojiChange={(emoji) => patchRubric(rubric.id, { emoji: emoji ?? "📝" })} buttonLabel={rubric.emoji || "📝"} ariaLabel={`Выбрать эмодзи рубрики ${rubric.name || ""}`} className="!h-10 !w-12 !min-w-12"/></FormField><FormField label="Название"><Input value={rubric.name} onChange={(e) => patchRubric(rubric.id, { name: e.target.value })} placeholder="Название рубрики"/></FormField><FormField label="Сфера"><CustomSelect value={rubric.sphereId ?? ""} onChange={(sphereId) => patchRubric(rubric.id, { sphereId: sphereId || null })} options={[{ value: "", label: "Любая сфера" }, ...spheres.map((item) => ({ value: item.id, label: `${item.emoji} ${item.name || "Без названия"}` }))]}/></FormField><IconButton type="button" kind="delete" aria-label="Удалить рубрику" onClick={() => onRubrics(rubrics.filter((item) => item.id !== rubric.id))}/></div><FormField label="Описание"><Textarea rows={2} value={rubric.description} onChange={(e) => patchRubric(rubric.id, { description: e.target.value })} placeholder="О чём эта рубрика"/></FormField><FormField label="Цель"><Input value={rubric.goal} onChange={(e) => patchRubric(rubric.id, { goal: e.target.value })} placeholder="Например, пригласить читателя оставить комментарий"/></FormField><fieldset className="flex flex-wrap gap-2"><legend className="mb-1 text-xs text-neutral-400">Доступные длины</legend>{lengths.map((length) => <label key={length.id} className="flex min-h-9 items-center gap-1.5 rounded border border-neutral-800 px-2 text-xs"><input type="checkbox" checked={rubric.lengthIds.includes(length.id)} onChange={(e) => patchRubric(rubric.id, { lengthIds: e.target.checked ? [...rubric.lengthIds, length.id] : rubric.lengthIds.filter((id) => id !== length.id) })}/>{length.emoji} {length.name}</label>)}</fieldset></Card>)}
      {!rubrics.length ? <p className="text-sm text-neutral-500">Рубрики пока не добавлены.</p> : null}
    </Card> : null}
    {section === "lengths" ? <Card className="space-y-3 bg-neutral-900/60">
      <div><h3 className="font-semibold">Длины публикаций</h3><p className="text-xs text-neutral-400">Стандартные диапазоны можно редактировать и удалять. Добавляйте собственные длины при необходимости.</p></div>
      <ul className="space-y-2">{lengths.map((length) => <li key={length.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 p-2"><span className="min-w-0 flex-1 text-sm">{length.emoji} {length.name} · {length.minCharacters}–{length.maxCharacters ?? "∞"} символов</span><IconButton type="button" aria-label={`Редактировать длину ${length.name}`} title="Редактировать" onClick={() => startLengthEdit(length)}/><IconButton type="button" kind="delete" aria-label={`Удалить длину ${length.name}`} title="Удалить" onClick={() => { onLengths(lengths.filter((item) => item.id !== length.id)); onRubrics(rubrics.map((item) => ({ ...item, lengthIds: item.lengthIds.filter((itemId) => itemId !== length.id) }))); if (draft?.id === length.id) setDraft(null); }}/></li>)}</ul>
      {draft ? <div className="grid min-w-0 gap-2 sm:grid-cols-[56px_minmax(0,1fr)_110px_110px_auto_auto] sm:items-end"><FormField label="Эмодзи"><IconPicker compact allowImages={false} onChange={() => undefined} onEmojiChange={(emoji) => setDraft({ ...draft, emoji: emoji ?? "✍️" })} buttonLabel={draft.emoji} ariaLabel="Выбрать эмодзи длины" className="!h-10 !w-12 !min-w-12"/></FormField><FormField label="Название"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}/></FormField><FormField label="От символов"><Input type="number" min="0" value={draft.min} onChange={(e) => setDraft({ ...draft, min: e.target.value })}/></FormField><FormField label="До (пусто = ∞)"><Input type="number" min={draft.min || 0} value={draft.max} onChange={(e) => setDraft({ ...draft, max: e.target.value })}/></FormField><Button type="button" onClick={saveLength} disabled={!draft.name.trim() || draft.min === ""}>Сохранить</Button><Button type="button" variant="secondary" onClick={() => setDraft(null)}>Отмена</Button></div> : <Button type="button" onClick={() => setDraft({ id: "", name: "", emoji: "✍️", min: "", max: "" })}><Plus size={14}/> Добавить длину</Button>}
    </Card> : null}
  </div>;
}
