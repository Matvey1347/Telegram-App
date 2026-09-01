"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type {
  CrmAutomationOverride,
  CrmContactDetail,
} from "@telegram-system/shared";
import { Button, EmptyState, Modal, Select } from "@/components/ui/primitives";
import { telegramAdSalesApi } from "@/lib/api";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import {
  patchCrmContactCaches,
  telegramCrmKeys,
} from "@/lib/features/growth/telegram-crm-query";
import { crmText } from "./crm-copy";

export type CrmContactTab =
  | "conversations"
  | "deals"
  | "payments"
  | "tasks"
  | "notes"
  | "info"
  | "tags"
  | "automation";

function SectionState({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  onRetry: () => void;
}) {
  if (loading) return <p className="py-6 text-sm text-neutral-500">Loading…</p>;
  if (error) return <div className="py-5"><p className="mb-2 text-sm text-rose-300">This section could not be loaded.</p><Button variant="secondary" onClick={onRetry}>Retry</Button></div>;
  if (empty) return <EmptyState text="Nothing here yet." />;
  return null;
}

export function CrmDealsSection({ contact }: { contact: CrmContactDetail }) {
  const query = useQuery({
    queryKey: ["telegram-ad-sales", "crm-contact", contact.id, "deals"],
    queryFn: ({ signal }) => telegramAdSalesApi.listSalesPage({ advertiserId: contact.id, page: 1, pageSize: 25 }, signal),
  });
  const state = <SectionState loading={query.isLoading} error={query.isError} empty={!query.data?.items.length} onRetry={() => void query.refetch()} />;
  if (!query.data?.items.length) return state;
  return <ol className="space-y-2">{query.data.items.map((deal) => <li key={deal.id} className="rounded-lg border border-neutral-800 p-3"><div className="flex items-center justify-between gap-3"><span className="font-medium text-white">{contact.displayName} · {deal.id.slice(0, 8)}</span><span className="text-xs text-neutral-400">{deal.status}</span></div><p className="mt-1 text-xs text-neutral-500">{deal.placements.length} placement{deal.placements.length === 1 ? "" : "s"} · {deal.settlementCurrency}</p></li>)}</ol>;
}

export function CrmPaymentsSection({ contact }: { contact: CrmContactDetail }) {
  if (!contact.paymentSummary.length) return <EmptyState text="No payment balance for this contact." />;
  return <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{contact.paymentSummary.map((payment) => <div key={payment.currency} className="rounded-lg border border-neutral-800 p-3"><dt className="text-xs text-neutral-500">{payment.currency}</dt><dd className="mt-1 text-sm text-white">{payment.paidAmount} paid / {payment.agreedAmount} agreed</dd><p className="mt-1 text-xs text-amber-300">{payment.outstandingAmount} outstanding</p></div>)}</dl>;
}

export function CrmTasksSection({ contact }: { contact: CrmContactDetail }) {
  const query = useQuery({
    queryKey: ["telegram-ad-sales", "crm-contact", contact.id, "tasks"],
    queryFn: () => telegramAdSalesApi.listCrmTasks({ advertiserId: contact.id, page: 1, pageSize: 25 }),
  });
  const state = <SectionState loading={query.isLoading} error={query.isError} empty={!query.data?.items.length} onRetry={() => void query.refetch()} />;
  if (!query.data?.items.length) return state;
  return <ol className="space-y-2">{query.data.items.map((task) => <li key={task.id} className="rounded-lg border border-neutral-800 p-3"><span className="font-medium text-white">{task.title}</span><p className="mt-1 text-xs text-neutral-500">{task.status} · {task.priority} · due {task.dueAt || "not set"}</p></li>)}</ol>;
}

export function CrmNotesSection({ contact }: { contact: CrmContactDetail }) {
  const query = useQuery({
    queryKey: ["telegram-ad-sales", "crm-contact", contact.id, "activities"],
    queryFn: () => telegramAdSalesApi.listAdvertiserActivities(contact.id, { page: 1, pageSize: 25 }),
  });
  const state = <SectionState loading={query.isLoading} error={query.isError} empty={!query.data?.items.length} onRetry={() => void query.refetch()} />;
  if (!query.data?.items.length) return state;
  return <ol className="space-y-2">{query.data.items.map((activity) => <li key={activity.id} className="rounded-lg border border-neutral-800 p-3"><span className="text-xs uppercase tracking-wide text-neutral-500">{activity.type}</span><p className="mt-1 text-sm font-medium text-neutral-200">{activity.title}</p>{activity.description ? <p className="mt-1 text-sm text-neutral-400">{activity.description}</p> : null}</li>)}</ol>;
}

export function CrmInfoSection({ contact }: { contact: CrmContactDetail }) {
  const rows = [
    ["Telegram", contact.telegramUsername ? `@${contact.telegramUsername.replace(/^@/, "")}` : null],
    ["Phone", contact.phone], ["Email", contact.email], ["Website", contact.website],
    ["Company", contact.companyName], ["Source", contact.source], ["Description", contact.description],
  ];
  return <dl className="grid gap-3 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="rounded-lg border border-neutral-800 p-3"><dt className="text-xs text-neutral-500">{label}</dt><dd className="mt-1 break-words text-sm text-neutral-200">{value || "—"}</dd></div>)}</dl>;
}

export function CrmTagsSection({ contact }: { contact: CrmContactDetail }) {
  if (!contact.tags.length) return <EmptyState text="No tags on this contact." />;
  return <div className="flex flex-wrap gap-2">{contact.tags.map((tag) => <span key={tag.id} className="rounded-full border border-neutral-700 px-3 py-1 text-sm text-neutral-200" style={tag.color ? { borderColor: tag.color } : undefined}>{tag.name}</span>)}</div>;
}

