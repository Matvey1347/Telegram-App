"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clipboard, LoaderCircle, Upload } from "lucide-react";
import type { TelegramUnifiedImportPreview, TelegramUnifiedImportResult } from "@telegram-system/shared";
import { Button, Modal } from "@/components/ui/primitives";
import { telegramChannelsApi } from "@/lib/api";
import { useAppToast } from "@/providers/toast-provider";
import { useI18n } from "@/providers/i18n-provider";
import { parseUnifiedImportManifest, unifiedImportPrompt } from "./unified-import-model";

export function UnifiedImportModal({ open, channelId, onClose, onApplied }: {
  open: boolean;
  channelId: string;
  onClose: () => void;
  onApplied: () => Promise<void>;
}) {
  const { pushToast } = useAppToast();
  const { t } = useI18n();
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<TelegramUnifiedImportPreview | null>(null);
  const [result, setResult] = useState<TelegramUnifiedImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => {
    if (!raw.trim()) return { manifest: null, error: "" };
    try { return { manifest: parseUnifiedImportManifest(raw), error: "" }; }
    catch (error) { return { manifest: null, error: error instanceof Error ? error.message : t("telegram.posts.import.invalidFile") }; }
  }, [raw, t]);

  const loadFile = async (file?: File) => {
    if (!file) return;
    setRaw(await file.text());
    setPreview(null);
  };
  const runPreview = async () => {
    if (!parsed.manifest) return;
    setBusy(true);
    try { setPreview(await telegramChannelsApi.previewUnifiedImport(channelId, parsed.manifest)); }
    catch (error) { pushToast(error instanceof Error ? error.message : t("telegram.posts.import.unifiedPreviewError"), "error"); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    if (!parsed.manifest || !preview?.valid) return;
    setBusy(true);
    try {
      const result = await telegramChannelsApi.applyUnifiedImport(channelId, parsed.manifest, preview.manifestHash);
      setResult(result);
      await onApplied();
      const failed = result.sections.reduce((total, section) => total + section.failed.length, 0);
      if (failed) {
        pushToast(t("telegram.posts.import.unifiedPartial", { count: failed }), "error");
      } else {
        pushToast(t("telegram.posts.import.unifiedApplied", { hash: result.manifestHash.slice(0, 8) }), "success");
        onClose();
      }
    } catch (error) { pushToast(error instanceof Error ? error.message : t("telegram.posts.import.unifiedApplyError"), "error"); }
    finally { setBusy(false); }
  };

  return <Modal open={open} onClose={onClose} title={t("telegram.posts.import.unifiedTitle")} size="xl">
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900">
          <Upload size={16} /> {t("telegram.posts.import.unifiedUpload")}
          <input className="sr-only" type="file" accept="application/json,.json" onChange={(event) => void loadFile(event.target.files?.[0])} />
        </label>
        <Button type="button" variant="secondary" onClick={() => void navigator.clipboard.writeText(unifiedImportPrompt)}>
          <Clipboard size={16} /> {t("telegram.posts.import.unifiedCopyPrompt")}
        </Button>
      </div>
      <textarea aria-label={t("telegram.posts.import.unifiedManifest")} className="min-h-56 w-full rounded-lg border border-neutral-700 bg-neutral-950 p-3 font-mono text-xs text-neutral-100" value={raw} onChange={(event) => { setRaw(event.target.value); setPreview(null); }} placeholder='{"version":1,"groups":[],"hypotheses":[],"posts":[],"schedule":[]}' />
      {parsed.error ? <p className="text-sm text-rose-400">{parsed.error}</p> : null}
      {preview ? <div className="grid gap-3 sm:grid-cols-2">
        {preview.sections.map((section) => <section key={section.key} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <h4 className="font-medium text-white">{section.key}</h4>
          <p className="mt-1 text-xs text-neutral-400">{t("telegram.posts.import.unifiedValid", { valid: section.validCount, invalid: section.invalidCount })}</p>
          <div className="mt-2 space-y-1">{section.items.map((item) => <p key={`${item.ref}:${item.action}`} className={item.valid ? "text-xs text-neutral-300" : "text-xs text-rose-400"}>{item.valid ? "✓" : "×"} {item.action} {item.label}{item.errors.length ? ` — ${item.errors.join("; ")}` : ""}</p>)}</div>
        </section>)}
      </div> : null}
      {result?.sections.some((section) => section.failed.length) ? <div className="rounded-lg border border-rose-800 bg-rose-950/20 p-3 text-sm text-rose-200">
        {result.sections.flatMap((section) => section.failed.map((failure) => <p key={`${section.key}:${failure.ref}`}>{section.key} · {failure.ref}: {failure.error}</p>))}
      </div> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>{t("telegram.posts.import.cancel")}</Button>
        <Button type="button" variant="secondary" disabled={!parsed.manifest || busy} onClick={() => void runPreview()}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : null}{t("telegram.posts.import.previewAction")}</Button>
        <Button type="button" disabled={!preview?.valid || busy} onClick={() => void apply()}><CheckCircle2 size={16} />{t("telegram.posts.import.applyAction")}</Button>
      </div>
    </div>
  </Modal>;
}
