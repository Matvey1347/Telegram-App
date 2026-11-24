"use client";

import { useState, type ReactNode } from "react";
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ArrowLeft, Check, RotateCcw, X } from "lucide-react";
import type { SupportMessage, SupportThreadPage, SupportTicket } from "@telegram-system/shared";
import { ChatThread } from "@/components/chat/chat-thread";
import type { ChatMessage } from "@/components/chat/types";
import { CrmMessageComposer } from "@/components/features/growth/ad-sales/crm/crm-message-composer";
import { Button, Modal, Textarea } from "@/components/ui/primitives";
import { supportKeys, telegramSupportApi } from "@/lib/features/telegram/telegram-support-api";
import { renderTelegramPreviewInlineMarkup } from "../telegram/telegram-post-preview-markup";

import { SupportParticipantAvatar } from "./support-participant-avatar";

const deliveryStatus: Record<string, ChatMessage["status"]> = {
  SENT: "sent", SENDING: "sending", FAILED: "failed", UNKNOWN: "unknown",
};

const deliveryLabels: Record<string, string> = {
  SENDING: "Sending…", SENT: "Sent", FAILED: "Send failed",
};

function messageAuthor(message: SupportMessage, ticket: SupportTicket) {
  return message.status === "INBOUND" ? ticket.senderName : "Support";
}

function toChatMessage(message: SupportMessage, quoted: SupportMessage | undefined, ticket: SupportTicket): ChatMessage {
  return {
    id: message.id,
    text: message.text,
    sentAt: message.createdAt,
    direction: message.status === "INBOUND" ? "incoming" : "outgoing",
    status: deliveryStatus[message.status],
    editedAt: message.editedAt,
    deleted: Boolean(message.deletedAt),
    deliveryLabel: deliveryLabels[message.status],
    replyTo: message.replyToTelegramId ? {
      id: quoted?.id ?? `telegram:${message.replyToTelegramId}`,
      text: quoted?.deletedAt ? "Message deleted" : quoted?.text ?? "Earlier Telegram message",
      author: quoted ? messageAuthor(quoted, ticket) : undefined,
    } : undefined,
    reactions: message.reactions?.map((emoji) => ({ emoji, count: 1 })),
    actionCapabilities: {
      canReply: Boolean(message.telegramMessageId),
      canEdit: Boolean(message.telegramMessageId && message.status === "SENT" && !message.automatic),
      canDelete: Boolean(message.telegramMessageId && Date.now() - Date.parse(message.createdAt) < 48 * 60 * 60_000),
    },
    content: message.formatted
      ? <span dangerouslySetInnerHTML={{ __html: renderTelegramPreviewInlineMarkup(message.text) }} />
      : undefined,
    caption: message.automatic
      ? <p className="mb-1 text-xs font-semibold text-emerald-200">{message.legacy ? "Automatic reply · archived" : "Automatic reply"}</p>
      : undefined,
    notice: message.status === "UNKNOWN" && !message.legacy
      ? <p className="mt-1 text-xs text-amber-200">Delivery unconfirmed</p>
      : undefined,
  };
}

