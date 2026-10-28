"use client";

import { useState } from "react";
import { Button, FormField, Input, Modal, Textarea } from "@/components/ui/primitives";
import { BotRuntimeEnvironmentTabs } from "./bot-runtime-environment-tabs";
import { BotRuntimeAvatar } from "./bot-runtime-avatar";

export function ConfiguredSystemBotProfileModal({
  open, applicationType, runtimes, environment, saving, onClose, onEnvironmentChange, onSubmit,
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
  onSubmit: (input: { name?: string; description?: string }) => void;
}) {
  const runtime = runtimes.find((item) => item.environment === environment) ?? null;
  const [name, setName] = useState(() => runtime?.name ?? "");
  const [description, setDescription] = useState(() => runtime?.description ?? "");
  const nameChanged = name.trim() !== (runtime?.name ?? "").trim();
  const descriptionChanged = description !== (runtime?.description ?? "");
  return (
    <Modal open={open} onClose={onClose} title="Edit bot" size="md">
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          name: nameChanged ? name.trim() : undefined,
          description: descriptionChanged ? description.trim() : undefined,
        });
      }}>
        <BotRuntimeEnvironmentTabs
          environment={environment}
          availableEnvironments={runtimes.map((item) => item.environment)}
          onChange={onEnvironmentChange}
        />
        <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <BotRuntimeAvatar type={applicationType} avatarUrl={runtime?.avatarUrl || (applicationType === "FINANCE" ? "/brand/groshly-icon.png" : "/brand/telegram-system.png")} />
          <div className="min-w-0">
            <p className="font-medium text-white">{runtime?.name || runtime?.username}</p>
            <p className="text-xs text-neutral-500">@{runtime?.username?.replace(/^@/, "")}</p>
          </div>
        </div>
        <p className="text-xs text-neutral-500">Username and token are managed by the environment. The bot logo is set automatically from project assets at startup.</p>
        <FormField label="Bot name">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={runtime?.name || "Bot"} maxLength={64} />
        </FormField>
        <FormField label="Description">
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={runtime?.description || "Describe this bot"} maxLength={512} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || (!nameChanged && !descriptionChanged)}>{saving ? "Saving" : "Save bot"}</Button>
        </div>
      </form>
    </Modal>
  );
}
