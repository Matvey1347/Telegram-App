"use client";

import { useRef, useState } from "react";
import { Check, CheckCircle2, FileUp, LoaderCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useI18n } from "@/providers/i18n-provider";
import { ManagedPostsImportSource } from "../telegram/managed-posts-import-source";

type ImportReport = { applied: Array<{ id: string; label: string; status: "applied" | "kept"; message: string }>; ignoredFields: string[] };

const sectionLabels = {
  idea: "telegram.posts.aiPostingTransfer.idea",
  writing: "telegram.posts.aiPostingTransfer.writing",
  media: "telegram.posts.aiPostingTransfer.media",
  spheres: "telegram.posts.aiPostingTransfer.spheres",
  rubrics: "telegram.posts.aiPostingTransfer.rubrics",
  lengths: "telegram.posts.aiPostingTransfer.lengths",
} as const;

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
  const { t } = useI18n();
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<(ImportReport & { sectionCounts: Record<string, number> }) | null>(null);
  const [contextBusy, setContextBusy] = useState(false);
  const [contextCopied, setContextCopied] = useState(false);
  const inputGeneration = useRef(0);

  const chooseFile = async (file: File) => {
    const request = ++inputGeneration.current;
    setError("");
    setReport(null);
    setComplete(false);
    if (file.size > 2 * 1024 * 1024) {
      setError(t("telegram.posts.aiPostingTransfer.fileTooLarge"));
      return;
    }
    try {
      const text = await file.text();
      if (request !== inputGeneration.current) return;
      setContent(text);
      setFileName(file.name);
    } catch {
      if (request === inputGeneration.current) setError(t("telegram.posts.aiPostingTransfer.fileReadError"));
    }
  };

  const clear = () => {
    inputGeneration.current++;
    setContent("");
    setFileName(null);
    setError("");
    setReport(null);
    setComplete(false);
  };

  const copyContext = async () => {
    setContextBusy(true);
    setError("");
    try {
      const response = await api.get(`/telegram-channels/${channelId}/ai-posting/settings/export`);
      const exported = removeInlineImages(response.data) as Record<string, unknown>;
      const guide = typeof exported.instruction === "string" ? exported.instruction : t("telegram.posts.aiPostingTransfer.guideUnavailable");
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
        `## ${t("telegram.posts.aiPostingTransfer.contextHeading")}`,
        t("telegram.posts.aiPostingTransfer.contextInstruction"),
        "```json",
        JSON.stringify(context, null, 2),
        "```",
      ].join("\n");
      await navigator.clipboard.writeText(clipboardText);
      setContextCopied(true);
      window.setTimeout(() => setContextCopied(false), 3000);
    } catch {
      setError(t("telegram.posts.aiPostingTransfer.copyError"));
    } finally {
      setContextBusy(false);
    }
  };

  const importContext = async () => {
    if (!content.trim() || busy) return;
    setBusy(true);
    setError("");
    setReport(null);
    setComplete(false);
    try {
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
      const result = (await api.post(`/telegram-channels/${channelId}/ai-posting/settings/import`, { schemaVersion, configuration: importedConfiguration })).data as { report?: ImportReport };
      await onImported();
      const sectionCounts = Object.fromEntries(
        Object.entries(importedConfiguration).flatMap(([key, value]) =>
          Array.isArray(value) ? [[key, value.length]] : []),
      );
      setReport(result.report ? { ...result.report, sectionCounts } : null);
      setComplete(true);
    } catch (cause) {
      if (cause instanceof Error && cause.message === "INVALID_DOCUMENT") {
        setError(t("telegram.posts.aiPostingTransfer.invalid"));
      } else {
        const responseMessage = (cause as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
        const details = typeof responseMessage === "string" ? responseMessage : Array.isArray(responseMessage) ? responseMessage.filter((item): item is string => typeof item === "string").join("; ") : "";
        setError(details === "AI_POSTING_MEDIA_PREFERENCES_INVALID"
          ? t("telegram.posts.aiPostingTransfer.mediaInvalid")
          : [t("telegram.posts.aiPostingTransfer.importError"), details].filter(Boolean).join(" "));
      }
    } finally {
      setBusy(false);
    }
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold">{t("telegram.posts.aiPostingTransfer.title")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">{t("telegram.posts.aiPostingTransfer.intro")}</p>
      </div>
      <Button type="button" variant="secondary" disabled={contextBusy || busy} onClick={() => void copyContext()}>
        {contextBusy ? <LoaderCircle size={15} className="animate-spin"/> : contextCopied ? <Check size={15}/> : <Upload size={15}/>} {contextBusy ? t("telegram.posts.aiPostingTransfer.copying") : contextCopied ? t("telegram.posts.aiPostingTransfer.copied") : t("telegram.posts.aiPostingTransfer.copy")}
      </Button>
    </div>
    <ManagedPostsImportSource
      jsonOnly
      showEmptyEditor
      content={content}
      fileName={fileName}
      disabled={busy}
      onContent={(next) => { inputGeneration.current++; setContent(next); setFileName(null); setError(""); setReport(null); setComplete(false); }}
      onFile={(file) => void chooseFile(file)}
      onClear={clear}
      onCopyContent={() => { void navigator.clipboard?.writeText(content).catch(() => undefined); }}
    />
    {busy && <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-blue-200"><LoaderCircle size={16} className="animate-spin"/>{t("telegram.posts.aiPostingTransfer.applying")}</div>}
    {!busy && complete && <p role="status" className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 size={16}/>{t("telegram.posts.aiPostingTransfer.complete")}</p>}
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    {report && <section aria-label={t("telegram.posts.aiPostingTransfer.result")} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <h3 className="font-medium">{t("telegram.posts.aiPostingTransfer.sections")}</h3>
      <ul className="mt-2 space-y-1.5 text-sm text-neutral-300">
        {report.applied.map((item) => {
          const label = Object.hasOwn(sectionLabels, item.id)
            ? t(sectionLabels[item.id as keyof typeof sectionLabels])
            : item.label;
          const count = report.sectionCounts[item.id];
          const message = item.status === "kept"
            ? t("telegram.posts.aiPostingTransfer.kept", { section: label })
            : count === undefined
              ? t("telegram.posts.aiPostingTransfer.applied", { section: label })
              : t("telegram.posts.aiPostingTransfer.appliedCount", { section: label, count });
          return <li key={item.id} className="flex gap-2">
            <span aria-hidden="true" className={item.status === "applied" ? "text-emerald-300" : "text-neutral-500"}>{item.status === "applied" ? "✓" : "–"}</span>
            {message}
          </li>;
        })}
      </ul>
      {report.ignoredFields.length > 0 && <p className="mt-2 text-xs text-amber-200">
        {t("telegram.posts.aiPostingTransfer.ignored", { fields: report.ignoredFields.join(", ") })}
      </p>}
    </section>}
    <div className="flex justify-end border-t border-neutral-800 pt-3">
      <Button type="button" disabled={busy || !content.trim()} onClick={() => void importContext()}>{busy ? <><LoaderCircle size={15} className="animate-spin"/> {t("telegram.posts.aiPostingTransfer.importing")}</> : <><FileUp size={15}/> {t("telegram.posts.aiPostingTransfer.apply")}</>}</Button>
    </div>
  </div>;
}
