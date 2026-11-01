"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Inbox, Search } from "lucide-react";
import type { CrmInboxFilter } from "@telegram-system/shared";
import { ChatShell } from "@/components/chat/chat-shell";
import { ChatDetailsPanel } from "@/components/chat/chat-details-panel";
import { ConversationList } from "@/components/chat/conversation-list";
import { Input } from "@/components/ui/primitives";
import { listCrmInboxConversations } from "@/lib/features/growth/crm-inbox-api";
import { useCrmInboxFolders } from "@/lib/features/growth/use-crm-inbox-folders";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { crmConversationTitle, toChatConversation } from "./crm-chat-adapter";
import { LeadInboxCandidates } from "./leads/lead-inbox-candidates";
import { CrmInboxConversation } from "./crm-inbox-conversation";
import { CrmInboxDetails } from "./crm-inbox-details";
import { CrmInboxFolders } from "./crm-inbox-folders";
import { useCrmSalesCopy } from "./crm-sales-copy";
import { useInboxViewport } from "./use-inbox-viewport";
import styles from "./crm-inbox.module.css";

const filters: Array<[CrmInboxFilter, string]> = [
  ["ALL", "All"], ["UNREAD", "Unread"], ["NEEDS_REPLY", "Needs reply"],
  ["AI_LEADS", "AI Leads"], ["FOLLOW_UP", "Follow-up"], ["ARCHIVED", "Archived"],
];

