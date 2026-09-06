"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmContactDetail } from "@telegram-system/shared";
import { authApi, telegramUserAccountsApi } from "@/lib/api";
import {
  Button,
  CustomSelect,
  Input,
  Select,
} from "@/components/ui/primitives";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { authKeys, telegramAccountKeys } from "@/lib/query-keys";
import { crmPermissions } from "./crm-permissions";
import { CrmMessageThread } from "./crm-message-thread";
import { TelegramTextEditor } from "@/components/features/telegram/telegram/telegram-text-editor";

export function CrmConversationsSkeleton() {
  return (
    <div
      className="flex h-full min-h-0 flex-col"
      aria-label="Loading conversation"
    >
      <div className="mb-3 space-y-2 border-b border-neutral-800 pb-3">
        <div className="h-5 w-40 animate-pulse rounded bg-neutral-800" />
        <div className="h-3 w-56 animate-pulse rounded bg-neutral-900" />
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-hidden py-2">
        <div className="ml-auto h-16 w-3/4 animate-pulse rounded-xl bg-neutral-900" />
        <div className="h-12 w-1/2 animate-pulse rounded-xl bg-neutral-900" />
        <div className="ml-auto h-20 w-4/5 animate-pulse rounded-xl bg-neutral-900" />
      </div>
      <div className="shrink-0 border-t border-neutral-800 pt-3">
        <TelegramTextEditor
          value=""
          onChange={() => undefined}
          disabled
          rows={3}
          placeholder="Write a message…"
          characterCountLabel={(count) => `${count} characters`}
        />
      </div>
    </div>
  );
}

