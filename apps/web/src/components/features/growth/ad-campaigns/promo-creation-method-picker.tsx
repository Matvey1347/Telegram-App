"use client";

import { Bot, PencilLine } from "lucide-react";
import { Button, FormError } from "@/components/ui/primitives";

export type PromoCreationMethod = "choose" | "bot" | "manual";

export function PromoCreationMethodPicker({
  mode,
  connected,
  connectionLoading,
  importStatus,
  dots,
  error,
  onChooseBot,
  onChooseManual,
}: {
  mode: Exclude<PromoCreationMethod, "manual">;
  connected: boolean;
  connectionLoading: boolean;
  importStatus: "idle" | "working" | "waiting" | "done";
  dots: number;
  error?: string;
  onChooseBot: () => void;
  onChooseManual: () => void;
}) {
  return (
    <section
      aria-label="Promo post"
      className="rounded-xl border border-blue-900/70 bg-blue-950/20 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600/20 text-blue-300">
            <Bot size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-white">Promo post</h3>
            <p className="mt-0.5 text-xs text-neutral-400">
              {mode === "bot"
                ? importStatus === "working"
                  ? `Preparing the bot${".".repeat(dots)}`
                  : `Waiting for your forwarded post${".".repeat(dots)}`
                : "Forward a Telegram post through the bot or start with an empty editor."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-8 px-3 text-xs"
            disabled={
              !connected ||
              connectionLoading ||
              importStatus === "working" ||
              importStatus === "waiting"
            }
            onClick={onChooseBot}
          >
            <Bot size={15} />
            {importStatus === "working"
              ? `Preparing${".".repeat(dots)}`
              : importStatus === "waiting"
                ? "Waiting for bot…"
                : error
                  ? "Try again"
                  : "Import from bot"}
          </Button>
          <Button
            type="button"
            className="h-8 px-3 text-xs"
            onClick={onChooseManual}
          >
            <PencilLine size={15} /> Create manually
          </Button>
        </div>
      </div>
      {error ? (
        <div className="mt-3">
          <FormError message={error} />
        </div>
      ) : null}
      {!connectionLoading && !connected ? (
        <p className="mt-2 text-xs text-amber-300">
          Connect the workspace system bot to use post forwarding.
        </p>
      ) : null}
    </section>
  );
}
