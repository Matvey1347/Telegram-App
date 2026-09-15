"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clipboard, Download, LoaderCircle } from "lucide-react";
import {
  buildTelegramGptContextFilename,
  TELEGRAM_UNIFIED_IMPORT_INSTRUCTION,
  type TelegramUnifiedImportPreview,
  type TelegramUnifiedImportResult,
} from "@telegram-system/shared";
import { Button, Modal } from "@/components/ui/primitives";
import { telegramChannelsApi } from "@/lib/api";
import { useAppToast } from "@/providers/toast-provider";
import { useI18n } from "@/providers/i18n-provider";
import { parseUnifiedImportManifest } from "./unified-import-model";
import { ManagedPostsImportSource } from "./managed-posts-import-source";
import { UnifiedImportPreview } from "./unified-import-preview";

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
  const { pushToast } = useAppToast();
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
  const [contextBusy, setContextBusy] = useState(false);
  const previewRequestId = useRef(0);
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

  useEffect(() => {
    const requestId = ++previewRequestId.current;
    if (!open || !parsed.manifest) return;
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
  }, [channelId, open, parsed.manifest, t]);

  const loadFile = async (file?: File) => {
    if (!file) return;
    setRaw(await file.text());
    setFileName(file.name);
    resetPreview();
    setResult(null);
  };
  const copyInstructionsAndDownloadContext = async () => {
    if (contextBusy) return;
    setContextBusy(true);
    try {
      const [blob] = await Promise.all([
        telegramChannelsApi.unifiedImportContext(channelId),
        navigator.clipboard.writeText(TELEGRAM_UNIFIED_IMPORT_INSTRUCTION),
      ]);
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
    setApplyBusy(true);
    try {
      const result = await telegramChannelsApi.applyUnifiedImport(
        channelId,
        parsed.manifest,
        preview.manifestHash,
      );
      setResult(result);
      await onApplied();
      const failed = result.sections.reduce(
        (total, section) => total + section.failed.length,
        0,
      );
      if (failed) {
        pushToast(
          t("telegram.posts.import.unifiedPartial", { count: failed }),
          "error",
        );
      } else {
        pushToast(
          t("telegram.posts.import.unifiedApplied", {
            hash: result.manifestHash.slice(0, 8),
          }),
          "success",
        );
        onClose();
      }
    } catch (error) {
      pushToast(
        error instanceof Error
          ? error.message
          : t("telegram.posts.import.unifiedApplyError"),
        "error",
      );
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
            onClick={() => void copyInstructionsAndDownloadContext()}
          >
            {contextBusy ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <Clipboard size={16} />
            )}
            {t("telegram.posts.import.unifiedCopyAndDownload")}
            {!contextBusy ? <Download size={15} /> : null}
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
          }}
          onFile={(file) => void loadFile(file)}
          onClear={() => {
            setRaw("");
            setFileName(null);
            resetPreview();
            setResult(null);
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
            onChange={(manifest) => {
              setRaw(JSON.stringify(manifest, null, 2));
              setFileName(null);
              previewRequestId.current += 1;
              setPreviewBusy(true);
              setPreviewError("");
              setResult(null);
            }}
          />
        ) : null}
        {result?.sections.some((section) => section.failed.length) ? (
          <div className="rounded-lg border border-rose-800 bg-rose-950/20 p-3 text-sm text-rose-200">
            {result.sections.flatMap((section) =>
              section.failed.map((failure) => (
                <p key={`${section.key}:${failure.ref}`}>
                  {section.key} · {failure.ref}: {failure.error}
                </p>
              )),
            )}
          </div>
        ) : null}
        <div className="sticky -bottom-4 z-10 flex justify-end gap-2 border-t border-neutral-800 bg-neutral-900/95 px-1 py-3 backdrop-blur">
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
