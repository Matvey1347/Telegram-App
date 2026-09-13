"use client";

import { useRef, useState } from "react";
import { Film, Link2, LoaderCircle, Plus, X } from "lucide-react";
import {
  inferTelegramPostMediaKind,
  type TelegramPostMediaItem,
} from "@telegram-system/shared";
import { telegramChannelsApi } from "@/lib/api";
import { useAppToast } from "@/providers/toast-provider";
import { Button, FormField, Input } from "@/components/ui/primitives";

export function TelegramPostMediaUpload({
  value,
  onChange,
  disabled,
  readOnly,
  compact,
  onUploadingChange,
}: {
  value: TelegramPostMediaItem[];
  onChange: (items: TelegramPostMediaItem[]) => void;
  disabled?: boolean;
  readOnly?: boolean;
  compact?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState("");
  const { pushToast } = useAppToast();
  const locked = disabled || uploading;

  const append = (items: TelegramPostMediaItem[]) => {
    const next = [...value, ...items].slice(0, 10);
    if (next.some((item) => item.kind === "ANIMATION") && next.length > 1) {
      pushToast(
        "GIF/animation must be the only media item in a post.",
        "error",
      );
      return;
    }
    onChange(next);
  };

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    if (
      files.some(
        (file) =>
          !file.type.startsWith("image/") && !file.type.startsWith("video/"),
      )
    ) {
      pushToast(
        "Only photos, GIFs, MP4 and WebM videos are supported.",
        "error",
      );
      return;
    }
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const uploaded: TelegramPostMediaItem[] = [];
      for (const file of files.slice(0, 10 - value.length)) {
        uploaded.push(await telegramChannelsApi.uploadManagedPostMedia(file));
      }
      append(uploaded);
    } catch {
      pushToast(
        "Media upload failed. The maximum file size is 20 MB.",
        "error",
      );
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  };

  const addUrl = () => {
    try {
      const parsed = new URL(url.trim());
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      const normalizedUrl = parsed.toString();
      const kind = inferTelegramPostMediaKind(normalizedUrl);
      if (!kind) {
        pushToast(
          "Could not detect the media type. Use a direct image, video or GIF file URL.",
          "error",
        );
        return;
      }
      append([{ kind, url: normalizedUrl }]);
      setUrl("");
    } catch {
      pushToast("Enter a valid HTTP or HTTPS media URL.", "error");
    }
  };

  return (
    <FormField label="Media (photos, video, GIF)">
      {!readOnly ? (
        <div className="space-y-2">
          <button
            type="button"
            disabled={locked || value.length >= 10}
            onClick={() => inputRef.current?.click()}
            className={`flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-700 text-sm text-neutral-300 hover:border-blue-600 ${compact ? "h-10" : "h-12"}`}
          >
            {uploading ? (
              <LoaderCircle className="animate-spin" size={18} />
            ) : (
              <Film size={18} />
            )}
            {uploading ? "Uploading media…" : "Upload photos, video or GIF"}
          </button>
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void uploadFiles(files);
            }}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="Direct image, video or GIF URL"
              disabled={locked}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={addUrl}
              disabled={locked || !url.trim()}
            >
              <span className="inline-flex items-center gap-1.5">
                <Link2 size={15} />
                Add
              </span>
            </Button>
          </div>
        </div>
      ) : null}
      {value.length ? (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {value.map((item, index) => (
            <div
              key={`${item.kind}-${item.url}-${index}`}
              className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-700 bg-black"
            >
              <MediaThumbnail item={item} />
              <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] text-white">
                {item.kind}
              </span>
              {!readOnly ? (
                <button
                  type="button"
                  aria-label="Remove media"
                  onClick={() =>
                    onChange(value.filter((_, position) => position !== index))
                  }
                  className="absolute right-1 top-1 rounded bg-black/75 p-1 text-white opacity-0 group-hover:opacity-100"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {!readOnly && value.length < 10 ? (
        <p className="mt-1 text-xs text-neutral-500">
          <Plus size={11} className="mr-1 inline" />
          Up to 10 photos/videos; GIF is sent separately.
        </p>
      ) : null}
    </FormField>
  );
}

function MediaThumbnail({ item }: { item: TelegramPostMediaItem }) {
  if (item.kind === "PHOTO" || item.mimeType === "image/gif") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.url} alt="" className="h-full w-full object-cover" />;
  }
  return (
    <video
      src={item.url}
      className="h-full w-full object-cover"
      muted
      playsInline
      preload="metadata"
    />
  );
}
