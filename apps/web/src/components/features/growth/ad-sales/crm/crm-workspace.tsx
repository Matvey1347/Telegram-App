"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { PageTabHead } from "@/components/layout/page-tab-head";
import { Button, CustomSelect, FormField, Input, LoadingState, Modal, PageHeader, Textarea } from "@/components/ui/primitives";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { CrmContactList } from "./crm-contact-list";
import { CrmAccountSyncPanel } from "./crm-account-sync-panel";
import { CrmInbox } from "./crm-inbox";
import { CrmNavigation } from "./crm-navigation";
import type { AdSalesSurface } from "./crm-routes";
import { authApi, telegramAdSalesApi } from "@/lib/api";
import { authKeys } from "@/lib/query-keys";
import { crmPermissions } from "./crm-permissions";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { CrmContactChannelMark, type CrmContactChannelName } from "./crm-contact-channel-mark";
import { MemberSelect } from "@/components/features/workspace/member-select";
import { CrmAnalytics } from "./crm-analytics";

export function CrmWorkspace({
  surface,
}: {
  surface: Exclude<AdSalesSurface, { kind: "legacy" }>;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [addingClient, setAddingClient] = useState(false);
  const [clientForm, setClientForm] = useState({
    displayName: "",
    telegramUsername: "",
    phone: "",
    email: "",
    website: "",
    description: "",
  });
  const [newChannelName, setNewChannelName] = useState<CrmContactChannelName>("Telegram");
  const [newChannelValue, setNewChannelValue] = useState("");
  const [ownerMemberId, setOwnerMemberId] = useState("");
  const me = useQuery({
    queryKey: authKeys.me(),
    queryFn: authApi.me,
    staleTime: 5 * 60_000,
  });
  const permissions = crmPermissions(me.data?.workspace.access);
  const hasCrmView = permissions.canViewOwn || permissions.canViewAll;
  const canViewSales = permissions.canViewSales;
  const unread = useQuery({
    queryKey: telegramCrmKeys.unread(),
    queryFn: ({ signal }) => telegramCrmApi.getUnread(signal),
    enabled: hasCrmView,
  });
  const createClient = useMutation({
    mutationFn: () =>
      telegramCrmApi.createContact({
        displayName: clientForm.displayName.trim(),
        telegramUsername:
          clientForm.telegramUsername.trim() ||
          (newChannelName === "Telegram" ? newChannelValue.trim() : null),
        phone: clientForm.phone.trim() || null,
        email: clientForm.email.trim() || null,
        website: clientForm.website.trim() || null,
        description: clientForm.description.trim() || null,
        ...(permissions.canEditAll && ownerMemberId
          ? { ownerMemberId }
          : {}),
      }),
    onSuccess: async (contact) => {
      if (newChannelValue.trim() && newChannelName !== "Telegram") {
        await telegramAdSalesApi.addAdvertiserContact(contact.id, {
          label: newChannelName,
          value: newChannelValue.trim(),
          type: "OTHER",
          isPrimary: true,
        });
      }
      setClientForm({ displayName: "", telegramUsername: "", phone: "", email: "", website: "", description: "" });
      setNewChannelName("Telegram");
      setNewChannelValue("");
      setOwnerMemberId("");
      setAddingClient(false);
      await queryClient.invalidateQueries({ queryKey: telegramCrmKeys.contactLists() });
    },
  });
  useEffect(() => {
    if (me.isSuccess && !hasCrmView && canViewSales)
      router.replace("/ad-sales/sales");
  }, [canViewSales, hasCrmView, me.isSuccess, router]);
  const title = surface.kind === "inbox" ? "CRM inbox" : surface.kind === "analytics" ? "CRM analytics" : "CRM contacts";
  const subtitle =
    surface.kind === "inbox"
      ? "Unclassified Telegram conversations awaiting a deliberate action."
      : surface.kind === "analytics"
        ? "Client growth, buyers, conversion, and average order value."
      : "Customer relationships and account-specific Telegram conversations.";
  if (!me.data)
    return (
      <AppShell>
        <LoadingState text="Loading CRM access…" />
      </AppShell>
    );
  if (!hasCrmView)
    return (
      <AppShell>
        <p className="rounded-xl border border-amber-800 bg-amber-950/25 p-4 text-sm text-amber-200">
          CRM access is not enabled for this workspace role.
        </p>
      </AppShell>
    );
  return (
    <AppShell>
      <PageTabHead title="CRM" emoji="💬" color="#0f766e" />
      <PageHeader
        title={title}
        subtitle={`${subtitle}${unread.data?.total ? ` ${unread.data.total} unread.` : ""}`}
        action={
          <div className="flex flex-wrap gap-2">
            {surface.kind === "contacts" ? (
              <CrmAccountSyncPanel canEdit={permissions.canEditAll} />
            ) : null}
            {surface.kind === "contacts" && (permissions.canEditOwn || permissions.canEditAll) ? (
              <Button className="h-11" onClick={() => setAddingClient(true)}>
                <Plus size={18} /> Add client
              </Button>
            ) : null}
            <Link
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-500 whitespace-nowrap"
              href="/ad-sales/calendar?open=sell"
            >
              <Plus size={18} /> Sell ad
            </Link>
          </div>
        }
      />
      <CrmNavigation
        canViewInbox={permissions.canViewAll}
        canViewSales={canViewSales}
        inboxUnread={unread.data?.inbox}
      />
      {surface.kind === "contacts" ? (
        <CrmContactList
          initialContactId={surface.contactId}
          initialConversationId={surface.conversationId}
        />
      ) : null}
      {surface.kind === "inbox" ? (
        permissions.canViewAll ? (
          <CrmInbox
            canManage={permissions.canEditAll}
            canSendManual={permissions.canSendManual}
            conversationId={surface.conversationId}
            peerId={surface.peerId}
          />
        ) : (
          <p className="rounded-xl border border-amber-800 bg-amber-950/25 p-4 text-sm text-amber-200">
            Inbox requires permission to view all CRM contacts.
          </p>
        )
      ) : null}
      {surface.kind === "analytics" ? <CrmAnalytics /> : null}
      <Modal open={addingClient} onClose={() => setAddingClient(false)} title="Add client" size="md">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (clientForm.displayName.trim()) createClient.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {permissions.canEditAll ? (
              <div className="sm:col-span-2">
                <FormField label="Owner">
                  <MemberSelect
                    value={ownerMemberId}
                    onChange={setOwnerMemberId}
                    defaultToCurrent
                    allowAssignOthers
                  />
                </FormField>
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <div className="mb-1">
                <h3 className="text-sm font-semibold text-white">Contact channels</h3>
                <p className="text-xs text-neutral-500">Choose the first place where you contact this client. It becomes active.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
                <CustomSelect
                  value={newChannelName}
                  onChange={(value) => setNewChannelName(value as CrmContactChannelName)}
                  ariaLabel="Contact channel"
                  searchable={false}
                  options={(["Telegram", "Instagram", "WhatsApp", "Threads"] as CrmContactChannelName[]).map((channel) => ({
                    value: channel,
                    label: channel,
                    icon: <CrmContactChannelMark channel={channel} className="h-5 w-5" />,
                  }))}
                />
                <Input aria-label="Contact channel link" placeholder="Profile link or username" value={newChannelValue} onChange={(event) => setNewChannelValue(event.target.value)} />
              </div>
            </div>
            <FormField label="Name" required>
              <Input autoFocus required aria-label="Client name" value={clientForm.displayName} onChange={(event) => setClientForm((current) => ({ ...current, displayName: event.target.value }))} />
            </FormField>
            <FormField label="Telegram username">
              <Input aria-label="Telegram username" placeholder="username" value={clientForm.telegramUsername} onChange={(event) => setClientForm((current) => ({ ...current, telegramUsername: event.target.value }))} />
            </FormField>
            <FormField label="Phone">
              <Input aria-label="Phone" value={clientForm.phone} onChange={(event) => setClientForm((current) => ({ ...current, phone: event.target.value }))} />
            </FormField>
            <FormField label="Email">
              <Input aria-label="Email" type="email" value={clientForm.email} onChange={(event) => setClientForm((current) => ({ ...current, email: event.target.value }))} />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Website">
                <Input aria-label="Website" value={clientForm.website} onChange={(event) => setClientForm((current) => ({ ...current, website: event.target.value }))} />
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <FormField label="Description">
                <Textarea aria-label="Description" rows={3} value={clientForm.description} onChange={(event) => setClientForm((current) => ({ ...current, description: event.target.value }))} />
              </FormField>
            </div>
          </div>
          <p className="text-xs text-neutral-500">Tags and reminders can be added after creation.</p>
          {createClient.error ? <p className="text-sm text-rose-300">Client could not be created.</p> : null}
          <div className="flex justify-end"><Button type="submit" disabled={createClient.isPending || !clientForm.displayName.trim()}>{createClient.isPending ? "Adding…" : "Add client"}</Button></div>
        </form>
      </Modal>
    </AppShell>
  );
}
