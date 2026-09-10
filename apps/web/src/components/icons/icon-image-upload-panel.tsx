"use client";

import { ImagePlus, LoaderCircle } from "lucide-react";
import { Button, Input } from "@/components/ui/primitives";
import { uiCopy } from "@/lib/ui-i18n";

export type IconUploadPreview = {
  imageUrl: string;
  fileName: string;
};

type UploadCopy = Pick<
  ReturnType<typeof uiCopy>,
  | "uploadingImage"
  | "preparingPreview"
  | "uploadImage"
  | "dropImage"
  | "preview"
  | "readyOnce"
  | "iconName"
  | "iconNameExample"
  | "save"
  | "useOnce"
  | "saveCustomIcon"
  | "back"
>;

export function clipboardImageFile(data: DataTransfer | null) {
  const file = Array.from(data?.files ?? []).find((item) =>
    item.type.startsWith("image/"),
  );
  if (file) return file;
  for (const item of Array.from(data?.items ?? [])) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const pasted = item.getAsFile();
    if (pasted) return pasted;
  }
  return undefined;
}

export function IconImageUploadPanel({
  copy,
  upload,
  uploadName,
  uploading,
  disabled,
  saveReusableOpen,
  onChooseFile,
  onFile,
  onUploadName,
  onBeginSaveReusable,
  onUseOnce,
  onSaveReusable,
  onBack,
}: {
  copy: UploadCopy;
  upload: IconUploadPreview | null;
  uploadName: string;
  uploading: boolean;
  disabled: boolean;
  saveReusableOpen: boolean;
  onChooseFile: () => void;
  onFile: (file?: File) => void;
  onUploadName: (value: string) => void;
  onBeginSaveReusable: (suggestedName: string) => void;
  onUseOnce: (upload: IconUploadPreview) => void;
  onSaveReusable: (upload: IconUploadPreview, name: string) => void;
  onBack: () => void;
}) {
  return (
    <div
      role="region"
      aria-label="Image upload drop and paste area"
      tabIndex={0}
      className="min-h-0 flex flex-1 flex-col overflow-hidden rounded-xl border border-dashed border-neutral-700 bg-neutral-950 p-3 outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onFile(
          Array.from(event.dataTransfer?.files ?? []).find((file) =>
            file.type.startsWith("image/"),
          ),
        );
      }}
      onPaste={(event) => {
        const file = clipboardImageFile(event.clipboardData);
        if (!file) return;
        event.preventDefault();
        event.stopPropagation();
        onFile(file);
      }}
    >
      {uploading ? (
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-8 text-neutral-300">
          <LoaderCircle size={24} className="animate-spin text-blue-400" />
          <span>{copy.uploadingImage}</span>
          <span className="text-xs text-neutral-500">
            {copy.preparingPreview}
          </span>
        </div>
      ) : !upload ? (
        <button
          type="button"
          onClick={onChooseFile}
          className="flex w-full flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-8 text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-800/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ImagePlus size={20} />
          <span>{copy.uploadImage}</span>
          <span className="text-xs text-neutral-500">{copy.dropImage}</span>
        </button>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="space-y-4 pb-3">
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                <p className="mb-3 text-sm text-neutral-400">{copy.preview}</p>
                <div className="flex items-center gap-4">
                  {/* The upload preview may be a temporary blob URL, which next/image cannot optimize. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={upload.imageUrl}
                    alt=""
                    className="h-20 w-20 rounded-xl border border-neutral-700 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-neutral-300">{copy.readyOnce}</p>
                    <p className="truncate text-xs text-neutral-500">
                      {upload.fileName}
                    </p>
                  </div>
                </div>
              </div>
              {saveReusableOpen ? (
                <div>
                  <label className="mb-1 block text-sm text-neutral-300">
                    {copy.iconName}
                  </label>
                  <Input
                    value={uploadName}
                    onChange={(event) => onUploadName(event.target.value)}
                    placeholder={copy.iconNameExample}
                  />
                </div>
              ) : null}
            </div>
          </div>
          <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-neutral-800 bg-neutral-950 pt-3">
            <Button
              type="button"
              className="w-full"
              disabled={disabled || (saveReusableOpen && !uploadName.trim())}
              onClick={() =>
                saveReusableOpen
                  ? onSaveReusable(upload, uploadName.trim())
                  : onUseOnce(upload)
              }
            >
              {saveReusableOpen ? copy.save : copy.useOnce}
            </Button>
            {!saveReusableOpen ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={disabled}
                onClick={() => onBeginSaveReusable(upload.fileName)}
              >
                {copy.saveCustomIcon}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={onBack}
            >
              {copy.back}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
