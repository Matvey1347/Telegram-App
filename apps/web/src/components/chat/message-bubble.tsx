import { Check, CheckCheck, Clock3, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { AttachmentPreview } from "./attachment-preview";
import { MessageActions } from "./message-actions";
import type { ChatCapabilities, ChatMessage, ChatMessageActions } from "./types";

const statusIcons = { sending: Clock3, sent: Check, delivered: CheckCheck, read: CheckCheck, failed: TriangleAlert, unknown: null };

export function MessageBubble({ message, capabilities, actions, onRetry, actionsOpen, onActionsOpenChange }: {
  message: ChatMessage;
  capabilities: ChatCapabilities;
  actions?: ChatMessageActions;
  onRetry?: () => void;
  actionsOpen?: boolean;
  onActionsOpenChange?: (open: boolean) => void;
}) {
  const outgoing = message.direction === "outgoing";
  const StatusIcon = message.status ? statusIcons[message.status] : null;
  const date = new Date(message.sentAt);
  const validDate = !Number.isNaN(date.getTime());
  return (
    <li data-message-id={message.id} className={`flex min-w-0 ${outgoing ? "justify-end" : "justify-start"}`}>
      <article onContextMenu={(event) => { if (!message.deleted) { event.preventDefault(); onActionsOpenChange?.(true); } }} aria-label={outgoing ? "Outgoing message" : "Incoming message"} className={`relative w-fit min-w-[9rem] max-w-[89%] rounded-2xl border py-2 pl-3 pr-10 md:max-w-[80%] ${outgoing ? "rounded-br-sm border-emerald-800/70 bg-emerald-950/70" : "rounded-bl-sm border-slate-700/70 bg-slate-800"}`}>
        <div className="absolute right-1 top-1">
          <MessageActions message={message} capabilities={capabilities} actions={actions} open={actionsOpen} onOpenChange={onActionsOpenChange} />
        </div>
        {message.forwarded ? <p className="mb-1 text-xs text-blue-200">Forwarded {message.forwarded}</p> : null}
        {message.replyTo ? <blockquote className="mb-2 min-w-0 border-l-2 border-blue-400 pl-2 text-xs text-blue-200"><span className="block font-medium">{message.replyTo.author}</span><button type="button" disabled={!actions?.onJumpToReply} onClick={() => actions?.onJumpToReply?.(message.replyTo!.id)} className="line-clamp-3 break-words text-left [overflow-wrap:anywhere]">{message.replyTo.text}</button></blockquote> : null}
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-100 [overflow-wrap:anywhere]">{message.deleted ? "Message deleted" : message.content ?? (message.text || (!message.attachments?.length ? "Unsupported message" : ""))}</div>
        {!message.deleted && message.attachments?.map((attachment) => <AttachmentPreview key={attachment.id} attachment={attachment} />)}
        {!message.deleted && message.reactions?.length ? <div className="mt-2 flex flex-wrap gap-1">{message.reactions.map((reaction) => <button type="button" key={reaction.emoji} disabled={!capabilities.canReact || !actions?.onReact} onClick={() => actions?.onReact?.(message)} className={`min-h-8 rounded-full px-2 py-0.5 text-xs ${reaction.chosen ? "bg-blue-800" : "bg-white/10"}`} aria-label={`${reaction.emoji}: ${reaction.count}${reaction.chosen ? ", your reaction" : ""}`}>{reaction.emoji} {reaction.count}</button>)}</div> : null}
        <footer className="clear-both mt-1 flex flex-wrap items-center justify-end gap-1 text-[10px] text-neutral-300">
          {message.editedAt && !message.deleted ? <span>Edited ·</span> : null}
          <time dateTime={message.sentAt} title={validDate ? date.toLocaleString() : undefined}>{validDate ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : ""}</time>
          {outgoing && StatusIcon && !message.deleted ? <span aria-label={message.status}><StatusIcon size={13} aria-hidden /></span> : null}
          {message.status === "failed" && !message.deleted ? <span className="text-rose-300">Send failed</span> : null}
        </footer>
        {onRetry ? <Button variant="secondary" className="mt-2" onClick={onRetry}>Retry send</Button> : null}
      </article>
    </li>
  );
}
