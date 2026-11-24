"use client";

import { useEffect, useRef, useState, type ComponentProps, type FormEvent } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import type { ConsumerFinanceAssistantChat, ConsumerFinanceAssistantTurn } from "@telegram-system/shared";
import { FinanceAssistantDrawer } from "./finance-assistant-drawer";
import { GroshlyAssistantError } from "./groshly-assistant-feedback";
import { consumerFinanceAssistantApi as api } from "@consumer-finance/web/lib/api/consumer-finance-assistant-api";
import { consumerFinanceKeys as keys } from "@consumer-finance/web/lib/query/consumer-finance-query-keys";
import { groshlyAssistantChatCopy } from "@consumer-finance/web/components/i18n/assistant-chats";
import { groshlyAssistantCopy } from "@consumer-finance/web/components/i18n/assistant";

type Props = Pick<ComponentProps<typeof FinanceAssistantDrawer>, "botId" | "locale" | "timezone" | "onLedgerChange" | "onNavigate"> & { profileId: string };
type ChatAction = { id: string } & (
  | { kind: "rename"; title: string }
  | { kind: "move"; archived: boolean }
  | { kind: "delete" }
);

function chatIdFromUrl() {
  return typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("chat") ?? "";
}

export function GroshlyAssistantChats(props: Props) {
  const { botId, locale, profileId } = props;
  const copy = groshlyAssistantChatCopy(locale);
  const assistant = groshlyAssistantCopy(locale);
  const client = useQueryClient();
  const [selection, setSelection] = useState(() => ({ id: chatIdFromUrl(), fresh: false, version: 0 }));
  const draftIdentity = useRef<{ version: number; id: string }>(null);
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const listKey = keys.assistantChatList(botId, profileId, archived);
  const rootKey = keys.assistantChats(botId, profileId);
  const chats = useInfiniteQuery({
    queryKey: listKey,
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) => api.chats(botId, pageParam || undefined, signal, archived),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const rows = [...new Map(chats.data?.pages.flatMap((page) => page.items.map((chat) => [chat.id, chat] as const))).values()];
  const selectedRow = rows.find((chat) => chat.id === selection.id);
  const detail = useQuery({
    queryKey: keys.assistantChat(botId, profileId, selection.id),
    enabled: Boolean(selection.id && !selection.fresh && !selectedRow),
    queryFn: ({ signal }) => api.chat(botId, selection.id, signal),
    staleTime: 30_000,
    retry: false,
  });
  const current = selectedRow ?? detail.data;
  const writeUrl = (id: string, replace = false) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("chat", id);
    else url.searchParams.delete("chat");
    if (url.href !== window.location.href)
      window.history[replace ? "replaceState" : "pushState"](window.history.state, "", url);
  };
  const select = (id: string, replace = false) => {
    writeUrl(id, replace);
    setSelection((state) => ({ id, fresh: false, version: state.version + 1 }));
    setEditing(null);
    setConfirmDelete(null);
    setMobileOpen(false);
  };
  useEffect(() => {
    const onPop = () => {
      const id = chatIdFromUrl();
      setSelection((state) => state.id === id ? state : { id, fresh: false, version: state.version + 1 });
      setEditing(null);
      setConfirmDelete(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const createConversation = async (firstText: string, signal: AbortSignal) => {
    const title = Array.from(firstText.trim().replace(/\s+/gu, " ")).slice(0, 40).join("").trim();
    if (draftIdentity.current?.version !== selection.version)
      draftIdentity.current = { version: selection.version, id: crypto.randomUUID() };
    const chat = await api.createChat(botId, {
      title: title || copy.create,
      mode: "GENERAL",
      chatId: draftIdentity.current.id,
    }, signal);
    signal.throwIfAborted();
    client.setQueryData(keys.assistantChat(botId, profileId, chat.id), chat);
    writeUrl(chat.id, true);
    setArchived(false);
    setSelection((state) => ({ ...state, id: chat.id, fresh: true }));
    void client.invalidateQueries({ queryKey: rootKey });
    return chat.id;
  };
  const manage = useMutation({
    mutationFn: async (action: ChatAction) => {
      if (action.kind === "rename") return api.renameChat(botId, action.id, action.title);
      if (action.kind === "move") return api.moveChat(botId, action.id, action.archived);
      await api.deleteChat(botId, action.id);
      return null;
    },
    onSuccess: (chat, action) => {
      if (chat) client.setQueryData(keys.assistantChat(botId, profileId, chat.id), chat);
      else {
        client.removeQueries({ queryKey: keys.assistantChat(botId, profileId, action.id), exact: true });
        client.removeQueries({ queryKey: keys.assistantTurns(botId, profileId, action.id), exact: true });
      }
      if (action.kind === "delete" && chatIdFromUrl() === action.id) select("", true);
      setEditing(null);
      setConfirmDelete(null);
      void client.invalidateQueries({ queryKey: rootKey });
    },
  });
  const switchArchive = () => setArchived((value) => !value);
  const saveTitle = (event: FormEvent) => {
    event.preventDefault();
    if (editing?.title.trim() && !manage.isPending)
      manage.mutate({ kind: "rename", id: editing.id, title: editing.title.trim() });
  };

  return (
    <div className="groshly-assistant-chats">
      <button className="groshly-chat-mobile-toggle" type="button" onClick={() => setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen}>{copy.chats}</button>
      <aside className="groshly-chat-sidebar" data-open={mobileOpen} aria-label={copy.chats}>
        <div className="groshly-chat-toolbar">
          <button type="button" onClick={() => select("")}><MessageSquarePlus size={17} aria-hidden />{copy.create}</button>
          <button type="button" aria-pressed={archived} onClick={switchArchive}><Archive size={16} aria-hidden />{copy.archive}</button>
        </div>
        <div className="groshly-chat-list">
          {chats.isPending && <p role="status">{copy.loading}</p>}
          {chats.isError && <GroshlyAssistantError message={copy.loadError} retryLabel={assistant.retry} onRetry={() => void chats.refetch()} />}
          {!chats.isPending && !chats.isError && !rows.length && <p>{copy.noChats}</p>}
          {rows.map((chat) => (
            <div key={chat.id} className="groshly-chat-row" data-selected={chat.id === selection.id}>
              <button type="button" className="groshly-chat-select" aria-current={chat.id === selection.id ? "true" : undefined} onClick={() => select(chat.id)} title={chat.title}>{chat.title}</button>
              <button type="button" aria-label={copy.rename} disabled={manage.isPending} onClick={() => { manage.reset(); setConfirmDelete(null); setEditing(chat); }}><Pencil size={15} /></button>
              <button type="button" aria-label={archived ? copy.restore : copy.move} disabled={manage.isPending} onClick={() => manage.mutate({ kind: "move", id: chat.id, archived: !archived })}>{archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}</button>
              <button type="button" aria-label={copy.remove} disabled={manage.isPending} onClick={() => { manage.reset(); setEditing(null); setConfirmDelete(chat.id); }}><Trash2 size={15} /></button>
            </div>
          ))}
          {chats.hasNextPage && <button type="button" disabled={chats.isFetchingNextPage} onClick={() => void chats.fetchNextPage()}>{copy.moreChats}</button>}
        </div>
        {editing && (
          <form className="groshly-chat-toolbar groshly-chat-form" onSubmit={saveTitle}>
            <input autoFocus aria-label={copy.name} maxLength={80} required value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} />
            <button type="submit" disabled={manage.isPending || !editing.title.trim()}>{copy.save}</button>
            <button type="button" disabled={manage.isPending} onClick={() => setEditing(null)}>{copy.cancel}</button>
          </form>
        )}
        {confirmDelete && (
          <div className="groshly-chat-toolbar">
            <p>{copy.confirmRemove}</p>
            <button type="button" disabled={manage.isPending} onClick={() => manage.mutate({ kind: "delete", id: confirmDelete })}>{copy.remove}</button>
            <button type="button" disabled={manage.isPending} onClick={() => setConfirmDelete(null)}>{copy.cancel}</button>
          </div>
        )}
        {manage.isError && <GroshlyAssistantError message={copy.saveError} retryLabel={assistant.retry} />}
      </aside>
      <section className="groshly-chat-content">
        {selection.id && !current && !selection.fresh ? (
          detail.isError
            ? <GroshlyAssistantError message={copy.loadError} retryLabel={copy.create} onRetry={() => select("", true)} />
            : <p role="status">{copy.loading}</p>
        ) : <ChatTranscript key={selection.version} {...props} chat={current} fresh={selection.fresh} createConversation={createConversation} />}
      </section>
    </div>
  );
}

function ChatTranscript({ chat, fresh, createConversation, profileId, ...props }: Props & {
  chat?: ConsumerFinanceAssistantChat;
  fresh: boolean;
  createConversation: NonNullable<ComponentProps<typeof FinanceAssistantDrawer>["createConversation"]>;
}) {
  const { botId, locale } = props;
  const client = useQueryClient();
  const copy = groshlyAssistantChatCopy(locale);
  const assistant = groshlyAssistantCopy(locale);
  const chatId = chat?.id ?? "";
  const key = keys.assistantTurns(botId, profileId, chatId);
  const turns = useInfiniteQuery({
    queryKey: key,
    enabled: Boolean(chatId && !fresh),
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) => api.turns(botId, chatId, pageParam || undefined, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  if (chatId && !fresh && turns.isPending) return <p role="status">{copy.loading}</p>;
  if (chatId && !fresh && !turns.data) return <GroshlyAssistantError message={copy.loadError} retryLabel={assistant.retry} onRetry={() => void turns.refetch()} />;
  const [latest, ...older] = turns.data?.pages ?? [];
  return <FinanceAssistantDrawer {...props} open onOpenChange={() => {}} presentation="groshly" createConversation={createConversation} conversation={chat && {
    id: chat.id,
    mode: chat.mode,
    initialMessages: transcriptMessages(latest?.items ?? [], assistant.proposal),
    olderMessages: transcriptMessages(older.flatMap((page) => page.items), assistant.proposal),
    loadEarlier: turns.hasNextPage ? () => void turns.fetchNextPage() : undefined,
    loadingEarlier: turns.isFetchingNextPage,
    loadEarlierLabel: copy.earlier,
    onChanged: () => {
      void client.invalidateQueries({ queryKey: key, refetchType: "none" });
      void client.invalidateQueries({ queryKey: keys.assistantChats(botId, profileId) });
    },
  }} />;
}

function transcriptMessages(rows: ConsumerFinanceAssistantTurn[], proposal: string) {
  return [...rows].reverse().flatMap((turn) => [
    { id: `${turn.id}-user`, role: "user" as const, text: turn.userText, replyTo: turn.replyTo ?? undefined },
    ...(turn.assistantText !== null ? [{ id: `${turn.id}-assistant`, role: "assistant" as const, text: turn.assistantText || proposal }] : []),
  ]);
}
