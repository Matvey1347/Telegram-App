"use client";

import type { ReactNode } from "react";
import { Server, Trash2 } from "lucide-react";
import type { TelegramBotRuntimeEnvironment } from "@telegram-system/shared";
import { Button, Modal, Tooltip } from "@/components/ui/primitives";
import type { BotDeleteChoice } from "./telegram-bot-action-modals";

export function TelegramBotRuntimeDeletionModal({
  choice,
  onClose,
  onDeleteRuntime,
  onDeleteBot,
}: {
  choice: BotDeleteChoice;
  onClose: () => void;
  onDeleteRuntime: (environment: TelegramBotRuntimeEnvironment) => void;
  onDeleteBot: () => void;
}) {
  const local = choice.bot.runtimes.some(
    (item) => item.environment === "LOCAL",
  );
  const production = choice.bot.runtimes.some(
    (item) => item.environment === "PRODUCTION",
  );
  const selected = choice.environment === "LOCAL" ? "Local" : "Production";
  return (
    <Modal open onClose={onClose} title="Delete bot data">
      <p className="text-sm text-neutral-300">
        You selected <span className="font-medium text-white">{selected}</span>.
        Runtime deletion removes its token and webhook state only.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <DeleteAction
          label="Delete Local runtime"
          disabled={!local}
          onClick={() => onDeleteRuntime("LOCAL")}
        >
          <Server size={17} />
        </DeleteAction>
        <DeleteAction
          label="Delete Production runtime"
          disabled={!production}
          onClick={() => onDeleteRuntime("PRODUCTION")}
        >
          <Server size={17} />
        </DeleteAction>
        <DeleteAction
          label="Delete bot from system"
          tone="danger"
          disabled={false}
          onClick={onDeleteBot}
        >
          <Trash2 size={17} />
        </DeleteAction>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}

function DeleteAction({
  children,
  label,
  tone = "neutral",
  disabled,
  onClick,
}: {
  children: ReactNode;
  label: string;
  tone?: "neutral" | "danger";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 ${tone === "danger" ? "border-rose-800/80 bg-rose-950/30 text-rose-300 hover:bg-rose-950/60" : "border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}
