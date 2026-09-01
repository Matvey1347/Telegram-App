"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmContactDetail } from "@telegram-system/shared";
import { authApi, telegramUserAccountsApi } from "@/lib/api";
import { Button, EmptyState, Select } from "@/components/ui/primitives";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { authKeys, telegramAccountKeys } from "@/lib/query-keys";
import { crmPermissions } from "./crm-permissions";
import { CrmMessageThread } from "./crm-message-thread";

export function CrmConversations({
  contact,
  selectedConversationId,
  canEditContact,
}: {
  contact: CrmContactDetail;
  selectedConversationId: string | null;
  canEditContact: boolean;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [newOpen, setNewOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [peerId, setPeerId] = useState(contact.peers[0]?.id ?? "");
  const me = useQuery({ queryKey: authKeys.me(), queryFn: authApi.me, staleTime: 5 * 60_000 });
  const permissions = crmPermissions(me.data?.workspace.access);
  const params = useMemo(() => ({ contactId: contact.id, page: 1, pageSize: 50, state: "ACTIVE" as const }), [contact.id]);
  const conversations = useQuery({
    queryKey: telegramCrmKeys.conversationList(params),
    queryFn: ({ signal }) => telegramCrmApi.listConversations(params, signal),
  });
  const directConversation = useQuery({
    queryKey: selectedConversationId ? telegramCrmKeys.conversationDetail(selectedConversationId) : telegramCrmKeys.conversationDetail("none"),
    queryFn: ({ signal }) => telegramCrmApi.getConversation(selectedConversationId!, signal),
    enabled: Boolean(selectedConversationId),
  });
  const accounts = useQuery({
    queryKey: telegramAccountKeys.accounts(),
    queryFn: telegramUserAccountsApi.list,
    enabled: newOpen || Boolean(selectedConversationId),
  });
  const settings = useQuery({
    queryKey: telegramCrmKeys.settings(),
    queryFn: ({ signal }) => telegramCrmApi.getSettings(signal),
    enabled: newOpen,
  });
  const sendAccounts = (accounts.data ?? []).filter(
    (account) => account.status === "connected" && account.isActive && account.crmSendEnabled,
  );
  const effectiveAccountId = accountId || (settings.isSuccess
    ? (sendAccounts.find((account) => account.id === settings.data.defaultCrmSenderAccountId) ?? sendAccounts[0])?.id || ""
    : "");
  const create = useMutation({
    mutationFn: () => {
      const peer = contact.peers.find((item) => item.id === peerId);
      if (!peer) throw new Error("Select a Telegram peer.");
      return telegramCrmApi.createConversation({
        telegramCrmPeerId: peer.id,
        contactId: contact.id,
        accountId: effectiveAccountId,
        telegramDialogId: peer.telegramUserId,
      });
    },
    onSuccess: (conversation) => {
      void queryClient.invalidateQueries({ queryKey: telegramCrmKeys.conversationLists() });
      router.push(`/ad-sales/contacts/${contact.id}/conversations/${conversation.id}`);
    },
  });
  const directMismatch = Boolean(directConversation.data && directConversation.data.contactId !== contact.id);
  const selected = directMismatch ? null : directConversation.data ?? conversations.data?.items.find((item) => item.id === selectedConversationId) ?? null;
  const selectedAccount = selected ? (accounts.data ?? []).find((account) => account.id === selected.mtprotoAccountId) : null;
  const accountCanSend = Boolean(selectedAccount && selectedAccount.status === "connected" && selectedAccount.isActive && selectedAccount.crmSendEnabled);
  const sendDisabledReason = !permissions.canSendManual ? "You do not have permission to send manual CRM messages." : !selectedAccount ? "The fixed Telegram account is unavailable." : selectedAccount.status !== "connected" ? "The fixed Telegram account session is disconnected." : !selectedAccount.isActive ? "The fixed Telegram account is inactive." : !selectedAccount.crmSendEnabled ? "CRM Send is off for the fixed Telegram account." : undefined;
  const senderPlaceholder = accounts.isLoading
    ? "Loading CRM Send accounts…"
    : !sendAccounts.length
      ? "No active CRM Send account"
      : settings.isLoading
        ? "Loading workspace default…"
        : "Select a CRM Send account";
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium text-white">Conversations</h2>
        {permissions.canSendManual && canEditContact && contact.peers.length ? <Button variant="secondary" onClick={() => setNewOpen((value) => !value)}>New conversation</Button> : null}
      </div>
      {newOpen ? (
        <div className="mb-4 grid gap-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 sm:grid-cols-[1fr_1fr_auto]">
          <Select value={peerId} onChange={(event) => setPeerId(event.target.value)} aria-label="Contact Telegram peer">
            {contact.peers.map((peer) => <option key={peer.id} value={peer.id}>{peer.username ? `@${peer.username}` : [peer.firstName, peer.lastName].filter(Boolean).join(" ") || peer.telegramUserId}</option>)}
          </Select>
          <Select value={effectiveAccountId} onChange={(event) => setAccountId(event.target.value)} aria-label="CRM sender account">
            {!effectiveAccountId ? <option value="">{senderPlaceholder}</option> : null}
            {sendAccounts.map((account) => <option key={account.id} value={account.id}>{account.username ? `@${account.username}` : account.label}{account.id === settings.data?.defaultCrmSenderAccountId ? " · Workspace default" : ""}</option>)}
          </Select>
          <Button disabled={!peerId || !effectiveAccountId || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Creating…" : "Create"}</Button>
          {create.error ? <p className="text-xs text-rose-300 sm:col-span-3">Conversation could not be created.</p> : null}
          {accounts.error ? <p className="text-xs text-rose-300 sm:col-span-3">CRM Send accounts could not be loaded.</p> : null}
          {settings.error ? <p className="text-xs text-rose-300 sm:col-span-3">Workspace sender preference could not be loaded. Choose an account explicitly or retry.</p> : null}
        </div>
      ) : null}
      {conversations.isLoading ? <p className="py-6 text-sm text-neutral-500">Loading conversations…</p> : null}
      {conversations.error ? <div className="py-5"><p className="mb-2 text-sm text-rose-300">Conversations could not be loaded.</p><Button variant="secondary" onClick={() => conversations.refetch()}>Retry</Button></div> : null}
      {selectedConversationId && directConversation.isLoading ? <p className="py-6 text-sm text-neutral-500">Loading selected conversation…</p> : null}
      {!selectedConversationId && !conversations.isLoading && !conversations.error && !conversations.data?.items.length ? <EmptyState text="No account-specific conversations yet." /> : null}
      {conversations.data?.items.length || directMismatch || selected ? (
        <div className="grid gap-4 md:grid-cols-[minmax(220px,0.35fr)_minmax(0,1fr)]">
          {conversations.data?.items.length ? <ol className={`${selected ? "hidden md:block" : "block"} space-y-2`} aria-label="Account-specific conversations">
            {conversations.data.items.map((conversation) => (
              <li key={conversation.id}>
                <Link href={`/ad-sales/contacts/${contact.id}/conversations/${conversation.id}`} className={`block rounded-lg border p-3 ${selectedConversationId === conversation.id ? "border-teal-600 bg-teal-950/35" : "border-neutral-800 bg-neutral-900/45"}`}>
                  <span className="block text-sm text-white">via {conversation.account.username ? `@${conversation.account.username}` : conversation.account.label}</span>
                  <span className="mt-1 block text-xs text-neutral-500">{conversation.unreadCount ? `${conversation.unreadCount} unread` : conversation.readState}</span>
                </Link>
              </li>
            ))}
          </ol> : null}
          {directMismatch ? <div className="rounded-xl border border-rose-900 bg-rose-950/20 p-4 text-sm text-rose-200">This conversation does not belong to this contact.</div> : selected ? <div><Link className="mb-3 inline-flex text-sm text-teal-300 md:hidden" href={`/ad-sales/contacts/${contact.id}`}>← Conversations</Link><CrmMessageThread conversation={selected} canSendManual={permissions.canSendManual && accountCanSend} sendDisabledReason={sendDisabledReason} /></div> : <div className="hidden rounded-xl border border-dashed border-neutral-800 p-8 text-center text-sm text-neutral-500 md:block">Select a conversation. Replies always use its fixed account.</div>}
        </div>
      ) : null}
    </section>
  );
}
