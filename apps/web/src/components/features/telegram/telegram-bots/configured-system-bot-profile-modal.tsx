"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp, LoaderCircle, Upload, X } from "lucide-react";
import {
  Button,
  FormField,
  Input,
  Modal,
  Textarea,
} from "@/components/ui/primitives";
import { BotRuntimeEnvironmentTabs } from "./bot-runtime-environment-tabs";
import { BotRuntimeAvatar } from "./bot-runtime-avatar";
import { api } from "@/lib/api";

export function ConfiguredSystemBotProfileModal({
  open,
  applicationType,
  runtimes,
  environment,
  saving,
  onClose,
  onEnvironmentChange,
  onSubmit,
}: {
  open: boolean;
  applicationType: "NONE" | "FINANCE";
  runtimes: Array<{
    environment: "LOCAL" | "PRODUCTION";
    username: string | null;
    name: string | null;
    description?: string | null;
    avatarUrl: string | null;
    faviconUrl?: string | null;
    faviconLightUrl?: string | null;
  }>;
  environment: "LOCAL" | "PRODUCTION";
  saving: boolean;
  onClose: () => void;
  onEnvironmentChange: (environment: "LOCAL" | "PRODUCTION") => void;
  onSubmit: (input: {
    name?: string;
    description?: string;
    avatar?: File;
    favicon?: File;
    faviconLight?: File;
  }) => void;
}) {
  const runtime =
    runtimes.find((item) => item.environment === environment) ?? null;
  const [name, setName] = useState(() => runtime?.name ?? "");
  const [description, setDescription] = useState(
    () => runtime?.description ?? "",
  );
  const [avatar, setAvatar] = useState<File>();
  const [favicon, setFavicon] = useState<File>();
  const [faviconLight, setFaviconLight] = useState<File>();
  const submit = () => {
    onSubmit({
      name:
        name.trim() !== (runtime?.name ?? "").trim() ? name.trim() : undefined,
      description:
        description !== (runtime?.description ?? "")
          ? description.trim()
          : undefined,
      ...(applicationType === "FINANCE" ? { favicon, faviconLight } : { avatar }),
    });
  };
  return (
    <Modal open={open} onClose={onClose} title="Edit bot" size={applicationType === "FINANCE" ? "xl" : "md"}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <BotRuntimeEnvironmentTabs
          environment={environment}
          availableEnvironments={runtimes.map((item) => item.environment)}
          onChange={onEnvironmentChange}
        />
        <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <BotRuntimeAvatar
            type={applicationType}
            avatarUrl={runtime?.avatarUrl || "/brand/telegram-system.png"}
          />
          <div className="min-w-0">
            <p className="font-medium text-white">
              {runtime?.name || runtime?.username}
            </p>
            <p className="text-xs text-neutral-500">
              @{runtime?.username?.replace(/^@/, "")}
            </p>
          </div>
        </div>
        <p className="text-xs text-neutral-500">
          Username and token are managed by the environment and cannot be
          changed here.
        </p>
        <FormField label="Bot name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={runtime?.name || "Nexeloq"}
            maxLength={64}
          />
        </FormField>
        <FormField label="Description">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={runtime?.description || "Describe this bot"}
            maxLength={512}
          />
        </FormField>
        <div
          className={
            applicationType === "FINANCE" ? "grid gap-3 lg:grid-cols-2" : ""
          }
        >
          <ImageUploadField
            label={applicationType === "FINANCE" ? "Favicon" : "Bot logo"}
            description={
              applicationType === "FINANCE"
                ? "Browser, PWA and Telegram icon. A white background is added automatically."
                : "PNG, JPEG, or WebP up to 5 MB"
            }
            value={applicationType === "FINANCE" ? favicon : avatar}
            existingImageUrl={
              applicationType === "FINANCE" ? runtime?.faviconUrl : undefined
            }
            disabled={saving}
            onChange={applicationType === "FINANCE" ? setFavicon : setAvatar}
          />
          {applicationType === "FINANCE" ? (
            <>
              <ImageUploadField
                label="Favicon light"
                description="Alternative icon for the other color theme. PNG, JPEG, or WebP up to 5 MB."
                value={faviconLight}
                existingImageUrl={runtime?.faviconLightUrl}
                disabled={saving}
                onChange={setFaviconLight}
              />
            </>
          ) : null}
        </div>
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          {applicationType === "FINANCE"
            ? "Each environment has two icons. Saving Favicon also updates the Telegram bot photo with a white background."
            : "Saving applies these changes to Telegram immediately."}
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              saving ||
              (!avatar &&
                !favicon &&
                !faviconLight &&
                name.trim() === (runtime?.name ?? "").trim() &&
                description === (runtime?.description ?? ""))
            }
          >
            {saving ? "Saving" : "Save bot"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ImageUploadField({
  label,
  description,
  value,
  existingImageUrl,
  disabled,
  accept = "image/png,image/jpeg,image/webp",
  onChange,
}: {
  label: string;
  description: string;
  value?: File;
  existingImageUrl?: string | null;
  disabled: boolean;
  accept?: string;
  onChange: (file?: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(
    null,
  );
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );
  const setImage = (files: FileList | File[]) => {
    const file = Array.from(files).find((item) =>
      item.type.startsWith("image/"),
    );
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = file ? URL.createObjectURL(file) : null;
    setPreview(
      file && previewUrlRef.current
        ? { name: file.name, url: previewUrlRef.current }
        : null,
    );
    onChange(file);
  };
  const savedAssetUrl = existingImageUrl
    ? api.getUri({ url: existingImageUrl })
    : null;
  const displayedPreview = preview ??
    (savedAssetUrl ? { name: "Saved image", url: savedAssetUrl } : null);

  return (
    <FormField label={label}>
      <div
        role="region"
        aria-label={`${label} drop and paste area`}
        tabIndex={disabled ? -1 : 0}
        className={`relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border px-4 py-5 text-center transition ${displayedPreview ? "border-neutral-700 bg-neutral-950/40" : "border-dashed"} ${dragging ? "border-blue-500 bg-blue-950/30 text-white" : "border-neutral-700 text-neutral-300 hover:border-blue-600"}`}
        onPaste={(event) => {
          const files = event.clipboardData.files;
          if (files.length) {
            event.preventDefault();
            setImage(files);
          }
        }}
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          setImage(event.dataTransfer.files);
        }}
      >
        {displayedPreview ? (
          <div className="flex max-w-full items-center gap-3 text-left">
            {/* eslint-disable-next-line @next/next/no-img-element -- Blob URL preview for saved or selected uploads. */}
            <img
              src={displayedPreview.url}
              alt={`${label} preview`}
              className="h-14 w-14 shrink-0 rounded-lg border border-neutral-700 bg-white object-contain p-1"
              loading="eager"
              decoding="async"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-neutral-100">
                {displayedPreview.name}
              </span>
              <span className="block text-xs text-neutral-500">
                {preview ? "New image selected" : "Currently saved"}
              </span>
            </span>
            {preview ? (
              <button
                type="button"
                disabled={disabled}
                aria-label={`Cancel ${label.toLowerCase()} replacement`}
                onClick={() => setImage([])}
                className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
              >
                <X size={16} />
              </button>
            ) : null}
          </div>
        ) : (
          <span className="inline-flex items-center gap-2 text-sm font-medium">
            {disabled ? (
              <LoaderCircle className="animate-spin" size={18} />
            ) : (
              <FileUp size={18} />
            )}
            {value?.name ?? `Drop or paste a ${label.toLowerCase()}`}
          </span>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-blue-500/70 bg-blue-600/15 px-4 text-sm font-medium text-blue-200 transition hover:bg-blue-600/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
        >
          <Upload size={14} />{" "}
          {displayedPreview ? "Replace image" : "Choose file"}
        </button>
        <span className="text-xs text-neutral-500">{description}</span>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept={accept}
          onChange={(event) => {
            if (event.target.files) setImage(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
    </FormField>
  );
}
