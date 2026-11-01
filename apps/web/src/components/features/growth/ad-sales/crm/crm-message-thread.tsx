"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import type { CrmConversationListItem, CrmMessageListItem } from "@telegram-system/shared";
import { ChatThread } from "@/components/chat/chat-thread";
import { Button } from "@/components/ui/primitives";
import { crmChatCapabilities, toChatMessage } from "./crm-chat-adapter";
import {
  CrmMessageComposer,
  type CrmMessageComposerHandle,
} from "./crm-message-composer";
import { useCrmThread } from "./use-crm-thread";
import { CrmCopilot, type CrmCopilotHandle } from "./copilot/crm-copilot";
import { messageAiApproval } from "./crm-composer-draft";
import { CrmMessageActionDialog, type MessageActionSelection } from "./crm-message-action-dialog";
import { CrmChatMediaControls } from "./crm-chat-media-controls";
import { useCrmChatActions } from "./use-crm-chat-actions";
import type { ChatMessage } from "@/components/chat/types";
import { crmText } from "./crm-copy";

type ThreadProps = {
  conversation: CrmConversationListItem;
  canSendManual: boolean;
  sendDisabledReason?: string;
  header?: ReactNode;
};

/** Keyed session prevents state from following a rapid conversation switch. */
export function CrmMessageThread(props: ThreadProps) {
  return (
    <CrmThreadSession
      key={`${props.conversation.workspaceId}:${props.conversation.id}`}
      {...props}
    />
  );
}

