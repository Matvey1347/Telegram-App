"use client";

import type { ReactNode } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/primitives";

/** Formatting, emoji and upload controls are adapter-owned editor slots. */
export function MessageComposer({ children, onSubmit, disabled = false, sending = false, canSend = true, footer }: {
  children: ReactNode;
  onSubmit: () => void;
  disabled?: boolean;
  sending?: boolean;
  canSend?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div className="shrink-0 border-t border-neutral-800 bg-neutral-900/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:px-5">
      {children}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-neutral-400 [&_button]:min-h-10">{footer}</div>
        {canSend ? <Button className="min-h-10" onClick={onSubmit} disabled={disabled || sending} aria-label="Send message"><Send size={16} aria-hidden />{sending ? "Sending…" : "Send"}</Button> : null}
      </div>
    </div>
  );
}
