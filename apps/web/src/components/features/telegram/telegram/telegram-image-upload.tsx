"use client";


import { useEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent } from "react";
import { ImagePlus, Link2, LoaderCircle, Plus, X } from "lucide-react";
import { iconsApi } from "@/lib/api";
import { useAppToast } from "@/providers/toast-provider";
import { Button, FormField, Input } from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";

export function TelegramImageUpload({
  value,
  onChange,
  disabled,
  readOnly,
  compact,
  label,
  onUploadingChange,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
  readOnly?: boolean;
  compact?: boolean;
  label?: string;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [uploadingPreviews, setUploadingPreviews] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [pasteFocused, setPasteFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { pushToast } = useAppToast();
  const { t } = useI18n();

  const uploadBusy = uploadingPreviews.length > 0;
  const disabledState = disabled || uploadBusy;
  const helperText = useMemo(
    () =>
      compact
        ? t("telegram.posts.editorComponents.images.compactHelp")
        : t("telegram.posts.editorComponents.images.help"),
    [compact, t],
  );

  useEffect(() => {
    return () => onUploadingChange?.(false);
  }, [onUploadingChange]);

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) {
      pushToast(t("telegram.posts.editorComponents.images.errors.onlyImages"), "error");
      return;
    }

    const previews = imageFiles.map((file) => URL.createObjectURL(file));
    setUploadingPreviews(previews);
    onUploadingChange?.(true);
    try {
      const uploaded = await Promise.all(
        imageFiles.map((file) => iconsApi.upload(file)),
      );
      onChange([...value, ...uploaded.map((item) => item.imageUrl)]);
    } catch {
      pushToast(
        t("telegram.posts.editorComponents.images.errors.uploadFailed"),
        "error",
      );
    } finally {
      previews.forEach((preview) => URL.revokeObjectURL(preview));
      setUploadingPreviews([]);
      onUploadingChange?.(false);
    }
  };

  const handlePaste = async (event: ClipboardEvent | ReactClipboardEvent) => {
    if (readOnly || disabledState) return;

    const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (!files.length) return;

    event.preventDefault();
    await uploadFiles(files);
  };

  useEffect(() => {
    if (!pasteFocused || readOnly || disabledState) return;

    const onPaste = (event: ClipboardEvent) => {
      void handlePaste(event);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [disabledState, pasteFocused, readOnly, value]);

  const addImageUrl = () => {
    const normalizedUrl = imageUrl.trim();
    if (!normalizedUrl) return;
    try {
      const parsedUrl = new URL(normalizedUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error(t("telegram.posts.editorComponents.images.errors.protocol"));
      }
      onChange(value.includes(parsedUrl.toString()) ? value : [...value, parsedUrl.toString()]);
      setImageUrl("");
    } catch (error) {
      const message =
        t("telegram.posts.editorComponents.images.errors.invalidUrl");
      pushToast(message, "error");
    }
  };

  return (
    <FormField label={label ?? t("telegram.posts.editorComponents.images.label")}>
      {!readOnly ? (
        <div className="space-y-3">
          <div
            tabIndex={disabledState ? -1 : 0}
            onFocus={() => setPasteFocused(true)}
            onBlur={() => setPasteFocused(false)}
            onPaste={(event) => {
              void handlePaste(event);
            }}
            className={`rounded-lg border border-dashed ${
              pasteFocused ? "border-blue-600" : "border-neutral-700"
            } bg-neutral-950/50 p-3 transition ${
              disabled ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <label
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-sm text-neutral-300 hover:text-white ${
                compact ? "h-[38px] py-2" : "py-3"
              }`}
            >
              <ImagePlus size={18} />
              {uploadBusy ? t("telegram.posts.editorComponents.images.uploadingImages") : t("telegram.posts.editorComponents.images.uploadImages")}
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept="image/*"
                multiple
                disabled={disabledState}
                onChange={async (event) => {
                  const files = Array.from(event.target.files || []);
                  event.target.value = "";
                  await uploadFiles(files);
                }}
              />
            </label>
            <div className="mt-1 flex items-center justify-center gap-2 text-center text-xs text-neutral-500">
              <Plus size={12} />
              <span>{helperText}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1">
              <Input
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="https://example.com/image.png"
                disabled={disabledState}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addImageUrl();
                  }
                }}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={disabledState || !imageUrl.trim()}
              onClick={() => {
                addImageUrl();
              }}
            >
              <span className="inline-flex items-center gap-2">
                <Link2 size={15} />
                {t("telegram.posts.editorComponents.images.addByUrl")}
              </span>
            </Button>
          </div>
        </div>
      ) : null}
      {value.length || uploadingPreviews.length ? (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {value.map((url, index) => (
            <div
              key={`${url}-${index}`}
              className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      value.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  className="absolute right-1 top-1 rounded-md bg-black/75 p-1 text-white opacity-0 transition group-hover:opacity-100"
                  aria-label={t("telegram.posts.editorComponents.images.remove")}
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          ))}
          {uploadingPreviews.map((url, index) => (
            <div
              key={`uploading-${url}`}
              className="relative aspect-square overflow-hidden rounded-lg border border-blue-700/70 bg-neutral-950"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={t("telegram.posts.editorComponents.images.uploadingImage", { number: index + 1 })}
                className="h-full w-full object-contain opacity-35 blur-[1px]"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/25 text-blue-200">
                <LoaderCircle size={22} className="animate-spin" />
                <span className="text-[10px]">{t("telegram.posts.editorComponents.images.uploading")}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </FormField>
  );
}
