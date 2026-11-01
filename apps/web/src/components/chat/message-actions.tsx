"use client";

import { useRef, useState } from "react";
import { Copy, Forward, Heart, Pencil, Reply, Trash2 } from "lucide-react";
import { ActionMenu, ActionMenuItem } from "@/components/ui/action-menu";
import type { ChatCapabilities, ChatMessage, ChatMessageActions } from "./types";

export function MessageActions({ message, capabilities, actions, open, onOpenChange }: {
  message: ChatMessage;
  capabilities: ChatCapabilities;
  actions?: ChatMessageActions;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [copyError, setCopyError] = useState(false);
  const [above, setAbove] = useState(false);
  const own = message.direction === "outgoing";
  const actionable = !message.deleted && message.status !== "sending" && message.status !== "failed";
  const allowed = Object.fromEntries(Object.entries(capabilities).map(([key, enabled]) => [key, enabled && message.actionCapabilities?.[key as keyof NonNullable<ChatMessage["actionCapabilities"]>] !== false])) as ChatCapabilities;
  const copy = async () => {
    try {
      if (actions?.onCopy) await actions.onCopy(message);
      else await navigator.clipboard.writeText(message.text);
      setCopyError(false);
    } catch { setCopyError(true); }
  };
  if (message.deleted) return null;
  return (
    <div ref={rootRef} className="shrink-0">
      <ActionMenu label="Message actions" open={open} onOpenChange={(next) => {
        if (next) {
          const rect = rootRef.current?.getBoundingClientRect();
          const history = rootRef.current?.closest('[aria-label="Message history"]')?.getBoundingClientRect();
          if (rect && history) setAbove(history.bottom - rect.bottom < 260 && rect.top - history.top > history.bottom - rect.bottom);
        }
        onOpenChange?.(next);
      }} menuClassName={`absolute right-0 ${above ? "bottom-10" : "top-10"} z-20 max-h-[min(18rem,calc(100dvh-5rem))] w-44 max-w-[calc(100vw-3rem)] overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-950 p-1.5 shadow-xl [&_button]:min-h-10`}>
        <ActionMenuItem icon={<Copy size={16} aria-hidden />} onClick={() => { void copy(); }}>Copy text</ActionMenuItem>
        {actionable && allowed.canReply && actions?.onReply ? <ActionMenuItem icon={<Reply size={16} aria-hidden />} onClick={() => actions.onReply?.(message)}>Reply</ActionMenuItem> : null}
        {actionable && own && allowed.canEdit && actions?.onEdit ? <ActionMenuItem icon={<Pencil size={16} aria-hidden />} onClick={() => actions.onEdit?.(message)}>Edit</ActionMenuItem> : null}
        {actionable && (own || message.actionCapabilities?.canDelete === true) && allowed.canDelete && actions?.onDelete ? <ActionMenuItem danger icon={<Trash2 size={16} aria-hidden />} onClick={() => actions.onDelete?.(message)}>Delete</ActionMenuItem> : null}
        {actionable && allowed.canReact && actions?.onReact ? <ActionMenuItem icon={<Heart size={16} aria-hidden />} onClick={() => actions.onReact?.(message)}>React</ActionMenuItem> : null}
        {actionable && allowed.canForward && actions?.onForward ? <ActionMenuItem icon={<Forward size={16} aria-hidden />} onClick={() => actions.onForward?.(message)}>Forward</ActionMenuItem> : null}
      </ActionMenu>
      {copyError ? <span role="alert" className="block max-w-28 text-[10px] text-rose-300">Could not copy. Select the text to copy it.</span> : null}
    </div>
  );
}
