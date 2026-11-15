"use client";

import { useRef, useState } from "react";
import { Check, CheckCircle2, FileUp, LoaderCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { ManagedPostsImportSource } from "../telegram/managed-posts-import-source";

type ImportReport = { applied: Array<{ id: string; label: string; status: "applied" | "kept"; message: string }>; ignoredFields: string[] };

function removeInlineImages(value: unknown): unknown {
  if (typeof value === "string") return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value) ? undefined : value;
  if (Array.isArray(value)) return value.map(removeInlineImages).filter((item) => item !== undefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
      const cleaned = removeInlineImages(item);
      return cleaned === undefined || /^(photoUrl|avatarUrl)$/i.test(key) ? [] : [[key, cleaned]];
    }));
  }
  return value;
}

export function AiPostingSettingsTransfer({ channelId, configuration, onImported }: { channelId: string; configuration: unknown; onImported: () => Promise<void> }) {
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [contextBusy, setContextBusy] = useState(false);
  const [contextCopied, setContextCopied] = useState(false);
  const inputGeneration = useRef(0);

  const chooseFile = async (file: File) => {
    const request = ++inputGeneration.current;
    setError("");
    setReport(null);
    if (file.size > 2 * 1024 * 1024) {
      setError("Файл должен быть меньше 2 МБ.");
      return;
    }
    try {
      const text = await file.text();
      if (request !== inputGeneration.current) return;
      setContent(text);
      setFileName(file.name);
    } catch {
      if (request === inputGeneration.current) setError("Не удалось прочитать файл.");
    }
  };

  const clear = () => {
    inputGeneration.current++;
    setContent("");
    setFileName(null);
    setError("");
    setReport(null);
  };

  const copyContext = async () => {
    setContextBusy(true);
    setError("");
    try {
      const response = await api.get(`/telegram-channels/${channelId}/ai-posting/settings/export`);
      const exported = removeInlineImages(response.data) as Record<string, unknown>;
      const guide = typeof exported.instruction === "string" ? exported.instruction : "Инструкция AI Posting недоступна.";
      const context = {
        schemaVersion: exported.schemaVersion,
        exportedAt: exported.exportedAt,
        channel: exported.channel,
        schema: exported.schema,
        fieldGuide: exported.fieldGuide,
        configuration: removeInlineImages(configuration),
      };
      const clipboardText = [
        guide,
        "",
        "## Текущий контекст и настройки канала",
        "Используй этот JSON как исходное состояние. Не включай channel, schema и fieldGuide в возвращаемый configuration.",
        "```json",
        JSON.stringify(context, null, 2),
        "```",
      ].join("\n");
      await navigator.clipboard.writeText(clipboardText);
      setContextCopied(true);
      window.setTimeout(() => setContextCopied(false), 3000);
    } catch {
      setError("Не удалось скопировать инструкцию и контекст. Проверьте доступ к буферу обмена.");
    } finally {
      setContextBusy(false);
    }
  };

  const importContext = async () => {
    if (!content.trim() || busy) return;
    setBusy(true);
    setError("");
    setReport(null);
    try {
      setStage("Проверяем структуру файла…");
      const source = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      let parsed: unknown;
      try { parsed = JSON.parse(source); }
      catch { throw new Error("INVALID_DOCUMENT"); }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_DOCUMENT");
      const value = parsed as Record<string, unknown>;
      const importedConfiguration = value.configuration && typeof value.configuration === "object" && !Array.isArray(value.configuration)
        ? value.configuration
        : value;
      const schemaVersion = Number(value.schemaVersion ?? 2);
      if (![1, 2].includes(schemaVersion) || !importedConfiguration || typeof importedConfiguration !== "object" || Array.isArray(importedConfiguration) || !Object.keys(importedConfiguration).length) throw new Error("INVALID_DOCUMENT");
      setStage("Проверяем поля и связи настроек на сервере…");
      setStage("Сохраняем настройки канала…");
      const result = (await api.post(`/telegram-channels/${channelId}/ai-posting/settings/import`, { schemaVersion, configuration: importedConfiguration })).data as { report?: ImportReport };
      await onImported();
      setReport(result.report ?? null);
      setStage("Импорт завершён. Настройки канала обновлены.");
    } catch (cause) {
      if (cause instanceof Error && cause.message === "INVALID_DOCUMENT") {
        setError("Формат не распознан. Нужен JSON-контекст AI Posting с объектом configuration.");
      } else {
        const responseMessage = (cause as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
        const details = typeof responseMessage === "string" ? responseMessage : Array.isArray(responseMessage) ? responseMessage.filter((item): item is string => typeof item === "string").join("; ") : "";
        setError(`Импорт не выполнен${details ? ` (${details})` : ""}. Проверьте поля и связи в JSON; действующие настройки не изменены.`);
      }
      setStage("");
    } finally {
      setBusy(false);
    }
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold">Импорт / экспорт настроек</h2>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">Скопируйте инструкцию и актуальные настройки канала для ИИ. Ответ с JSON можно загрузить или вставить в поле ниже.</p>
      </div>
      <Button type="button" variant="secondary" disabled={contextBusy || busy} onClick={() => void copyContext()}>
        {contextBusy ? <LoaderCircle size={15} className="animate-spin"/> : contextCopied ? <Check size={15}/> : <Upload size={15}/>} {contextBusy ? "Копируем…" : contextCopied ? "Скопировано" : "Скопировать инструкцию и контекст"}
      </Button>
    </div>
    <p className="text-sm text-neutral-400">Загрузите JSON, перетащите файл сюда или вставьте ответ ИИ. Мы проверим структуру и связи, применим настройки и покажем результат по разделам.</p>
    <ManagedPostsImportSource
      content={content}
      fileName={fileName}
      disabled={busy}
      onContent={(next) => { setContent(next); setFileName(null); setError(""); setReport(null); }}
      onFile={(file) => void chooseFile(file)}
      onClear={clear}
      onCopyContent={() => { void navigator.clipboard?.writeText(content).catch(() => undefined); }}
    />
    {busy && <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-blue-200"><LoaderCircle size={16} className="animate-spin"/>{stage}</div>}
    {!busy && stage && <p role="status" className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 size={16}/>{stage}</p>}
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    {report && <section aria-label="Результат импорта" className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <h3 className="font-medium">Что обработано</h3>
      <ul className="mt-2 space-y-1.5 text-sm text-neutral-300">{report.applied.map((item) => <li key={item.id} className="flex gap-2"><span aria-hidden="true" className={item.status === "applied" ? "text-emerald-300" : "text-neutral-500"}>{item.status === "applied" ? "✓" : "–"}</span>{item.message}</li>)}</ul>
      {report.ignoredFields.length > 0 && <p className="mt-2 text-xs text-amber-200">Неизвестные поля пропущены: {report.ignoredFields.join(", ")}</p>}
    </section>}
    <div className="flex justify-end border-t border-neutral-800 pt-3">
      <Button type="button" disabled={busy || !content.trim()} onClick={() => void importContext()}>{busy ? <><LoaderCircle size={15} className="animate-spin"/> Импортируем…</> : <><FileUp size={15}/> Применить настройки</>}</Button>
    </div>
  </div>;
}