function CrmThreadSession({
  conversation,
  canSendManual,
  sendDisabledReason,
  header,
}: ThreadProps) {
  const thread = useCrmThread(conversation);
  const messages = thread.messages;
  const originals = useMemo(() => {
    const index = new Map<number | string, CrmMessageListItem>();
    for (const message of messages) { index.set(message.id, message); if (message.telegramMessageIdNumeric != null) index.set(message.telegramMessageIdNumeric, message); }
    return index;
  }, [messages]);
  const copilot = useRef<CrmCopilotHandle>(null);
  const composer = useRef<CrmMessageComposerHandle>(null);
  const chat = useCrmChatActions(conversation.id, canSendManual);
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [selection, setSelection] = useState<MessageActionSelection | null>(null);
  const capabilities = crmChatCapabilities(canSendManual && !chat.blocked && !thread.unknownSend, chat.capabilities);
  const selectAction = (kind: MessageActionSelection["kind"], model: ChatMessage) => {
    const message = thread.messages.find((item) => item.id === model.id);
    if (message) setSelection({ kind, message });
  };
  return (
    <ChatThread
      threadId={conversation.id}
      messages={thread.messages.map((message) => toChatMessage(message, originals, conversation.lastReadOutboxTelegramMessageId))}
      actions={{ onReply: setReply, onEdit: (message) => selectAction("EDIT", message), onDelete: (message) => selectAction("DELETE", message), onReact: (message) => selectAction("REACTION", message), onForward: (message) => selectAction("FORWARD", message) }}
      capabilities={capabilities}
      header={
        <>
          {header}
          {thread.refreshRecent.isPending ? <p role="status" className="mt-1 text-xs text-neutral-400">Синхронизация сообщений…</p> : null}
          {thread.refreshRecent.error ? <div role="alert" className="mt-1 flex flex-wrap items-center gap-2 text-xs text-rose-300"><span>Не удалось обновить сообщения из Telegram.</span><Button variant="secondary" disabled={thread.importHistory.isPending} onClick={() => thread.refreshRecent.mutate()}>Повторить синхронизацию</Button></div> : null}
          {conversation.unreadCount > 0 ? (
            <div className="mt-1 flex justify-end">
              <Button
                variant="secondary"
                disabled={thread.markRead.isPending}
                onClick={() => thread.markRead.mutate()}
              >
                {thread.markRead.isPending ? "Marking…" : "Mark read"}
              </Button>
            </div>
          ) : null}
          {thread.markRead.error ? (
            <p role="alert" className="text-xs text-rose-300">
              Could not mark this conversation read. Try again.
            </p>
          ) : null}
        </>
      }
      loading={thread.query.isLoading}
      error={Boolean(thread.query.error)}
      onRetry={() => void thread.query.refetch()}
      emptyText={crmText("states.emptyConversation")}
      hasOlder={thread.hasOlder}
      loadingOlder={
        thread.query.isFetchingNextPage || thread.importHistory.isPending || thread.refreshRecent.isPending
      }
      onLoadOlder={() => void thread.loadOlder()}
      retryMessage={(message) => {
        const failed = thread.messages.find((item) => item.id === message.id);
        if (failed?.clientIdempotencyKey && failed.text) {
          const key = failed.clientIdempotencyKey;
          const draftSession = composer.current;
          void thread
            .sendText(
              failed.text,
              key,
              messageAiApproval(failed.contentMetadata),
              typeof failed.contentMetadata?.replyToMessageId === "string" ? failed.contentMetadata.replyToMessageId : undefined,
            )
            .then((sent) => {
              if (sent) draftSession?.clearSent(key);
            });
        }
      }}
      composer={
        <>
          {selection ? <CrmMessageActionDialog key={`${selection.kind}:${selection.message.id}`} selection={selection} accountId={conversation.mtprotoAccountId} capabilities={chat.capabilities} pending={chat.pending} blocked={chat.blocked} onExecute={chat.execute} onClose={() => setSelection(null)} /> : null}
          {chat.receipt ? <div role={chat.receipt.status === "CONFIRMED" ? "status" : "alert"} className="flex flex-wrap items-center gap-2 border-t border-neutral-800 px-3 py-2 text-xs">
            <span>{chat.receipt.status === "UNKNOWN" ? "Result unknown. Do not repeat the operation; check its result." : chat.receipt.status === "FAILED" ? `Operation failed: ${chat.receipt.errorCode ?? "Telegram rejected the action"}` : "Telegram confirmed the operation."}</span>
            {chat.receipt.status === "UNKNOWN" ? <Button variant="secondary" disabled={chat.pending} onClick={() => void chat.check()}>Check result</Button> : <Button variant="secondary" onClick={chat.dismiss}>Dismiss</Button>}
          </div> : null}
          {thread.unknownSend ? <div role="alert" className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs text-amber-300"><span>Send result is unknown. Do not resend the text. A missing receipt does not prove that Telegram rejected it.</span><Button variant="secondary" disabled={thread.checkSend.isPending} onClick={() => {
            const key = thread.send.variables?.key;
            void thread.checkSend.mutateAsync().then((result) => { if (result && key) composer.current?.clearSent(key); }).catch(() => undefined);
          }}>Check send result</Button><Button variant="secondary" disabled={thread.refreshRecent.isPending} onClick={() => void thread.refreshRecent.mutateAsync().catch(() => undefined)}>Refresh Telegram history</Button></div> : null}
          {reply ? <div className="flex items-center gap-2 border-t border-blue-800 px-3 py-2 text-xs text-blue-200"><span className="min-w-0 flex-1 truncate">Reply: {reply.text || "Attachment"}</span><Button variant="secondary" onClick={() => setReply(null)} disabled={thread.send.isPending}>Cancel reply</Button></div> : null}
          {thread.importHistory.error ? (
            <div role="alert" className="px-3 py-2 text-xs text-rose-300">
              Telegram history could not be loaded. Use Load older to retry.
            </div>
          ) : null}
          <CrmCopilot
            ref={copilot}
            workspaceId={conversation.workspaceId}
            conversationId={conversation.id}
            contactId={conversation.contactId}
            canSend={canSendManual}
            onInsert={(draft) => composer.current?.insertApproved(draft)}
          />
          {canSendManual ? (
            <CrmMessageComposer
              ref={composer}
              workspaceId={conversation.workspaceId}
              conversationId={conversation.id}
              disabled={!thread.query.isSuccess || chat.blocked || thread.unknownSend}
              sending={thread.send.isPending}
              onSend={async (text, key, ai) => {
                const sent = await thread.sendText(text, key, ai, reply?.id);
                if (sent) setReply(null);
                return sent;
              }}
              extraControls={<CrmChatMediaControls capabilities={chat.capabilities} disabled={chat.blocked || thread.send.isPending || thread.unknownSend || !thread.query.isSuccess} onUpload={async (body, signal) => {
                if (reply) body.set("replyToMessageId", reply.id);
                const sent = await chat.upload(body, signal);
                if (sent) setReply(null);
                return sent;
              }} />}
              onReviewAiEdit={(id, text) => copilot.current?.review(id, text)}
            />
          ) : (
            <p className="shrink-0 border-t border-neutral-800 p-3 text-xs text-neutral-400">
              {sendDisabledReason ||
                "You do not have permission to send manual CRM messages."}
            </p>
          )}
        </>
      }
    />
  );
}
