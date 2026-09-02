"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button, LoadingState } from "@/components/ui/primitives";
import { telegramUserAccountsApi } from "@/lib/api";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { telegramAccountKeys } from "@/lib/query-keys";
import { CrmMessageThread } from "./crm-message-thread";

export function CrmInboxConversation({
  conversationId,
  peerId,
  canSendManual,
}: {
  conversationId: string;
  peerId: string | null;
  canSendManual: boolean;
}) {
  const conversation = useQuery({
    queryKey: telegramCrmKeys.conversationDetail(conversationId),
    queryFn: ({ signal }) =>
      telegramCrmApi.getConversation(conversationId, signal),
  });
  const accounts = useQuery({
    queryKey: telegramAccountKeys.accounts(),
    queryFn: telegramUserAccountsApi.list,
    enabled: conversation.isSuccess,
  });

  if (conversation.isLoading) {
    return <LoadingState text="Loading exact inbox conversation…" />;
  }
  if (conversation.error) {
    return (
      <div className="rounded-xl border border-rose-900 bg-rose-950/20 p-5 text-sm text-rose-200">
        <p>This inbox conversation could not be loaded.</p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => conversation.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }
  const selected = conversation.data;
  const mismatch =
    !selected ||
    selected.contactId !== null ||
    selected.state !== "ACTIVE" ||
    (peerId ? selected.telegramCrmPeerId !== peerId : false);
  if (mismatch) {
    return (
      <div className="rounded-xl border border-amber-900 bg-amber-950/20 p-5 text-sm text-amber-200">
        This notification no longer points to an active unassigned inbox
        conversation.
        <Link className="ml-2 underline" href="/ad-sales/inbox">
          Return to inbox
        </Link>
      </div>
    );
  }
  const selectedAccount = (accounts.data ?? []).find(
    (account) => account.id === selected.mtprotoAccountId,
  );
  const accountCanSend = Boolean(
    selectedAccount &&
    selectedAccount.status === "connected" &&
    selectedAccount.isActive &&
    selectedAccount.crmSendEnabled,
  );
  const sendDisabledReason = !canSendManual
    ? "You do not have permission to send manual CRM messages."
    : accounts.isLoading
      ? "Loading the fixed Telegram account…"
      : !selectedAccount
        ? "The fixed Telegram account is unavailable."
        : selectedAccount.status !== "connected"
          ? "The fixed Telegram account session is disconnected."
          : !selectedAccount.isActive
            ? "The fixed Telegram account is inactive."
            : !selectedAccount.crmSendEnabled
              ? "CRM Send is off for the fixed Telegram account."
              : undefined;
  const peerName =
    [selected.peer.firstName, selected.peer.lastName]
      .filter(Boolean)
      .join(" ") ||
    (selected.peer.username
      ? `@${selected.peer.username}`
      : "Telegram contact");
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link className="text-sm text-teal-300" href="/ad-sales/inbox">
            ← Inbox
          </Link>
          <h2 className="mt-1 font-medium text-white">{peerName}</h2>
          <p className="text-xs text-neutral-500">
            Exact unassigned conversation from the notification.
          </p>
        </div>
      </div>
      {accounts.error ? (
        <p className="mb-3 rounded-lg border border-rose-900 bg-rose-950/20 p-3 text-xs text-rose-300">
          The fixed Telegram account status could not be loaded. Manual sending
          is unavailable.
        </p>
      ) : null}
      <CrmMessageThread
        conversation={selected}
        canSendManual={canSendManual && accountCanSend}
        sendDisabledReason={sendDisabledReason}
      />
    </section>
  );
}
