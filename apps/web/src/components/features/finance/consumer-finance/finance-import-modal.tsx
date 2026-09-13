"use client";

import { Check, CheckCircle2, Clipboard, FileJson, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ConsumerFinanceImportProgress,
  ConsumerFinanceImportResult,
} from "@telegram-system/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  CONSUMER_FINANCE_IMPORT_MAX_BYTES,
  importConsumerFinanceData,
} from "@/lib/features/finance/consumer-finance-portability-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { Button, Modal } from "./ui";
import type { FinanceLocale } from "./i18n/core";
import { financeSettingsCopy } from "./i18n/settings";
import { financeImportInstructions } from "./finance-import-instructions";

type ImportError = Error & { path?: string; code?: string };

export function FinanceImportModal({
  open,
  botId,
  locale,
  onClose,
}: {
  open: boolean;
  botId: string;
  locale: FinanceLocale;
  onClose: () => void;
}) {
  const copy = financeSettingsCopy(locale);
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [mode, setMode] = useState<"ADD" | "REPLACE">("ADD");
  const [dragging, setDragging] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const [progress, setProgress] =
    useState<ConsumerFinanceImportProgress | null>(null);
  const [step, setStep] = useState({ current: 0, total: 15 });
  const [result, setResult] = useState<ConsumerFinanceImportResult | null>(
    null,
  );
  const [error, setError] = useState<ImportError | null>(null);
  const [importing, setImporting] = useState(false);
  const instructions = useMemo(
    () => financeImportInstructions(locale),
    [locale],
  );

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (copiedTimerRef.current !== null)
        window.clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  const selectFile = async (next: File | null) => {
    if (importing) return;
    setResult(null);
    setError(null);
    setProgress(null);
    setFileError("");
    setFile(null);
    if (!next) return;
    if (
      !next.name.toLowerCase().endsWith(".json") ||
      next.size > CONSUMER_FINANCE_IMPORT_MAX_BYTES
    ) {
      setFileError(copy.invalidImportFile);
      return;
    }
    try {
      const parsed = JSON.parse(await next.text()) as Record<string, unknown>;
      if (
        parsed.format !== "telegram-system.consumer-finance" ||
        parsed.version !== 1 ||
        (parsed.mode !== "ADD" && parsed.mode !== "REPLACE") ||
        !parsed.data
      ) {
        throw new Error("invalid envelope");
      }
      setFile(next);
    } catch {
      setFileError(copy.invalidImportFile);
    }
  };

  const runImport = async () => {
    if (!file || !confirmed || importing) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setImporting(true);
    setError(null);
    setResult(null);
    setStep({ current: 0, total: 15 });
    try {
      const imported = await importConsumerFinanceData({
        botId,
        file,
        mode,
        signal: controller.signal,
        onProgress: (next, current, total) => {
          setProgress(next);
          setStep({ current, total });
        },
      });
      setResult(imported);
      await queryClient.invalidateQueries({
        queryKey: consumerFinanceKeys.root(botId),
      });
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") {
        setProgress(null);
        setStep({ current: 0, total: 15 });
        return;
      }
      setError(reason as ImportError);
    } finally {
      abortRef.current = null;
      setImporting(false);
    }
  };

  const close = () => {
    abortRef.current?.abort();
    setFile(null);
    setFileError("");
    setConfirmed(false);
    setMode("ADD");
    setProgress(null);
    setResult(null);
    setError(null);
    setCopyDone(false);
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = null;
    }
    onClose();
  };
  const percent = Math.round((step.current / Math.max(step.total, 1)) * 100);

  return (
    <Modal
      open={open}
      onClose={close}
      title={copy.importTitle}
      size="xl"
      closeLabel={copy.closeImport}
    >
      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="min-w-0">
          <p className="text-sm leading-6 text-neutral-400">
            {copy.importDescription}
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-950/70">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 px-3 py-2">
              <h4 className="text-sm font-medium">{copy.importInstruction}</h4>
              <Button
                variant="secondary"
                className="!px-3 !py-1.5"
                onClick={async () => {
                  await navigator.clipboard.writeText(instructions);
                  setCopyDone(true);
                  if (copiedTimerRef.current !== null)
                    window.clearTimeout(copiedTimerRef.current);
                  copiedTimerRef.current = window.setTimeout(
                    () => setCopyDone(false),
                    1800,
                  );
                }}
              >
                {copyDone ? <Check size={15} /> : <Clipboard size={15} />}
                {copyDone ? copy.instructionCopied : copy.copyInstruction}
              </Button>
            </div>
            <pre className="max-h-[42vh] overflow-auto whitespace-pre-wrap p-4 text-xs leading-5 text-neutral-300 [scrollbar-color:#3f3f46_transparent]">
              {instructions}
            </pre>
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <label
            className={`flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center transition ${dragging ? "border-sky-400 bg-sky-500/10" : "border-neutral-600 bg-neutral-950/50 hover:border-neutral-500 hover:bg-neutral-800/50"}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void selectFile(event.dataTransfer.files[0] ?? null);
            }}
          >
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              disabled={importing}
              onChange={(event) =>
                void selectFile(event.currentTarget.files?.[0] ?? null)
              }
            />
            {file ? (
              <>
                <FileJson size={32} className="text-emerald-300" />
                <span className="mt-3 max-w-full truncate text-sm font-medium text-white">
                  {file.name}
                </span>
                <span className="mt-1 text-xs text-neutral-500">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
              </>
            ) : (
              <>
                <Upload size={30} className="text-sky-300" />
                <span className="mt-3 text-sm font-medium text-neutral-100">
                  {copy.dropImportFile}
                </span>
                <span className="mt-1 text-xs text-neutral-500">
                  {copy.importFileHelp}
                </span>
              </>
            )}
          </label>
          {fileError ? (
            <p role="alert" className="text-sm text-rose-300">
              {fileError}
            </p>
          ) : null}

          <fieldset className="rounded-xl border border-neutral-800 bg-neutral-950/45 p-3">
            <legend className="px-1 text-sm font-medium text-neutral-200">
              {copy.importMode}
            </legend>
            <div
              role="radiogroup"
              className="mt-1 grid grid-cols-2 gap-1 rounded-xl bg-neutral-900 p-1"
            >
              {(["ADD", "REPLACE"] as const).map((value) => {
                const active = mode === value;
                const destructive = value === "REPLACE";
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={importing}
                    onClick={() => {
                      setMode(value);
                      setConfirmed(false);
                      setResult(null);
                      setError(null);
                    }}
                    className={`min-h-10 rounded-lg px-3 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-sky-300 ${active ? (destructive ? "bg-rose-950 text-rose-200 shadow-[inset_0_0_0_1px_rgb(244_63_94/0.5)]" : "bg-sky-600 text-white") : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"}`}
                  >
                    {destructive ? copy.importModeReplace : copy.importModeAdd}
                  </button>
                );
              })}
            </div>
            <p
              className={`mt-2 text-xs leading-5 ${mode === "REPLACE" ? "text-rose-300" : "text-neutral-500"}`}
            >
              {mode === "REPLACE"
                ? copy.importModeReplaceHelp
                : copy.importModeAddHelp}
            </p>
          </fieldset>

          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm leading-5 ${mode === "REPLACE" ? "border-rose-900/80 bg-rose-950/20 text-rose-100" : "border-neutral-800 bg-neutral-950/45 text-neutral-300"}`}
          >
            <input
              type="checkbox"
              checked={confirmed}
              disabled={importing}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-blue-500"
            />
            <span>
              {mode === "REPLACE"
                ? copy.importReplacesData
                : copy.importAddsData}
            </span>
          </label>

          {progress || importing ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl border border-sky-900/70 bg-sky-950/20 p-3"
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{copy.importProgress}</span>
                <span className="tabular-nums text-sky-200">{percent}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full rounded-full bg-sky-400 transition-[width] duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-neutral-400">
                {copy.importPhases[progress?.phase ?? "VALIDATING"]} ·{" "}
                {copy.importSections[progress?.section ?? "document"]}
              </p>
            </div>
          ) : null}

          {result ? (
            <div className="rounded-xl border border-emerald-900/70 bg-emerald-950/20 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-emerald-200">
                <CheckCircle2 size={17} /> {copy.importComplete}
              </div>
              <p className="mt-2 text-neutral-300">
                {result.duplicate
                  ? copy.importDuplicate
                  : `${copy.importedRecords}: ${result.imported}`}
              </p>
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-900/70 bg-rose-950/20 p-3 text-sm text-rose-200"
            >
              <p className="font-medium">{copy.importError}</p>
              <p className="mt-1 break-words text-xs text-rose-300">
                {error.path ? `${error.path}: ` : ""}
                {error.message}
              </p>
            </div>
          ) : null}

          <div className="mt-auto flex flex-wrap justify-end gap-2 pt-2">
            {importing ? (
              <Button
                variant="secondary"
                onClick={() => abortRef.current?.abort()}
              >
                {copy.cancelImport}
              </Button>
            ) : (
              <Button variant="secondary" onClick={close}>
                {copy.cancel}
              </Button>
            )}
            <Button
              disabled={!file || !confirmed || importing}
              onClick={() => void runImport()}
            >
              <Upload size={16} />
              {importing ? copy.importingData : copy.startImport}
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
