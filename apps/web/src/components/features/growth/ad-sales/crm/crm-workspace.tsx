"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CrmConversationListItem,
  CrmConversationsListResult,
  CrmRealtimeEvent,
} from "@telegram-system/shared";
import { AppShell } from "@/components/layout/app-shell";
import { PageTabHead } from "@/components/layout/page-tab-head";
import { LoadingState, PageHeader } from "@/components/ui/primitives";
import {
  appendCrmMessage,
  patchCrmConversation,
  reconcileCrmConversationUnread,
  telegramCrmKeys,
} from "@/lib/features/growth/telegram-crm-query";
import { useTelegramCrmRealtime } from "@/lib/features/growth/use-telegram-crm-realtime";
import { CrmContactList } from "./crm-contact-list";
import { CrmInbox } from "./crm-inbox";
import { CrmNavigation } from "./crm-navigation";
import type { AdSalesSurface } from "./crm-routes";
import { authApi } from "@/lib/api";
import { authKeys } from "@/lib/query-keys";
import { crmPermissions } from "./crm-permissions";
import { patchCrmContactCaches } from "@/lib/features/growth/telegram-crm-query";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";

export function CrmWorkspace({
  surface,
}: {
  surface: Exclude<AdSalesSurface, { kind: "legacy" }>;
}) {
  const queryClient = useQueryClient();
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
  const onEvent = useCallback(
    (event: CrmRealtimeEvent) => {
      if (event.type === "message.received" || event.type === "message.sent") {
        const listedConversation = queryClient
          .getQueriesData<CrmConversationsListResult>({
            queryKey: telegramCrmKeys.conversationLists(),
          })
          .flatMap(([, data]) => data?.items ?? [])
          .find((item) => item.id === event.conversationId);
        const conversation =
          listedConversation ??
          queryClient.getQueryData<CrmConversationListItem>(
            telegramCrmKeys.conversationDetail(event.conversationId),
          );
        if (
          conversation &&
          queryClient.getQueryState(
            telegramCrmKeys.messagesInfinite(event.conversationId),
          )
        ) {
          appendCrmMessage(queryClient, event.conversationId, {
            ...event.message,
            account: conversation.account,
          });
        }
        patchCrmConversation(queryClient, event.conversationId, {
          lastMessageAt: event.message.sentAt,
          ...(event.message.direction === "INBOUND"
            ? { lastInboundAt: event.message.sentAt }
            : { lastOutboundAt: event.message.sentAt }),
        });
        if (event.contactId) {
          patchCrmContactCaches(queryClient, {
            id: event.contactId,
            lastMessage: {
              id: event.message.id,
              conversationId: event.conversationId,
              direction: event.message.direction,
              origin: event.message.origin,
              text: event.message.text,
              sentAt: event.message.sentAt,
              readState: event.message.readState,
            },
            lastContactAt: event.message.sentAt,
          });
        }
        return;
      }
      if (
        event.type === "conversation.unreadChanged" ||
        event.type === "readChanged"
      ) {
        reconcileCrmConversationUnread(
          queryClient,
          event.conversationId,
          event.contactId,
          event.unreadCount,
        );
        void queryClient.invalidateQueries({
          queryKey: telegramCrmKeys.unread(),
        });
        return;
      }
      if (event.type === "contact.updated") {
        void queryClient.invalidateQueries({
          queryKey: telegramCrmKeys.contactDetail(event.contactId),
        });
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: telegramCrmKeys.inboxLists(),
      });
    },
    [queryClient],
  );
  const realtimeStatus = useTelegramCrmRealtime({
    active: hasCrmView,
    onEvent,
    onReconnect: () => {
      if (surface.kind === "inbox") {
        void queryClient.invalidateQueries({
          queryKey: telegramCrmKeys.inboxLists(),
        });
      } else {
        void queryClient.invalidateQueries({
          queryKey: telegramCrmKeys.contactLists(),
        });
      }
      void queryClient.invalidateQueries({
        queryKey: telegramCrmKeys.unread(),
      });
    },
  });
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
      />
      {realtimeStatus === "paused" ? (
        <p className="mb-3 rounded-lg border border-amber-800 bg-amber-950/25 p-3 text-xs text-amber-200">
          Live CRM updates are paused after repeated connection failures. Reload
          to reconnect; cached data remains available.
        </p>
      ) : null}
      <CrmNavigation
        canViewInbox={permissions.canViewAll}
        canViewSales={canViewSales}
        inboxUnread={unread.data?.inbox}
      />
      {surface.kind === "contacts" ? <CrmContactList /> : null}
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
