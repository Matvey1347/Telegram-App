"use client";

import { useRef, useState } from "react";
import { FileUp, LoaderCircle, Upload } from "lucide-react";
import { Button, FormField, Input, Modal, Textarea } from "@/components/ui/primitives";
import { BotRuntimeEnvironmentTabs } from "./bot-runtime-environment-tabs";
import { BotRuntimeAvatar } from "./bot-runtime-avatar";

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
  }>;
  environment: "LOCAL" | "PRODUCTION";
  saving: boolean;
  onClose: () => void;
  onEnvironmentChange: (environment: "LOCAL" | "PRODUCTION") => void;
  onSubmit: (input: { name?: string; description?: string; avatar?: File }) => void;
}) {
  const runtime = runtimes.find((item) => item.environment === environment) ?? null;
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(() => runtime?.name ?? "");
  const [description, setDescription] = useState(() => runtime?.description ?? "");
  const [avatar, setAvatar] = useState<File>();
  const [dragging, setDragging] = useState(false);
  const submit = () => {
    onSubmit({
      name: name.trim() !== (runtime?.name ?? "").trim() ? name.trim() : undefined,
      description: description !== (runtime?.description ?? "") ? description.trim() : undefined,
      avatar,
    });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit bot"
    >
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
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
            <p className="font-medium text-white">{runtime?.name || runtime?.username}</p>
            <p className="text-xs text-neutral-500">@{runtime?.username?.replace(/^@/, "")}</p>
          </div>
        </div>
        <p className="text-xs text-neutral-500">Username and token are managed by the environment and cannot be changed here.</p>
        <FormField label="Bot name">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={runtime?.name || "Nexeloq"} maxLength={64} />
        </FormField>
        <FormField label="Description">
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={runtime?.description || "Describe this bot"} maxLength={512} />
        </FormField>
        <FormField label="Logo">
          <div
            role="region"
            aria-label="Bot logo drop and paste area"
            tabIndex={saving ? -1 : 0}
            className={`flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center transition ${
              dragging ? "border-blue-500 bg-blue-950/30 text-white" : "border-neutral-700 text-neutral-300 hover:border-blue-600"
            }`}
            onPaste={(event) => {
              const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
              if (file) { event.preventDefault(); setAvatar(file); }
            }}
            onDragEnter={() => setDragging(true)}
            onDragLeave={() => setDragging(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              setAvatar(Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/")));
            }}
          >
            <span className="inline-flex items-center gap-2 text-sm font-medium">
              {saving ? <LoaderCircle className="animate-spin" size={18} /> : <FileUp size={18} />}
              {avatar ? avatar.name : "Drop or paste a bot logo"}
            </span>
            <button type="button" disabled={saving} onClick={() => inputRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-blue-500/70 bg-blue-600/15 px-4 text-sm font-medium text-blue-200 transition hover:bg-blue-600/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50">
              <Upload size={14} /> Choose file
            </button>
            <span className="text-xs text-neutral-500">PNG, JPEG, or WebP up to 5 MB</span>
            <input ref={inputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { setAvatar(event.target.files?.[0]); event.target.value = ""; }} />
          </div>
        </FormField>
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          Saving applies these changes to Telegram immediately.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || (!avatar && name.trim() === (runtime?.name ?? "").trim() && description === (runtime?.description ?? ""))}>{saving ? "Saving" : "Save bot"}</Button>
        </div>
      </form>
    </Modal>
  );
}
