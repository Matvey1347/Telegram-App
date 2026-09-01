"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type {
  CrmInboxItem,
  CrmInboxPromotionStage,
} from "@telegram-system/shared";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { Button, EmptyState, LoadingState, Select } from "@/components/ui/primitives";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import {
  removeCrmInboxPeer,
  telegramCrmKeys,
} from "@/lib/features/growth/telegram-crm-query";
import { crmText } from "./crm-copy";
import { Pagination } from "@/components/ui/pagination";

const promotions: CrmInboxPromotionStage[] = [
  "LEAD",
  "QUALIFIED",
  "FOLLOW_UP",
  "CUSTOMER",
];

function peerName(item: CrmInboxItem) {
  const name = [item.peer.firstName, item.peer.lastName].filter(Boolean).join(" ");
  return name || (item.peer.username ? `@${item.peer.username}` : item.peer.telegramUserId);
}

function InboxRow({ item, canManage }: { item: CrmInboxItem; canManage: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<CrmInboxPromotionStage>("LEAD");
  const promote = useMutation({
    mutationFn: () => telegramCrmApi.promoteInboxPeer(item.peer.id, stage),
    onSuccess: (result) => {
      removeCrmInboxPeer(queryClient, item.peer.id);
      void queryClient.invalidateQueries({ queryKey: telegramCrmKeys.unread() });
      void queryClient.invalidateQueries({ queryKey: telegramCrmKeys.contactLists() });
      const conversationId = item.latestConversation?.id;
      router.push(
        conversationId
          ? `/ad-sales/contacts/${result.contact.id}/conversations/${conversationId}`
          : `/ad-sales/contacts/${result.contact.id}`,
      );
    },
  });
  const state = useMutation({
    mutationFn: (next: "IGNORED" | "ARCHIVED") =>
      telegramCrmApi.setInboxPeerState(item.peer.id, next),
    onSuccess: () => {
      removeCrmInboxPeer(queryClient, item.peer.id);
      void queryClient.invalidateQueries({ queryKey: telegramCrmKeys.unread() });
    },
  });
  return (
    <li className="rounded-xl border border-neutral-800 bg-neutral-900/55 p-4">
      <div className="flex items-start gap-3">
        <TelegramEntityAvatar imageUrl={item.peer.photoUrl ?? undefined} alt={peerName(item)} kind="person" size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-medium text-white">{peerName(item)}</h2>
            {item.unreadCount ? <span className="rounded-full bg-teal-500 px-2 py-0.5 text-[11px] font-semibold text-neutral-950">{item.unreadCount} unread</span> : null}
          </div>
          <p className="mt-1 text-sm text-neutral-400">
            {item.peer.username ? `@${item.peer.username.replace(/^@/, "")}` : `Telegram ${item.peer.telegramUserId}`}
          </p>
          <p className="mt-2 line-clamp-2 text-sm text-neutral-300">
            {item.latestConversation?.lastMessage?.text || "No message preview"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.conversations.map((conversation) => (
              <span key={conversation.id} className="rounded-md bg-neutral-800 px-2 py-1 text-[11px] text-neutral-300">
                via {conversation.account.username ? `@${conversation.account.username}` : conversation.account.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      {canManage ? <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-800 pt-3">
        <Select value={stage} onChange={(event) => setStage(event.target.value as CrmInboxPromotionStage)} aria-label={`Promote ${peerName(item)} as`}>
          {promotions.map((value) => <option key={value} value={value}>{value.replace("_", "-")}</option>)}
        </Select>
        <Button onClick={() => promote.mutate()} disabled={promote.isPending || state.isPending}>Promote</Button>
        <Button variant="secondary" onClick={() => state.mutate("IGNORED")} disabled={promote.isPending || state.isPending}>Ignore</Button>
        <Button variant="secondary" onClick={() => state.mutate("ARCHIVED")} disabled={promote.isPending || state.isPending}>Archive</Button>
        {promote.error || state.error ? <span className="text-xs text-rose-300">Action failed. Try again.</span> : null}
      </div> : <p className="mt-3 border-t border-neutral-800 pt-3 text-xs text-neutral-500">You have read-only access to this inbox.</p>}
    </li>
  );
}

export function CrmInbox({ canManage }: { canManage: boolean }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const params = { page, pageSize, state: "ACTIVE" as const };
  const query = useQuery({
    queryKey: telegramCrmKeys.inboxList(params),
    queryFn: ({ signal }) => telegramCrmApi.listInbox(params, signal),
    placeholderData: keepPreviousData,
  });
  if (query.isLoading) return <LoadingState text={crmText("states.loadingInbox")} />;
  if (query.error) return <div className="py-6 text-center"><EmptyState text="Inbox could not be loaded." /><Button className="mt-3" variant="secondary" onClick={() => query.refetch()}>Retry</Button></div>;
  if (!query.data?.items.length) return <EmptyState text={crmText("states.emptyInbox")} />;
  return <><ol className="space-y-3" aria-label="CRM inbox">{query.data.items.map((item) => <InboxRow key={item.peer.id} item={item} canManage={canManage} />)}</ol><Pagination {...query.data.pagination} onPageChange={setPage} onPageSizeChange={(size) => { setPage(1); setPageSize(size); }} loading={query.isFetching} /></>;
}
