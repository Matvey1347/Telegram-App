"use client";

import {
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import { FileUp, Link2, LoaderCircle, Plus, Upload, X } from "lucide-react";
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
  const [dragging, setDragging] = useState(false);
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

  const pasteFiles = (event: ClipboardEvent<HTMLElement>) => {
    if (locked || value.length >= 10) return;
    const files = Array.from(event.clipboardData.files);
    if (!files.length) return;
    event.preventDefault();
    void uploadFiles(files);
  };

  const dropFiles = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    if (locked || value.length >= 10) return;
    void uploadFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <FormField label="Media (photos, video, GIF)">
      {!readOnly ? (
        <div className="space-y-2">
          <div
            role="region"
            aria-label="Media drop and paste area"
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center transition ${
              dragging
                ? "border-blue-500 bg-blue-950/30 text-white"
                : "border-neutral-700 text-neutral-300 hover:border-blue-600"
            } ${compact ? "min-h-20" : "min-h-28"}`}
            onPaste={pasteFiles}
            onDragEnter={() => setDragging(true)}
            onDragLeave={() => setDragging(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={dropFiles}
            tabIndex={locked || value.length >= 10 ? -1 : 0}
          >
            <span className="inline-flex items-center gap-2 text-sm font-medium">
              {uploading ? <LoaderCircle className="animate-spin" size={18} /> : <FileUp size={18} />}
              {uploading ? "Uploading media…" : "Drop or paste photos, video or GIF"}
            </span>
            <button
              type="button"
              disabled={locked || value.length >= 10}
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-blue-500/70 bg-blue-600/15 px-4 text-sm font-medium text-blue-200 transition hover:bg-blue-600/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload size={14} /> Choose files
            </button>
            <span className="text-xs text-neutral-500">Images, GIFs, MP4, or WebM up to 20 MB</span>
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
          </div>
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
