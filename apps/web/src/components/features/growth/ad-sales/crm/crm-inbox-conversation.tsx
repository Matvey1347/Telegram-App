"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { telegramUserAccountsApi } from "@/lib/api";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { telegramAccountKeys } from "@/lib/query-keys";
import { useCrmSalesWorkflow } from "@/lib/features/growth/use-crm-sales-workflow";
import { CrmSalesControls } from "./crm-sales-controls";
import { useCrmSalesCopy } from "./crm-sales-copy";
import { CrmMessageThread } from "./crm-message-thread";

export function CrmInboxConversation({ conversationId, peerId, canSendManual, onBack, onOpenDetails, displayName, photoUrl, workflowMenuOpen, onWorkflowMenuOpenChange, detailsOpen }: {
  conversationId: string;
  peerId: string | null;
  canSendManual: boolean;
  onBack?: () => void;
  onOpenDetails?: () => void;
  displayName?: string;
  photoUrl?: string | null;
  workflowMenuOpen?: boolean;
  onWorkflowMenuOpenChange?: (open: boolean) => void;
  detailsOpen?: boolean;
}) {
  const t = useCrmSalesCopy();
  const workflow = useCrmSalesWorkflow(conversationId);
  const query = useQuery({ queryKey: telegramCrmKeys.conversationDetail(conversationId),
    queryFn: ({ signal }) => telegramCrmApi.getConversation(conversationId, signal), staleTime: 60_000 });
  const accounts = useQuery({ queryKey: telegramAccountKeys.accounts(), queryFn: telegramUserAccountsApi.list,
    enabled: query.isSuccess && canSendManual, staleTime: 24 * 60 * 60_000 });
  const selected = query.data;
  const account = accounts.data?.find((item) => item.id === selected?.mtprotoAccountId);
  const doNotContact = workflow.data?.outreachBlockedReason === "DO_NOT_CONTACT";
  const canSend = Boolean(!doNotContact && !workflow.isLoading && !workflow.error && canSendManual && account?.status === "connected" && account.isActive && account.crmSendEnabled);
  const disabledReason = doNotContact ? t("crmSales.dnc") : workflow.isLoading ? t("crmSales.loading") : workflow.error ? t("crmSales.loadError") : !canSendManual ? "You do not have permission to send manual CRM messages."
    : accounts.error ? "Telegram account status could not be loaded. Sending is unavailable."
    : accounts.isLoading ? "Loading Telegram account…" : "The Telegram account is disconnected, inactive or CRM Send is off.";
  const name = displayName || (selected ? [selected.peer.firstName, selected.peer.lastName].filter(Boolean).join(" ") ||
    (selected.peer.username ? `@${selected.peer.username}` : "Telegram contact") : "Conversation");
  const back = <button type="button" aria-label="Back to inbox" onClick={onBack}
    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutral-300 hover:bg-neutral-800"><ArrowLeft size={20} /></button>;
  if (query.isLoading) return <div className="flex h-full min-h-0 flex-col">
    <header className="flex shrink-0 items-center gap-2 border-b border-neutral-800 bg-neutral-900/95 px-3 py-2">{back}<IconAvatar label={name} size="md" className="!rounded-full" icon={photoUrl ? { type: "image", id: conversationId, url: photoUrl, name } : null} /><h2 className="truncate text-sm font-semibold text-white">{name}</h2></header>
    <p role="status" className="m-auto text-sm text-neutral-400">Loading messages…</p>
    <div className="shrink-0 border-t border-neutral-800 bg-neutral-900/95 p-3"><textarea disabled aria-label="Message" placeholder="Write a message…" rows={2} className="block w-full resize-none rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm" /></div>
  </div>;
  if (query.error || !selected) return <div className="flex h-full min-h-0 flex-col"><div className="p-2">{back}</div><div role="alert" className="m-auto p-5 text-center"><p className="mb-3 text-sm text-rose-300">This conversation could not be loaded.</p><Button onClick={() => void query.refetch()}>Retry</Button></div></div>;
  if (peerId && selected.telegramCrmPeerId !== peerId) return <div className="p-4">{back}<p role="alert" className="mt-4 text-sm text-amber-300">This link no longer matches the selected Telegram contact.</p></div>;
  return <CrmMessageThread conversation={selected} canSendManual={canSend} sendDisabledReason={disabledReason} detailsOpen={detailsOpen}
    header={<div className="flex min-w-0 items-center gap-2">
      {back}<IconAvatar label={name} size="md" className="!rounded-full" icon={selected.peer.photoUrl ? { type: "image", id: selected.peer.id, url: selected.peer.photoUrl, name } : null} />
      <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold text-white">{name}</h2><p className="truncate text-xs text-neutral-400">Telegram · {selected.account.username ? `@${selected.account.username}` : selected.account.label}</p></div>
      <CrmSalesControls conversationId={conversationId} compact menuOpen={workflowMenuOpen} onMenuOpenChange={onWorkflowMenuOpenChange} />
      <button type="button" onClick={onOpenDetails} aria-label="Client details" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutral-300 hover:bg-neutral-800"><Info size={20} /></button>
    </div>} />;
}