export function SupportThread({ ticket, productBadge, onBack, onReopen }: {
  ticket: SupportTicket;
  productBadge: ReactNode;
  onBack: () => void;
  onReopen: (id: string) => void;
}) {
  const client = useQueryClient();
  const [replyTarget, setReplyTarget] = useState<SupportMessage>();
  const [pending, setPending] = useState<SupportMessage>();
  const [action, setAction] = useState<{ kind: "edit" | "delete"; message: ChatMessage; text: string }>();
  const threadKey = supportKeys.thread(ticket.id);
  const thread = useInfiniteQuery({
    queryKey: threadKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => telegramSupportApi.thread(ticket.id, pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const invalidate = () => client.invalidateQueries({ queryKey: supportKeys.root });
  const reply = useMutation({
    mutationFn: ({ id, text, targetId }: { id: string; text: string; targetId?: string }) =>
      targetId ? telegramSupportApi.reply(ticket.id, id, text, targetId) : telegramSupportApi.reply(ticket.id, id, text),
  });
  const change = useMutation({
    mutationFn: (current: NonNullable<typeof action>) => current.kind === "edit"
      ? telegramSupportApi.editMessage(ticket.id, current.message.id, current.text.trim())
      : telegramSupportApi.deleteMessage(ticket.id, current.message.id),
    onSuccess: (message) => {
      client.setQueryData<InfiniteData<SupportThreadPage>>(threadKey, (data) => data && ({
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.map((item) => item.id === message.id ? message : item),
        })),
      }));
      if (message.deletedAt) setReplyTarget((current) => current?.id === message.id ? undefined : current);
      setAction(undefined);
      void invalidate();
    },
  });
  const close = useMutation({
    mutationFn: () => telegramSupportApi.close(ticket.id),
    onSuccess: invalidate,
  });
  const reopen = useMutation({
    mutationFn: () => telegramSupportApi.reopen(ticket.id),
    onSuccess: async ({ id }) => {
      await invalidate();
      onReopen(id);
    },
  });
  const lastInboundAt = thread.data?.pages[0]?.lastInboundAt;
  const canSend = !ticket.closedAt;
  const history = (thread.data?.pages.flatMap((page) => page.items) ?? []).toReversed();
  const messages = pending && !history.some((message) => message.replyId === pending.replyId)
    ? [...history, pending]
    : history;
  const byTelegramId = new Map(history.map((message) => [message.telegramMessageId, message]));
  const showAction = (kind: "edit" | "delete", message: ChatMessage) => {
    change.reset();
    setAction({ kind, message, text: message.text });
  };
  const send = async (text: string, id: string) => {
    const value = text.trim();
    setPending({ id, replyId: id, text: value, status: "SENDING", formatted: true,
      createdAt: new Date().toISOString(), replyToTelegramId: replyTarget?.telegramMessageId });
    try {
      const message = await reply.mutateAsync({ id, text: value, targetId: replyTarget?.id });
      client.setQueryData<InfiniteData<SupportThreadPage>>(threadKey, (data) => data && ({
        ...data,
        pages: data.pages.map((page, index) => !index && !data.pages.some((entry) => entry.items.some((item) => item.id === message.id))
          ? { ...page, items: [message, ...page.items] } : page),
      }));
      void invalidate();
      if (message.status !== "SENT" && message.status !== "UNKNOWN") return false;
      setReplyTarget(undefined);
      return true;
    } catch {
      return false;
    } finally {
      setPending(undefined);
    }
  };
  return (
    <>
    <ChatThread
      threadId={ticket.id}
      messages={messages.map((message) => toChatMessage(message, message.replyToTelegramId ? byTelegramId.get(message.replyToTelegramId) : undefined, ticket))}
      actions={{
        onReply: ({ id }) => setReplyTarget(history.find((message) => message.id === id)),
        onEdit: (message) => showAction("edit", message),
        onDelete: (message) => showAction("delete", message),
      }}
      capabilities={{
        canSend, canFormatText: canSend, canReply: canSend && !reply.isPending, canEdit: true,
        canDelete: true, canReact: false, canForward: false, canUpload: false, canSendVoice: false,
      }}
      loading={thread.isPending}
      error={thread.isError}
      onRetry={() => void thread.refetch()}
      hasOlder={thread.hasNextPage}
      loadingOlder={thread.isFetchingNextPage}
      onLoadOlder={() => void thread.fetchNextPage()}
      header={<>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="secondary" aria-label="Back to tickets" onClick={onBack}><ArrowLeft size={16} aria-hidden /></Button>
            <SupportParticipantAvatar ticket={ticket} kind="sender" label={ticket.senderName} size="md" />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-white">{ticket.senderName}</h2>
              {ticket.username && <p className="truncate text-xs text-neutral-400">@{ticket.username}</p>}
            </div>
            {productBadge}
          </div>
          {canSend ? <Button variant="secondary" disabled={close.isPending || reply.isPending} onClick={() => close.mutate()}>
            <Check size={16} aria-hidden /> Close ticket
          </Button> : <Button variant="secondary" disabled={reopen.isPending} onClick={() => reopen.mutate()}>
            <RotateCcw size={16} aria-hidden /> Reopen ticket
          </Button>}
        </div>
        {lastInboundAt && <p className="mt-1 text-xs text-neutral-400">
          Last message from user · <time dateTime={lastInboundAt}>{new Date(lastInboundAt).toLocaleString()}</time>
        </p>}
        {reopen.isError && <p role="alert" className="mt-2 text-sm text-rose-300">Could not reopen this ticket.</p>}
        {close.isError && <p role="alert" className="mt-2 text-sm text-rose-300">Could not close this ticket.</p>}
      </>}
      composer={canSend && <>
        {reply.isError && <p role="alert" className="px-3 py-2 text-sm text-rose-300">Could not confirm the reply. Retry to check the same send.</p>}
        {reply.data?.status === "FAILED" && <p role="alert" className="px-3 py-2 text-sm text-rose-300">Telegram rejected the reply. Edit the draft before sending again.</p>}
        <CrmMessageComposer
          workspaceId={ticket.workspaceId}
          conversationId={`support:${ticket.id}`}
          sending={reply.isPending}
          disabled={close.isPending}
          alwaysShowSend
          context={replyTarget && <div className="mb-2 flex items-center justify-between gap-2 border-l-2 border-blue-500 px-2 text-sm">
            <div className="min-w-0">
              <span className="text-blue-200">Replying to {messageAuthor(replyTarget, ticket)}</span>
              <p className="truncate text-neutral-300">{replyTarget.text}</p>
            </div>
            <Button variant="secondary" aria-label="Cancel reply" disabled={reply.isPending} onClick={() => setReplyTarget(undefined)}>
              <X size={16} aria-hidden />
            </Button>
          </div>}
          onSend={send}
        />
      </>}
    />
    <Modal open={Boolean(action)} onClose={() => { if (!change.isPending) setAction(undefined); }}
      title={action?.kind === "delete" ? "Delete message?" : "Edit message"} size="sm">
      {action?.kind === "delete"
        ? <p className="text-sm text-neutral-300">The message will be deleted from the Telegram conversation.</p>
        : <Textarea aria-label="Edit message text" value={action?.text ?? ""} maxLength={4096} rows={4} disabled={change.isPending}
            onChange={(event) => setAction((current) => current && { ...current, text: event.target.value })} />}
      {change.isError && <p role="alert" className="mt-2 text-sm text-rose-300">Telegram did not confirm the change. Try again.</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" disabled={change.isPending} onClick={() => setAction(undefined)}>Cancel</Button>
        <Button variant={action?.kind === "delete" ? "danger" : undefined}
          disabled={!action || change.isPending || (action.kind === "edit" && !action.text.trim())}
          onClick={() => { if (action) change.mutate(action); }}>
          {action?.kind === "delete" ? "Delete message" : "Save changes"}
        </Button>
      </div>
    </Modal>
    </>
  );
}