export function CrmAutomationSection({ contact, canManageWorkspace, canManageContact }: { contact: CrmContactDetail; canManageWorkspace: boolean; canManageContact: boolean }) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const settings = useQuery({
    queryKey: telegramCrmKeys.settings(),
    queryFn: ({ signal }) => telegramCrmApi.getSettings(signal),
  });
  const update = useMutation({
    mutationFn: (enabled: boolean) => telegramCrmApi.updateContact(contact.id, { automatedMessagesEnabled: enabled }),
    onSuccess: (updated) => {
      patchCrmContactCaches(queryClient, updated);
      setConfirmOpen(false);
    },
  });
  const workspaceUpdate = useMutation({
    mutationFn: (payload: Parameters<typeof telegramCrmApi.updateSettings>[0]) => telegramCrmApi.updateSettings(payload),
    onSuccess: (updated) => queryClient.setQueryData(telegramCrmKeys.settings(), updated),
  });
  const dealUpdate = useMutation({
    mutationFn: ({ dealId, override }: { dealId: string; override: CrmAutomationOverride }) => telegramCrmApi.updateDealAutomation(dealId, override),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: telegramCrmKeys.contactDetail(contact.id) }),
  });
  const automation = settings.data?.automation;
  const settingButtons = [
    ["Workspace customer automation", automation?.customerTelegramAutomationsEnabled ?? false, "customerTelegramAutomationsEnabled"],
    ["Pre-publication reminders", automation?.typeEnabled.PRE_PUBLICATION_REMINDER ?? false, "prePublicationReminderEnabled"],
    ["Published links", automation?.typeEnabled.PUBLISHED_LINKS ?? false, "publishedLinksEnabled"],
    ["Follow-up", automation?.typeEnabled.FOLLOW_UP ?? false, "followUpEnabled"],
  ] as const;
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-neutral-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-medium text-white">Customer Telegram automation</h3><p className="mt-1 text-sm text-neutral-400">{crmText(contact.automatedMessagesEnabled ? "automation.on" : "automation.off")}. Manual replies are independent.</p></div>
          {canManageContact && contact.automatedMessagesEnabled ? <Button variant="secondary" disabled={update.isPending} onClick={() => update.mutate(false)}>Disable</Button> : null}
          {canManageContact && !contact.automatedMessagesEnabled ? <Button disabled={update.isPending} onClick={() => setConfirmOpen(true)}>Enable automation</Button> : null}
        </div>
        {!canManageContact ? <p className="mt-3 text-xs text-neutral-500">You do not have permission to manage automation for this contact.</p> : null}
        {update.error ? <p className="mt-2 text-xs text-rose-300">Automation setting could not be saved.</p> : null}
      </section>
      <section className="rounded-xl border border-neutral-800 p-4">
        <h3 className="font-medium text-white">Workspace gates (off by default)</h3>
        <p className="mt-1 text-xs text-neutral-500">All enabled gates must pass. Enabling the workspace never enables any Contact.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {settingButtons.map(([label, enabled, field]) => <div key={field} className="flex items-center justify-between gap-2 rounded-lg bg-neutral-950/50 p-3"><span className="text-sm text-neutral-300">{label}</span><Button variant="secondary" disabled={!canManageWorkspace || !settings.isSuccess || workspaceUpdate.isPending} aria-pressed={enabled} onClick={() => workspaceUpdate.mutate({ [field]: !enabled })}>{enabled ? "On" : "Off"}</Button></div>)}
        </div>
        {settings.isLoading ? <p className="mt-2 text-xs text-neutral-500">Loading workspace automation gates…</p> : null}
        {settings.error ? <div className="mt-2 flex items-center gap-2"><p className="text-xs text-rose-300">Workspace automation gates could not be loaded.</p><Button variant="secondary" onClick={() => settings.refetch()}>Retry</Button></div> : null}
        {workspaceUpdate.error ? <p className="mt-2 text-xs text-rose-300">Workspace automation gates could not be saved.</p> : null}
      </section>
      {contact.dealAutomation.map((deal) => <section key={deal.dealId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-800 p-3"><div><span className="text-sm text-white">Deal {deal.dealId.slice(0, 8)}</span><p className="text-xs text-neutral-500">Contact automation is not changed by this override.</p>{deal.override === "DISABLED" && !deal.eligibleAt ? <p className="mt-1 text-xs text-amber-300">Protected deal: automation stays off and has no eligibility cutover.</p> : null}</div><Select disabled={!canManageContact || dealUpdate.isPending} value={deal.override} onChange={(event) => dealUpdate.mutate({ dealId: deal.dealId, override: event.target.value as CrmAutomationOverride })}><option value="INHERIT">Use contact setting</option><option value="ENABLED">Allow future eligible events</option><option value="DISABLED">Keep off for this deal</option></Select></section>)}
      {dealUpdate.error ? <p className="text-xs text-rose-300">Deal automation preference could not be saved.</p> : null}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Enable customer automation"><p className="text-sm text-neutral-200">{crmText("automation.confirm")}</p><p className="mt-2 text-xs text-neutral-500">This does not send a message now. Future messages still require every workspace, type, deal, and eligibility gate.</p><div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setConfirmOpen(false)}>Keep automation off</Button><Button disabled={update.isPending} onClick={() => update.mutate(true)}>Allow future messages</Button></div></Modal>
    </div>
  );
}