export function CrmInbox({ canManage, canSendManual, canViewSales = false, canEditOwn = false, currentMemberId, conversationId, peerId }: {
  canManage: boolean;
  canSendManual: boolean;
  canViewSales?: boolean;
  canEditOwn?: boolean;
  currentMemberId?: string;
  conversationId: string | null;
  peerId: string | null;
}) {
  const t = useCrmSalesCopy();
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<CrmInboxFilter>("ALL");
  const [folderId, setFolderId] = useState("");
  const folders = useCrmInboxFolders();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const viewport = useInboxViewport(Boolean(conversationId) && filter !== "AI_LEADS");
  // Only entries created here use history.back; deep links return directly to the list.
  const navigated = useRef(false);
  const detailNavigated = useRef(false);
  const detailsOpen = Boolean(conversationId && searchParams.get("details") === "1");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const params = useMemo(() => ({ filter, search: debouncedSearch || undefined, ...(folderId ? { folderId } : {}), limit: 50 }), [filter, debouncedSearch, folderId]);
  const list = useInfiniteQuery({
    queryKey: telegramCrmKeys.inboxConversationsList(params),
    queryFn: ({ pageParam, signal }) => listCrmInboxConversations(params, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.hasMore ? page.nextCursor : undefined,
    staleTime: 60_000,
    // A different folder/filter must never display the preceding list while loading.
    placeholderData: undefined,
    enabled: filter !== "AI_LEADS",
  });
  const items = useMemo(() => {
    const unique = new Map((list.data?.pages.flatMap((page) => page.items) ?? []).map((item) => [item.id, item]));
    return [...unique.values()].sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "") || b.id.localeCompare(a.id));
  }, [list.data]);
  const detail = useQuery({
    queryKey: telegramCrmKeys.conversationDetail(conversationId ?? "none"),
    queryFn: ({ signal }) => telegramCrmApi.getConversation(conversationId!, signal),
    enabled: Boolean(conversationId && detailsOpen && filter !== "AI_LEADS"), staleTime: 60_000,
  });
  const select = (id: string) => {
    if (id === conversationId) return;
    navigated.current = true;
    detailNavigated.current = false;
    // Replacing subsequent selections makes one browser Back return to the list.
    const href = `/ad-sales/inbox?conversationId=${encodeURIComponent(id)}`;
    if (conversationId) router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  };
  const closeDetails = () => {
    if (detailNavigated.current) { detailNavigated.current = false; router.back(); }
    else router.replace(`/ad-sales/inbox?conversationId=${encodeURIComponent(conversationId!)}`, { scroll: false });
  };
  const openDetails = () => {
    if (!conversationId || detailsOpen) return;
    detailNavigated.current = true;
    router.push(`/ad-sales/inbox?conversationId=${encodeURIComponent(conversationId)}&details=1`, { scroll: false });
  };
  const back = () => {
    if (navigated.current) { navigated.current = false; router.back(); }
    else router.replace("/ad-sales/inbox", { scroll: false });
  };
  const selectedItem = items.find((item) => item.id === conversationId);
  const selectedFolder = folders.data?.items.find((folder) => folder.id === folderId);
  const validDetail = detail.data && (!peerId || detail.data.telegramCrmPeerId === peerId);
  return <div ref={viewport} className={styles.inbox} data-selected={Boolean(conversationId) && filter !== "AI_LEADS"}>
    <ChatShell selected={Boolean(conversationId) && filter !== "AI_LEADS"} list={<div className={styles.listLayout}>
      <CrmInboxFolders folders={folders.data?.items ?? []} selectedId={folderId} totalUnread={folders.data?.totalUnread ?? null} loading={folders.isLoading} error={folders.isError} onRetry={() => void folders.refetch()} onSelect={(id) => { setFolderId(id); setFilter("ALL"); }} />
      <div className={styles.listContent}>
      <div className="shrink-0 space-y-3 border-b border-neutral-800 p-3">
        <div className="flex items-center gap-2"><Inbox size={19} className="text-blue-400" /><h2 className="font-semibold text-neutral-100">Inbox</h2><span className="ml-auto text-xs text-neutral-500">Telegram</span></div>
        {selectedFolder ? <p className="break-words text-xs text-neutral-400">{selectedFolder.name}</p> : null}
        <div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-neutral-500" /><Input className="pl-9" type="search" aria-label="Search conversations" placeholder="Search chats and clients" maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Inbox filters">{filters.map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value && (value !== "ALL" || !folderId)} onClick={() => { if (value === "ALL" || value === "UNREAD" || value === "AI_LEADS" || value === "ARCHIVED") setFolderId(""); setFilter(value); }} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition ${filter === value && (value !== "ALL" || !folderId) ? "border-blue-500 bg-blue-500/20 text-blue-200" : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"}`}>{label}{value === "UNREAD" && (folders.data?.totalUnread ?? 0) > 0 ? ` · ${folders.data!.totalUnread}` : ""}</button>)}</div>
      </div>
      {filter === "AI_LEADS" ? <LeadInboxCandidates search={debouncedSearch}/> : <ConversationList key={`${filter}:${folderId}:${debouncedSearch}`} items={items.map((item) => toChatConversation(item, t))} selectedId={conversationId} onSelect={select}
        onContextMenu={(id) => { setContextMenuId(id); select(id); }}
        loading={list.isLoading} error={Boolean(list.error)} onRetry={() => void list.refetch()}
        emptyText="No conversations match this view."
        hasMore={list.hasNextPage} loadingMore={list.isFetchingNextPage} onLoadMore={() => void list.fetchNextPage()} />}
      </div>
    </div>} thread={filter === "AI_LEADS" ? <div className="m-auto p-6 text-center text-sm text-neutral-400">Lead candidates are evidence records. Open a candidate for review; an existing CRM client link never fabricates a conversation.</div> : conversationId ? <CrmInboxConversation key={conversationId} conversationId={conversationId} peerId={peerId} detailsOpen={detailsOpen}
      canSendManual={canSendManual} workflowMenuOpen={contextMenuId === conversationId ? true : undefined} onWorkflowMenuOpenChange={(open) => { if (!open) setContextMenuId(null); }} displayName={selectedItem ? crmConversationTitle(selectedItem) : undefined} photoUrl={selectedItem?.peer.photoUrl} onBack={back} onOpenDetails={openDetails} /> : <div className="m-auto p-6 text-center"><Inbox size={36} className="mx-auto mb-4 text-neutral-600" /><h2 className="text-lg font-medium text-neutral-200">Your conversations, in one place</h2><p className="mt-2 text-sm text-neutral-500">Choose a conversation to read or reply.</p></div>}
      details={detailsOpen && filter !== "AI_LEADS" ? <ChatDetailsPanel title={selectedItem ? crmConversationTitle(selectedItem) : "Client details"} onClose={closeDetails}>
        {validDetail ? <CrmInboxDetails key={detail.data!.id} conversation={detail.data!} canManage={canManage} canEditOwn={canEditOwn} currentMemberId={currentMemberId} canViewSales={canViewSales} /> : <p className="text-sm text-neutral-400">{detail.error ? "Client details could not be loaded." : "Loading client details…"}</p>}
      </ChatDetailsPanel> : undefined} />
  </div>;
}
