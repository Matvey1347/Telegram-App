"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Minus, X } from "lucide-react";
import { authApi, workspaceMembersApi } from "@/lib/api";
import { authKeys, memberKeys } from "@/lib/query-keys";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { Button, EmptyState } from "@/components/ui/primitives";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { crmPermissions } from "./crm-permissions";
import {
  CrmConversations,
  CrmConversationsSkeleton,
} from "./crm-conversations";
import type { CrmContactChatPreview } from "./crm-contact-chat-preview";

export function CrmChatWindow({
  contactId,
  chatContactIds,
  chatPreviews = {},
  onSelectChat,
  onMinimize,
  onClose,
  initialConversationId,
}: {
  contactId: string;
  chatContactIds: string[];
  chatPreviews?: Record<string, CrmContactChatPreview>;
  onSelectChat?: (contactId: string) => void;
  onMinimize?: () => void;
  onClose: () => void;
  initialConversationId?: string;
}) {
  const chatContext = useQuery({
    queryKey: telegramCrmKeys.chatContext(contactId),
    queryFn: ({ signal }) => telegramCrmApi.getChatContext(contactId, signal),
    retry: false,
    staleTime: 60_000,
  });
  const conversationParams = useMemo(
    () => ({ contactId, page: 1, pageSize: 50, state: "ACTIVE" as const }),
    [contactId],
  );
  useQuery({
    queryKey: telegramCrmKeys.conversationList(conversationParams),
    queryFn: ({ signal }) =>
      telegramCrmApi.listConversations(conversationParams, signal),
    staleTime: 30_000,
  });
  const me = useQuery({
    queryKey: authKeys.me(),
    queryFn: authApi.me,
    staleTime: 5 * 60_000,
  });
  const members = useQuery({
    queryKey: memberKeys.membersSelect(),
    queryFn: workspaceMembersApi.select,
    staleTime: 5 * 60_000,
  });
  const permissions = crmPermissions(me.data?.workspace.access);
  const currentMemberId = members.data?.find(
    (member) => member.isCurrentUser,
  )?.id;
  const visibleIds = chatContactIds.length ? chatContactIds : [contactId];
  const contact = chatContext.data;
  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Minimize chat"
        className="fixed inset-0 z-40 cursor-default bg-transparent"
        onClick={onMinimize}
      />
      <aside
        role="dialog"
        aria-modal="false"
        aria-label="Contact conversations"
        className="fixed bottom-4 right-4 z-50 flex h-[min(720px,calc(100dvh-2rem))] w-[min(640px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-950 shadow-2xl"
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-neutral-800 px-3 py-2">
          <nav
            className="flex min-w-0 flex-1 gap-2 overflow-x-auto"
            aria-label="Open chats"
          >
            {visibleIds.map((id) => (
              <CrmChatTab
                key={id}
                contactId={id}
                preview={chatPreviews[id]}
                active={id === contactId}
                onSelect={() => onSelectChat?.(id)}
              />
            ))}
          </nav>
          <button
            type="button"
            onClick={onMinimize}
            aria-label="Minimize chat"
            title="Minimize chat"
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <Minus size={18} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close current chat"
            title="Close current chat"
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden p-4">
          {chatContext.isLoading ? <CrmConversationsSkeleton /> : null}
          {chatContext.error || (!chatContext.isLoading && !contact) ? (
            <div>
              <EmptyState text="Contact could not be loaded." />
              <div className="mt-3 text-center">
                <Button
                  variant="secondary"
                  onClick={() => chatContext.refetch()}
                >
                  Retry
                </Button>
              </div>
            </div>
          ) : null}
          {contact ? (
            <CrmConversations
              contact={contact}
              initialConversationId={initialConversationId}
              canEditContact={Boolean(
                permissions.canEditAll ||
                (permissions.canEditOwn &&
                  currentMemberId === contact.ownerMemberId),
              )}
            />
          ) : null}
        </div>
      </aside>
    </>
  );
}

function CrmChatTab({
  contactId,
  preview,
  active,
  onSelect,
}: {
  contactId: string;
  preview?: CrmContactChatPreview;
  active: boolean;
  onSelect: () => void;
}) {
  const contact = useQuery({
    queryKey: telegramCrmKeys.chatContext(contactId),
    queryFn: ({ signal }) => telegramCrmApi.getChatContext(contactId, signal),
    staleTime: 60_000,
  });
  const hydrated = contact.data;
  const account = hydrated?.conversationAccounts[0] ?? null;
  const displayName = hydrated?.displayName ?? preview?.displayName ?? "chat";
  const username = hydrated?.telegramUsername ?? preview?.telegramUsername;
  const contactLabel = displayName.replace(/^@+/, "");
  const accountLabel = account
    ? account.username
      ? `@${account.username.replace(/^@+/, "")}`
      : account.label
    : "Telegram account";
  const avatar =
    hydrated?.peers[0]?.photoUrl ??
    preview?.photoUrl ??
    (username
      ? `https://t.me/i/userpic/320/${username.replace(/^@+/, "")}.jpg`
      : null);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Open chat ${contactLabel} via ${accountLabel}`}
      aria-current={active ? "true" : undefined}
      title={`${contactLabel} · ${accountLabel}`}
      className={`flex shrink-0 items-center gap-1 rounded-xl border p-1.5 transition ${active ? "border-blue-500 bg-blue-950/30" : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"}`}
    >
      <TelegramEntityAvatar
        imageUrl={avatar}
        alt={contactLabel}
        kind="person"
        size="sm"
      />
      {account ? (
        <TelegramEntityAvatar
          imageUrl={account.photoUrl}
          alt={accountLabel}
          kind="mtproto"
          size="sm"
        />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 text-[9px] text-neutral-500">
          MTP
        </span>
      )}
    </button>
  );
}
