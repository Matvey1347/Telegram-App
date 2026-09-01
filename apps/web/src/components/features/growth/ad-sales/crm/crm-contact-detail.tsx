"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmContactStage } from "@telegram-system/shared";
import { authApi, workspaceMembersApi } from "@/lib/api";
import { Button, EmptyState, LoadingState } from "@/components/ui/primitives";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { authKeys, memberKeys } from "@/lib/query-keys";
import { crmPermissions } from "./crm-permissions";
import { patchCrmContactCaches } from "@/lib/features/growth/telegram-crm-query";
import { MemberSelect } from "@/components/features/workspace/member-select";
import { Select } from "@/components/ui/primitives";
import { CrmConversations } from "./crm-conversations";
import { crmText } from "./crm-copy";
import { formatDateTime } from "@/lib/date-format";
import {
  CrmAutomationSection,
  CrmDealsSection,
  CrmInfoSection,
  CrmNotesSection,
  CrmPaymentsSection,
  CrmTagsSection,
  CrmTasksSection,
  type CrmContactTab,
} from "./crm-contact-sections";

const tabs: Array<{ id: CrmContactTab; label: string }> = [
  { id: "conversations", label: "Conversations" }, { id: "deals", label: "Deals" },
  { id: "payments", label: "Payments" }, { id: "tasks", label: "Tasks" },
  { id: "notes", label: "Notes / Activities" }, { id: "info", label: "Contact info" },
  { id: "tags", label: "Tags" }, { id: "automation", label: "Automation" },
];

export function CrmContactDetail({ contactId, conversationId, canViewSales }: { contactId: string; conversationId: string | null; canViewSales: boolean }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<CrmContactTab>(conversationId ? "conversations" : "conversations");
  const detail = useQuery({
    queryKey: telegramCrmKeys.contactDetail(contactId),
    queryFn: ({ signal }) => telegramCrmApi.getContact(contactId, signal),
    retry: false,
  });
  const me = useQuery({ queryKey: authKeys.me(), queryFn: authApi.me, staleTime: 5 * 60_000 });
  const members = useQuery({ queryKey: memberKeys.membersSelect(), queryFn: workspaceMembersApi.select });
  const permissions = crmPermissions(me.data?.workspace.access);
  const update = useMutation({
    mutationFn: (payload: { stage?: CrmContactStage; ownerMemberId?: string | null }) => telegramCrmApi.updateContact(contactId, payload),
    onSuccess: (contact) => {
      patchCrmContactCaches(queryClient, contact);
      void queryClient.invalidateQueries({ queryKey: telegramCrmKeys.contactDetail(contactId) });
    },
  });
  if (detail.isLoading) return <LoadingState text="Loading contact…" />;
  if (detail.error || !detail.data) return <div><EmptyState text="Contact could not be loaded." /><div className="mt-3 text-center"><Button variant="secondary" onClick={() => detail.refetch()}>Retry</Button></div></div>;
  const contact = detail.data;
  const currentMemberId = members.data?.find((member) => member.isCurrentUser)?.id;
  const canEdit = permissions.canEditAll || (permissions.canEditOwn && currentMemberId === contact.ownerMemberId);
  const visibleTabs = canViewSales ? tabs : tabs.filter((item) => item.id !== "deals" && item.id !== "payments");
  return (
    <article>
      <header className="mb-5 rounded-xl border border-neutral-800 bg-neutral-900/55 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <TelegramEntityAvatar imageUrl={contact.peers[0]?.photoUrl ?? undefined} alt={contact.displayName} kind="person" size="lg" />
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold text-white">{contact.displayName}</h1>{contact.unreadCount ? <span className="rounded-full bg-teal-500 px-2 py-0.5 text-xs font-semibold text-neutral-950">{contact.unreadCount} unread</span> : null}<span className={contact.automatedMessagesEnabled ? "text-xs text-emerald-300" : "text-xs text-neutral-500"}>{crmText(contact.automatedMessagesEnabled ? "automation.on" : "automation.off")}</span></div><p className="mt-1 text-sm text-neutral-400">{contact.telegramUsername ? `@${contact.telegramUsername.replace(/^@/, "")}` : "No Telegram username"} · Next follow-up: {contact.nextContactAt ? formatDateTime(contact.nextContactAt) : "Not scheduled"}</p>{canEdit ? <div className="mt-3 grid max-w-xl gap-2 sm:grid-cols-2"><Select value={contact.stage} aria-label="Contact stage" disabled={update.isPending} onChange={(event) => update.mutate({ stage: event.target.value as CrmContactStage })}>{["NEW", "LEAD", "QUALIFIED", "FOLLOW_UP", "CUSTOMER", "LOST", "ARCHIVED"].map((stage) => <option key={stage} value={stage}>{stage.replace("_", "-")}</option>)}</Select>{permissions.canEditAll ? <MemberSelect allowAssignOthers value={contact.ownerMemberId ?? ""} onChange={(ownerMemberId) => update.mutate({ ownerMemberId: ownerMemberId || null })} /> : <span className="self-center text-sm text-neutral-500">Owner: {contact.ownerMember?.name || "Unassigned"}</span>}</div> : <p className="mt-1 text-sm text-neutral-500">Owner: {contact.ownerMember?.name || "Unassigned"}</p>}</div>
          {permissions.canCreateSales ? <Link href={`/ad-sales/sales?contactId=${encodeURIComponent(contact.id)}&createDeal=1`}><Button>Create deal</Button></Link> : null}
        </div>
        {update.error ? <p className="mt-3 text-xs text-rose-300">Contact changes could not be saved. Your previous values remain active.</p> : null}
      </header>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Contact detail">
        {visibleTabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`min-h-9 shrink-0 rounded-lg border px-3 text-sm ${tab === item.id ? "border-teal-500/60 bg-teal-500/15 text-teal-100" : "border-neutral-800 text-neutral-400"}`}>{item.label}</button>)}
      </div>
      {tab === "conversations" ? <CrmConversations contact={contact} selectedConversationId={conversationId} canEditContact={canEdit} /> : null}
      {tab === "deals" && canViewSales ? <CrmDealsSection contact={contact} /> : null}
      {tab === "payments" && canViewSales ? <CrmPaymentsSection contact={contact} /> : null}
      {tab === "tasks" ? <CrmTasksSection contact={contact} /> : null}
      {tab === "notes" ? <CrmNotesSection contact={contact} /> : null}
      {tab === "info" ? <CrmInfoSection contact={contact} /> : null}
      {tab === "tags" ? <CrmTagsSection contact={contact} /> : null}
      {tab === "automation" ? <CrmAutomationSection contact={contact} canManageWorkspace={permissions.canManageAutomation} canManageContact={permissions.canManageAutomation && canEdit} /> : null}
    </article>
  );
}
