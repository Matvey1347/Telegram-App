"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmConversationListItem } from "@telegram-system/shared";
import { Button } from "@/components/ui/primitives";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { patchInboxConversation } from "@/lib/features/growth/crm-inbox-cache";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { CrmContactNotes } from "./crm-contact-notes";
import { CrmSalesControls } from "./crm-sales-controls";
import { CrmInboxPurchases } from "./crm-inbox-purchases";
import { CrmPackageSalesContext } from "./crm-package-sales-context";
import { useCrmSalesCopy } from "./crm-sales-copy";

export function CrmInboxDetails({ conversation, canManage, canViewSales, canEditOwn = false, currentMemberId }: {
  conversation: CrmConversationListItem;
  canManage: boolean;
  canViewSales: boolean;
  canEditOwn?: boolean;
  currentMemberId?: string;
}) {
  const t = useCrmSalesCopy();
  const client = useQueryClient();
  const [expanded, setExpanded] = useState<"notes" | "packages" | null>(null);
  const contact = useQuery({
    queryKey: telegramCrmKeys.contactDetail(conversation.contactId ?? "unassigned"),
    queryFn: ({ signal }) => telegramCrmApi.getContact(conversation.contactId!, signal),
    enabled: Boolean(conversation.contactId), staleTime: 60_000,
  });
  const promote = useMutation({
    mutationFn: () => telegramCrmApi.promoteInboxPeer(conversation.telegramCrmPeerId, "LEAD"),
    onSuccess: (result) => {
      const next = { ...conversation, contactId: result.contact.id };
      client.setQueryData(telegramCrmKeys.conversationDetail(conversation.id), next);
      patchInboxConversation(client, conversation.id, { contact: {
        id: result.contact.id, displayName: result.contact.displayName, stage: result.contact.stage,
        nextContactAt: result.contact.nextContactAt,
      } });
      void client.invalidateQueries({ queryKey: telegramCrmKeys.contactLists() });
    },
  });
  const data = contact.data;
  const canEdit = canManage || Boolean(canEditOwn && currentMemberId && data?.ownerMemberId === currentMemberId);
  if (!conversation.contactId) return <div className="space-y-4 text-sm">
    <p className="text-neutral-400">This Telegram contact has not been linked to a CRM client.</p>
    {conversation.peer.username ? <a className="text-blue-300" href={`https://t.me/${encodeURIComponent(conversation.peer.username)}`} target="_blank" rel="noreferrer">@{conversation.peer.username}</a> : null}
    {canManage ? <Button disabled={promote.isPending} onClick={() => promote.mutate()}>Create CRM client</Button> : null}
    {promote.error ? <p role="alert" className="text-rose-300">Client could not be created. Try again.</p> : null}
    <p className="text-xs text-neutral-500">Purchase history, notes and follow-up become available after linking.</p>
  </div>;
  if (contact.isLoading) return <p role="status" className="text-sm text-neutral-400">Loading client details…</p>;
  if (contact.error || !data) return <div role="alert"><p className="mb-3 text-sm text-rose-300">Client details could not be loaded.</p><Button onClick={() => void contact.refetch()}>Retry</Button></div>;
  return <div className="space-y-5 text-sm">
    <span className="sr-only">{data.displayName}</span>
    <section className="space-y-2 border-t border-neutral-800 pt-4"><h3 className="font-medium text-neutral-200">{t("crmSales.contacts")}</h3>
      {data.telegramUsername ? <a className="block text-blue-300" href={`https://t.me/${encodeURIComponent(data.telegramUsername.replace(/^@/, ""))}`} target="_blank" rel="noreferrer">@{data.telegramUsername.replace(/^@/, "")}</a> : null}
      {data.phone ? <p>{data.phone}</p> : null}{data.email ? <p>{data.email}</p> : null}
      {data.website && /^https?:\/\//i.test(data.website) ? <a className="block break-all text-blue-300" href={data.website} target="_blank" rel="noreferrer">{data.website}</a> : null}
      {data.contactChannels.map((channel) => <p key={channel.id} className="break-all text-xs text-neutral-400">{channel.label || channel.type}: {channel.value}</p>)}
    </section>
    {canViewSales ? <>
      <section className="space-y-3 border-t border-neutral-800 pt-4"><h3 className="font-medium text-neutral-200">{t("crmSales.purchases")}</h3>
        <CrmInboxPurchases contactId={data.id} conversationId={conversation.id} workspaceId={conversation.workspaceId} />
      </section>
    </> : null}
    <details className="border-t border-neutral-800 pt-4">
      <summary className="cursor-pointer text-neutral-400">Дополнительно</summary>
      <div className="mt-4 space-y-4">
        <CrmSalesControls conversationId={conversation.id} />
        {canViewSales ? <section><Button variant="secondary" className="min-h-11 max-w-full whitespace-normal text-left" onClick={() => setExpanded(expanded === "packages" ? null : "packages")}>{t("crmSales.packages")}</Button>{expanded === "packages" ? <CrmPackageSalesContext /> : null}</section> : null}
        <section><Button variant="secondary" className="min-h-11" onClick={() => setExpanded(expanded === "notes" ? null : "notes")}>{t("crmSales.notes")}</Button>{expanded === "notes" ? <CrmContactNotes contact={data} canEdit={canEdit} /> : null}</section>
        {data.source || data.description ? <section><h3 className="font-medium text-neutral-200">{t("crmSales.source")}</h3><p className="text-neutral-400">{data.source}</p>{data.description ? <p className="whitespace-pre-wrap text-neutral-400">{data.description}</p> : null}</section> : null}
      </div>
    </details>
    <Link className="block text-blue-300" href={`/ad-sales/clients/${encodeURIComponent(data.id)}/conversations/${encodeURIComponent(conversation.id)}`}>Open client profile →</Link>
  </div>;
}
