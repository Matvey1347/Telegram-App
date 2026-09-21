"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { PageTabHead } from "@/components/layout/page-tab-head";
import { LoadingState, PageHeader } from "@/components/ui/primitives";
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
    </AppShell>
  );
}
