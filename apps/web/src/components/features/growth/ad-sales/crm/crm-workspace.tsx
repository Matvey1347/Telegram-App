"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { PageTabHead } from "@/components/layout/page-tab-head";
import { Button, Input, LoadingState, Modal, PageHeader } from "@/components/ui/primitives";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { CrmContactList } from "./crm-contact-list";
import { CrmAccountSyncPanel } from "./crm-account-sync-panel";
import { CrmInbox } from "./crm-inbox";
import { CrmNavigation } from "./crm-navigation";
import type { AdSalesSurface } from "./crm-routes";
import { authApi } from "@/lib/api";
import { authKeys } from "@/lib/query-keys";
import { crmPermissions } from "./crm-permissions";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";

export function CrmWorkspace({
  surface,
}: {
  surface: Exclude<AdSalesSurface, { kind: "legacy" }>;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [addingClient, setAddingClient] = useState(false);
  const [clientName, setClientName] = useState("");
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
    mutationFn: () => telegramCrmApi.createContact({ displayName: clientName.trim() }),
    onSuccess: async () => {
      setClientName("");
      setAddingClient(false);
      await queryClient.invalidateQueries({ queryKey: telegramCrmKeys.contactLists() });
    },
  });
  useEffect(() => {
    if (me.isSuccess && !hasCrmView && canViewSales)
      router.replace("/ad-sales/sales");
  }, [canViewSales, hasCrmView, me.isSuccess, router]);
  const title = surface.kind === "inbox" ? "CRM inbox" : "CRM contacts";
  const subtitle =
    surface.kind === "inbox"
      ? "Unclassified Telegram conversations awaiting a deliberate action."
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
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-500"
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
      <Modal open={addingClient} onClose={() => setAddingClient(false)} title="Add client" size="sm">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (clientName.trim()) createClient.mutate();
          }}
        >
          <Input className="focus:ring-1" value={clientName} onChange={(event) => setClientName(event.target.value)} aria-label="Client name" placeholder="Client name" autoFocus required />
          <p className="text-xs text-neutral-500">You can add tags and a reminder after creating the client.</p>
          {createClient.error ? <p className="text-sm text-rose-300">Client could not be created.</p> : null}
          <div className="flex justify-end"><Button type="submit" disabled={createClient.isPending || !clientName.trim()}>{createClient.isPending ? "Adding…" : "Add client"}</Button></div>
        </form>
      </Modal>
    </AppShell>
  );
}
