"use client";

import type { ReactNode } from "react";
import { Bot, ChevronUp, PencilLine } from "lucide-react";
import { Button, FormError } from "@/components/ui/primitives";

export function PromoPostEditorSection({
  expanded,
  hasContent,
  connected,
  connectionLoading,
  importStatus,
  dots,
  error,
  onImport,
  onToggleEditor,
  children,
}: {
  expanded: boolean;
  hasContent: boolean;
  connected: boolean;
  connectionLoading: boolean;
  importStatus: "idle" | "working" | "waiting" | "done";
  dots: number;
  error?: string;
  onImport: () => void;
  onToggleEditor: () => void;
  children: ReactNode;
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
              {importStatus === "working"
                ? `Preparing the bot${".".repeat(dots)}`
                : importStatus === "waiting"
                  ? `Waiting for your forwarded post${".".repeat(dots)}`
                  : hasContent
                    ? "Edit the current post manually or replace it with one forwarded through the bot."
                    : "Edit the post manually or forward an existing Telegram post through the bot."}
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
            onClick={onImport}
          >
            <Bot size={15} />
            {importStatus === "working"
              ? `Preparing${".".repeat(dots)}`
              : importStatus === "waiting"
                ? "Waiting for bot…"
                : importStatus === "done"
                  ? "✅ Imported from bot"
                  : error
                    ? "Try again"
                    : "Import from bot"}
          </Button>
          <Button
            type="button"
            className="h-8 px-3 text-xs"
            aria-expanded={expanded}
            onClick={onToggleEditor}
          >
            {expanded ? <ChevronUp size={15} /> : <PencilLine size={15} />}
            {expanded
              ? "Hide editor"
              : hasContent
                ? "✅ Edit manually"
                : "Edit manually"}
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
      {expanded ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}
