"use client";

import { useState } from "react";
import type { TelegramBotRuntimeEnvironment } from "@telegram-system/shared";
import type { TelegramBot } from "@/lib/api";
import { Button, FormField, Input, Modal } from "@/components/ui/primitives";

export function RuntimeProfileModal({
  config,
  saving,
  onClose,
  onSubmit,
}: {
  config: { bot: TelegramBot; environment: TelegramBotRuntimeEnvironment } | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: { name?: string; avatar?: File }) => void;
}) {
  const runtime = config?.bot.runtimes.find(
    (item) => item.environment === config.environment,
  );
  const fallbackAvatar =
    config?.bot.applicationType === "FINANCE"
      ? "/brand/finance.png"
      : "/brand/telegram-system.png";
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<File>();
  const [confirmed, setConfirmed] = useState(false);

  return (
    <Modal
      open={Boolean(config)}
      onClose={onClose}
      title={`Edit ${config?.environment === "LOCAL" ? "local" : "production"} Telegram profile`}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ name: name.trim() || undefined, avatar });
        }}
      >
        <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <img
            src={runtime?.avatarUrl || fallbackAvatar}
            alt="Current Telegram bot profile"
            className="h-14 w-14 rounded-full object-cover"
          />
          <div className="min-w-0">
            <p className="truncate font-medium text-white">
              {runtime?.firstName || config?.bot.label}
            </p>
            <p className="text-xs text-neutral-400">
              Current values pulled from Telegram for this runtime.
            </p>
          </div>
        </div>
        <FormField label="New Telegram bot name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={runtime?.firstName || "Finance Bot"}
            maxLength={64}
          />
        </FormField>
        <FormField label="New Telegram profile photo">
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setAvatar(event.target.files?.[0])}
          />
        </FormField>
        <label className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            I understand that saving here immediately changes the bot name and/or
            profile photo in Telegram for the selected token.
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={saving || !confirmed || (!name.trim() && !avatar)}
          >
            {saving ? "Updating Telegram" : "Update Telegram profile"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