export function CrmConversations({
  contact,
  canEditContact,
}: {
  contact: CrmContactDetail;
  canEditContact: boolean;
}) {
  const queryClient = useQueryClient();
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [newOpen, setNewOpen] = useState(contact.peers.length === 0);
  const [accountId, setAccountId] = useState("");
  const [peerId, setPeerId] = useState(contact.peers[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const me = useQuery({
    queryKey: authKeys.me(),
    queryFn: authApi.me,
    staleTime: 5 * 60_000,
  });
  const permissions = crmPermissions(me.data?.workspace.access);
  const params = useMemo(
    () => ({
      contactId: contact.id,
      page: 1,
      pageSize: 50,
      state: "ACTIVE" as const,
    }),
    [contact.id],
  );
  const conversations = useQuery({
    queryKey: telegramCrmKeys.conversationList(params),
    queryFn: ({ signal }) => telegramCrmApi.listConversations(params, signal),
  });
  const directConversation = useQuery({
    queryKey: selectedConversationId
      ? telegramCrmKeys.conversationDetail(selectedConversationId)
      : telegramCrmKeys.conversationDetail("none"),
    queryFn: ({ signal }) =>
      telegramCrmApi.getConversation(selectedConversationId!, signal),
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
  const connectedAccounts = (accounts.data ?? []).filter(
    (account) => account.status === "connected" && account.isActive,
  );
  const effectiveAccountId =
    accountId ||
    (settings.isSuccess
      ? (
          connectedAccounts.find(
            (account) => account.id === settings.data.defaultCrmSenderAccountId,
          ) ?? connectedAccounts[0]
        )?.id || ""
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
      void queryClient.invalidateQueries({
        queryKey: telegramCrmKeys.conversationLists(),
      });
      setSelectedConversationId(conversation.id);
      setNewOpen(false);
    },
  });
  const attach = useMutation({
    mutationFn: () =>
      telegramCrmApi.attachConversation(contact.id, {
        accountId: effectiveAccountId,
        reference,
      }),
    onSuccess: (conversation) => {
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramCrmKeys.conversationLists(),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramCrmKeys.contactLists(),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramCrmKeys.contactDetail(contact.id),
        }),
      ]);
      setSelectedConversationId(conversation.id);
      setNewOpen(false);
    },
  });
  const directMismatch = Boolean(
    directConversation.data && directConversation.data.contactId !== contact.id,
  );
  const selected = directMismatch
    ? null
    : (directConversation.data ??
      conversations.data?.items.find(
        (item) => item.id === selectedConversationId,
      ) ??
      (conversations.data?.items.length === 1
        ? conversations.data.items[0]
        : null) ??
      null);
  const selectedAccount = selected
    ? (accounts.data ?? []).find(
        (account) => account.id === selected.mtprotoAccountId,
      )
    : null;
  const accountCanSend = Boolean(
    selectedAccount &&
    selectedAccount.status === "connected" &&
    selectedAccount.isActive &&
    selectedAccount.crmSendEnabled,
  );
  const sendDisabledReason = !permissions.canSendManual
    ? "You do not have permission to send manual CRM messages."
    : !selectedAccount
      ? "The fixed Telegram account is unavailable."
      : selectedAccount.status !== "connected"
        ? "The fixed Telegram account session is disconnected."
        : !selectedAccount.isActive
          ? "The fixed Telegram account is inactive."
          : !selectedAccount.crmSendEnabled
            ? "CRM Send is off for the fixed Telegram account."
            : undefined;
  const senderPlaceholder = accounts.isLoading
    ? "Loading CRM Send accounts…"
    : !connectedAccounts.length
      ? "No connected MTProto account"
      : settings.isLoading
        ? "Loading workspace default…"
        : "Select an MTProto account";
  const contactAvatarUrl =
    contact.peers[0]?.photoUrl ??
    (contact.telegramUsername
      ? `https://t.me/i/userpic/320/${contact.telegramUsername.replace(/^@+/, "")}.jpg`
      : null);
  return (
    <section className="flex h-full min-h-0 flex-col">
      {newOpen ? (
        <div className="mb-3 grid grid-cols-1 gap-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
          {contact.peers.length ? (
            <Select
              value={peerId}
              onChange={(event) => setPeerId(event.target.value)}
              aria-label="Contact Telegram peer"
            >
              {contact.peers.map((peer) => (
                <option key={peer.id} value={peer.id}>
                  {peer.username
                    ? `@${peer.username}`
                    : [peer.firstName, peer.lastName]
                        .filter(Boolean)
                        .join(" ") || peer.telegramUserId}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="@username or phone number"
              aria-label="Telegram username or phone number"
            />
          )}
          <CustomSelect
            value={effectiveAccountId}
            onChange={setAccountId}
            placeholder={senderPlaceholder}
            searchable={connectedAccounts.length > 5}
            options={connectedAccounts.map((account) => ({
              value: account.id,
              label: account.username
                ? `@${account.username.replace(/^@+/, "")}`
                : account.label,
              meta:
                account.id === settings.data?.defaultCrmSenderAccountId
                  ? "Default"
                  : undefined,
              icon: (
                <TelegramEntityAvatar
                  imageUrl={account.photoUrl}
                  kind="mtproto"
                  size="xs"
                  alt=""
                />
              ),
            }))}
          />
          <Button
            disabled={
              !canEditContact ||
              !effectiveAccountId ||
              (contact.peers.length ? !peerId : !reference.trim()) ||
              create.isPending ||
              attach.isPending
            }
            onClick={() =>
              contact.peers.length ? create.mutate() : attach.mutate()
            }
          >
            {create.isPending || attach.isPending ? "Connecting…" : "Connect"}
          </Button>
          {create.error || attach.error ? (
            <p className="text-xs text-rose-300 sm:col-span-3">
              Conversation could not be connected. Check the account and
              Telegram username or phone number.
            </p>
          ) : null}
          {accounts.error ? (
            <p className="text-xs text-rose-300 sm:col-span-3">
              CRM Send accounts could not be loaded.
            </p>
          ) : null}
          {settings.error ? (
            <p className="text-xs text-rose-300 sm:col-span-3">
              Workspace sender preference could not be loaded. Choose an account
              explicitly or retry.
            </p>
          ) : null}
        </div>
      ) : null}
      {conversations.isLoading ? <CrmConversationsSkeleton /> : null}
      {conversations.error ? (
        <div className="py-5">
          <p className="mb-2 text-sm text-rose-300">
            Conversations could not be loaded.
          </p>
          <Button variant="secondary" onClick={() => conversations.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}
      {selectedConversationId && directConversation.isLoading ? (
        <p className="py-6 text-sm text-neutral-500">
          Loading selected conversation…
        </p>
      ) : null}
      {conversations.data?.items.length || directMismatch || selected ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {(conversations.data?.items.length ?? 0) > 1 ? (
            <ol
              className="flex gap-2 overflow-x-auto pb-1"
              aria-label="Account-specific conversations"
            >
              {(conversations.data?.items ?? []).map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedConversationId(conversation.id)}
                    aria-label={`${contact.displayName.replace(/^@+/, "")} · ${conversation.account.username ? `@${conversation.account.username.replace(/^@+/, "")}` : conversation.account.label}`}
                    title={`${contact.displayName.replace(/^@+/, "")} · ${conversation.account.username ? `@${conversation.account.username.replace(/^@+/, "")}` : conversation.account.label}`}
                    className={`relative flex items-center gap-1 rounded-xl border p-1.5 ${selected?.id === conversation.id ? "border-blue-500 bg-blue-950/25" : "border-neutral-800 bg-neutral-900/45 hover:border-neutral-700"}`}
                  >
                    <TelegramEntityAvatar
                      imageUrl={contactAvatarUrl}
                      alt={contact.displayName}
                      kind="person"
                      size="sm"
                    />
                    <TelegramEntityAvatar
                      imageUrl={conversation.account.photoUrl}
                      alt={conversation.account.label}
                      kind="mtproto"
                      size="sm"
                    />
                    {conversation.unreadCount ? (
                      <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-blue-500 px-1 text-center text-[10px] font-semibold text-white">
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ol>
          ) : null}
          {directMismatch ? (
            <div className="rounded-xl border border-rose-900 bg-rose-950/20 p-4 text-sm text-rose-200">
              This conversation does not belong to this contact.
            </div>
          ) : selected ? (
            <div className="min-h-0 flex-1">
              <CrmMessageThread
                key={selected.id}
                conversation={selected}
                canSendManual={permissions.canSendManual && accountCanSend}
                sendDisabledReason={sendDisabledReason}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
