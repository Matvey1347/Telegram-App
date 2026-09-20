"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, LoaderCircle } from "lucide-react";
import {
  buildTelegramGptContextFilename,
  TELEGRAM_UNIFIED_IMPORT_INSTRUCTION,
  type TelegramUnifiedImportPreview,
  type TelegramUnifiedImportProgressItem,
  type TelegramUnifiedImportResult,
} from "@telegram-system/shared";
import { Button, Modal } from "@/components/ui/primitives";
import { telegramChannelsApi } from "@/lib/api";
import { useAppToast } from "@/providers/toast-provider";
import { useI18n } from "@/providers/i18n-provider";
import { parseUnifiedImportManifest } from "./unified-import-model";
import { ManagedPostsImportSource } from "./managed-posts-import-source";
import { withCurrentUnifiedImportInstruction } from "./unified-import-context-download";
import { UnifiedImportPreview } from "./unified-import-preview";
import {
  applyUnifiedImportProgressToManifest,
  reconcileUnifiedImportResult,
  successfulUnifiedImportProgressCount,
  summarizeUnifiedImportProgress,
  UnifiedImportProgress,
  type UnifiedImportProgressEntry,
  type UnifiedImportProgressStatus,
} from "./unified-import-progress";
export function UnifiedImportModal({
  open,
  channelId,
  channelTitle,
  channelPhotoUrl,
  channelTelegramChatId,
  captionLengthMax = 1024,
  messageLengthMax = 4096,
  onClose,
  onApplied,
}: {
  open: boolean;
  channelId: string;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  channelTelegramChatId?: string | null;
  captionLengthMax?: number;
  messageLengthMax?: number;
  onClose: () => void;
  onApplied: () => Promise<void>;
}) {
  const { pushToast, startOperation } = useAppToast();
  const { t } = useI18n();
  const [raw, setRaw] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<TelegramUnifiedImportPreview | null>(
    null,
  );
  const [result, setResult] = useState<TelegramUnifiedImportResult | null>(
    null,
  );
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [applyBusy, setApplyBusy] = useState(false);
  const [progressEntries, setProgressEntries] = useState<
    UnifiedImportProgressEntry[]
  >([]);
  const [progressStatus, setProgressStatus] = useState<
    UnifiedImportProgressStatus | "idle"
  >("idle");
  const [progressError, setProgressError] = useState("");
  const [contextBusy, setContextBusy] = useState(false);
  const previewRequestId = useRef(0);
  const previewCounts = preview?.sections.reduce(
    (counts, section) => ({
      valid: counts.valid + section.validCount,
      invalid: counts.invalid + section.invalidCount,
    }),
    { valid: 0, invalid: 0 },
  );
  const parsed = useMemo(() => {
    if (!raw.trim()) return { manifest: null, error: "" };
    try {
      return { manifest: parseUnifiedImportManifest(raw), error: "" };
    } catch (error) {
      return {
        manifest: null,
        error:
          error instanceof Error
            ? error.message
            : t("telegram.posts.import.invalidFile"),
      };
    }
  }, [raw, t]);
  const resetPreview = () => {
    previewRequestId.current += 1;
    setPreview(null);
    setPreviewBusy(false);
    setPreviewError("");
  };
  const resetProgress = () => {
    setProgressEntries([]);
    setProgressStatus("idle");
    setProgressError("");
  };

  useEffect(() => {
    const requestId = ++previewRequestId.current;
    if (!open || !parsed.manifest || applyBusy) return;
    const timer = window.setTimeout(() => {
      setPreviewBusy(true);
      setPreviewError("");
      void telegramChannelsApi
        .previewUnifiedImport(channelId, parsed.manifest!)
        .then((nextPreview) => {
          if (previewRequestId.current !== requestId) return;
          setPreview(nextPreview);
        })
        .catch((error: unknown) => {
          if (previewRequestId.current !== requestId) return;
          setPreviewError(
            error instanceof Error
              ? error.message
              : t("telegram.posts.import.unifiedPreviewError"),
          );
        })
        .finally(() => {
          if (previewRequestId.current === requestId) setPreviewBusy(false);
        });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [applyBusy, channelId, open, parsed.manifest, t]);

  const loadFile = async (file?: File) => {
    if (!file) return;
    setRaw(await file.text());
    setFileName(file.name);
    resetPreview();
    setResult(null);
    resetProgress();
  };
  const downloadInstructionAndContext = async () => {
    if (contextBusy) return;
    setContextBusy(true);
    try {
      const serverBlob = await telegramChannelsApi.unifiedImportContext(channelId);
      const blob = await withCurrentUnifiedImportInstruction(serverBlob);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = buildTelegramGptContextFilename(channelTitle);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      pushToast(t("telegram.posts.import.unifiedContextReady"), "success");
    } catch (error) {
      pushToast(
        error instanceof Error
          ? error.message
          : t("telegram.posts.import.unifiedContextError"),
        "error",
      );
    } finally {
      setContextBusy(false);
    }
  };
  const apply = async () => {
    if (!parsed.manifest || !preview?.valid) return;
    const controller = new AbortController();
    const operation = startOperation({
      id: `unified-import:${channelId}`,
      title: t("telegram.posts.import.unifiedTitle"),
      message: t("telegram.posts.import.progressStarting"),
      current: 0,
      total: 0,
      onCancel: () => controller.abort(),
    });
    setApplyBusy(true);
    setProgressEntries([]);
    setProgressStatus("running");
    setProgressError("");
    setResult(null);
    const streamedEntries: UnifiedImportProgressEntry[] = [];
    let streamedManifest = parsed.manifest;
    try {
      const result = await telegramChannelsApi.applyUnifiedImportWithProgress(
        channelId,
        parsed.manifest,
        preview.manifestHash,
        (
          item: TelegramUnifiedImportProgressItem,
          current: number,
          total: number,
        ) => {
          streamedEntries.push({ item, current, total });
          setProgressEntries([...streamedEntries]);
          const nextManifest = applyUnifiedImportProgressToManifest(
            streamedManifest,
            item,
          );
          if (nextManifest !== streamedManifest) {
            streamedManifest = nextManifest;
            setRaw(JSON.stringify(streamedManifest, null, 2));
          }
          const summary = summarizeUnifiedImportProgress(streamedEntries);
          operation.update({
            message: `${item.action ?? item.section}: ${item.label ?? item.message}`,
            current,
            total,
            progressSummary: {
              successful: successfulUnifiedImportProgressCount(summary),
              failed: summary.failed,
            },
            details: t("telegram.posts.import.progressCounts", summary),
          });
        },
        { signal: controller.signal },
      );
      setResult(result);
      setRaw(JSON.stringify(result.manifest, null, 2));
      setFileName(null);
      const finalEntries = reconcileUnifiedImportResult(
        streamedEntries,
        result,
      );
      setProgressEntries(finalEntries);
      await onApplied();
      const failed = result.sections.reduce(
        (total, section) => total + section.failed.length,
        0,
      );
      const completedSummary = summarizeUnifiedImportProgress(finalEntries);
      const countMessage = t(
        "telegram.posts.import.progressCounts",
        completedSummary,
      );
      if (failed) {
        setProgressStatus("completed-with-errors");
        operation.fail({
          message: `${t("telegram.posts.import.unifiedPartial", { count: failed })} ${countMessage}`,
        });
      } else {
        setProgressStatus("completed");
        operation.succeed({
          message: `${t("telegram.posts.import.unifiedApplied", {
            hash: result.manifestHash.slice(0, 8),
          })} ${countMessage}`,
        });
      }
    } catch (error) {
      if (controller.signal.aborted) {
        const summary = summarizeUnifiedImportProgress(streamedEntries);
        const stoppedMessage = t("telegram.posts.import.stopped", {
          successful: successfulUnifiedImportProgressCount(summary),
          failed: summary.failed,
        });
        setProgressStatus("cancelled");
        setProgressError(stoppedMessage);
        operation.dismiss();
        pushToast(stoppedMessage, "info");
      } else {
        const errorMessage =
          error instanceof Error
            ? error.message
            : t("telegram.posts.import.unifiedApplyError");
        setProgressStatus("failed");
        setProgressError(errorMessage);
        operation.fail({
          message: errorMessage,
        });
      }
    } finally {
      setApplyBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("telegram.posts.import.unifiedTitle")}
      size="xl"
    >
      <div className="space-y-4">
        <div>
          <Button
            type="button"
            variant="secondary"
            disabled={contextBusy}
            onClick={() => void downloadInstructionAndContext()}
          >
            {contextBusy ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <Download size={16} />
            )}
            {t("telegram.posts.import.unifiedCopyAndDownload")}
          </Button>
        </div>
        <ManagedPostsImportSource
          content={raw}
          fileName={fileName}
          disabled={applyBusy}
          onContent={(content) => {
            setRaw(content);
            resetPreview();
            setResult(null);
            resetProgress();
          }}
          onFile={(file) => void loadFile(file)}
          onClear={() => {
            setRaw("");
            setFileName(null);
            resetPreview();
            setResult(null);
            resetProgress();
          }}
          onCopyContent={() => {
            void navigator.clipboard.writeText(raw).then(
              () => pushToast(t("telegram.posts.import.dataCopied"), "success"),
              () =>
                pushToast(t("telegram.posts.import.dataCopyError"), "error"),
            );
          }}
        />
        {parsed.error ? (
          <p className="text-sm text-rose-400">{parsed.error}</p>
        ) : null}
        {previewBusy ? (
          <p
            role="status"
            className="inline-flex items-center gap-2 text-sm text-neutral-400"
          >
            <LoaderCircle className="animate-spin" size={16} />
            {t("telegram.posts.import.unifiedPreviewing")}
          </p>
        ) : null}
        {previewError ? (
          <p role="alert" className="text-sm text-rose-400">
            {previewError}
          </p>
        ) : null}
        {preview && parsed.manifest ? (
          <UnifiedImportPreview
            preview={preview}
            manifest={parsed.manifest}
            channelId={channelId}
            channelTitle={channelTitle}
            channelPhotoUrl={channelPhotoUrl}
            channelTelegramChatId={channelTelegramChatId}
            captionLengthMax={captionLengthMax}
            messageLengthMax={messageLengthMax}
            disabled={applyBusy}
            result={result}
            onChange={(manifest) => {
              setRaw(JSON.stringify(manifest, null, 2));
              setFileName(null);
              previewRequestId.current += 1;
              setPreviewBusy(true);
              setPreviewError("");
              setResult(null);
              resetProgress();
            }}
          />
        ) : null}
        {progressStatus !== "idle" ? (
          <UnifiedImportProgress
            entries={progressEntries}
            status={progressStatus}
            errorMessage={progressError || undefined}
          />
        ) : null}
        <div className="sticky -bottom-4 z-10 flex items-center justify-between gap-3 border-t border-neutral-800 bg-neutral-900/95 px-1 py-3 backdrop-blur">
          {preview && !preview.valid && previewCounts ? (
            <p role="alert" className="text-sm text-rose-300">
              {t("telegram.posts.import.unifiedValid", previewCounts)}
            </p>
          ) : (
            <span />
          )}
          <Button
            type="button"
            disabled={!preview?.valid || previewBusy || applyBusy}
            onClick={() => void apply()}
          >
            {applyBusy ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <CheckCircle2 size={16} />
            )}
            {t("common.import")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
