"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CrmChatActionRequest, CrmChatCapabilities, CrmMessageListItem } from "@telegram-system/shared";
import { Button, Input, Modal } from "@/components/ui/primitives";
import { TelegramTextEditor } from "@/components/features/telegram/telegram/telegram-text-editor";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { messageEditorMarkup } from "./crm-chat-entities";

export type MessageActionSelection = { kind: CrmChatActionRequest["kind"]; message: CrmMessageListItem };
export function CrmMessageActionDialog({ selection, accountId, capabilities, pending, blocked, onClose, onExecute }: {
  selection: MessageActionSelection;
  accountId: string;
  capabilities?: CrmChatCapabilities;
  pending: boolean;
  blocked: boolean;
  onClose: () => void;
  onExecute: (body: Omit<CrmChatActionRequest, "operationId">) => Promise<boolean>;
}) {
  const { kind, message } = selection;
  const [text, setText] = useState(message.origin === "MANUAL" && !message.contentMetadata?.telegramText && !message.contentMetadata?.entities ? message.text ?? "" : messageEditorMarkup(message.text ?? "", message.contentMetadata?.entities));
  const [revoke, setRevoke] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const destinations = useQuery({ queryKey: telegramCrmKeys.forwardDestinations(accountId, page), queryFn: ({ signal }) => telegramCrmApi.listConversations({ accountId, page, pageSize: 50, state: "ACTIVE" }, signal), enabled: kind === "FORWARD", staleTime: 30_000 });
  const execute = async (body: Omit<CrmChatActionRequest, "operationId" | "kind" | "messageId">) => { if (await onExecute({ ...body, kind, messageId: message.id })) onClose(); };
  const title = kind === "EDIT" ? "Edit message" : kind === "DELETE" ? "Delete message" : kind === "REACTION" ? "Choose reaction" : "Forward message";
  return <Modal open onClose={() => { if (!pending) onClose(); }} title={title} size="md">
    {kind === "EDIT" ? <>
      <p className="mb-3 text-xs text-neutral-400">Your ordinary composer draft is preserved. Telegram checks current edit restrictions when you save.</p>
      <TelegramTextEditor value={text} onChange={setText} disabled={blocked} rows={4} singleRowToolbar characterCountLabel={(count) => `${count} / 4096`} />
      <Button disabled={blocked || !text.trim() || text.length > 4096} onClick={() => void execute({ text })}>Save changes</Button>
    </> : null}
    {kind === "DELETE" ? <>
      <p className="mb-4 text-sm text-neutral-200">Delete this message? This action cannot be undone. Removal for everyone is shown only after Telegram confirms it.</p>
      {capabilities?.canDeleteForEveryone ? <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={revoke} onChange={(event) => setRevoke(event.target.checked)} disabled={blocked} />Delete for everyone</label> : <p className="mb-4 text-xs text-neutral-400">Delete for me only.</p>}
      <Button disabled={blocked} onClick={() => void execute({ revoke })}>Confirm deletion</Button>
    </> : null}
    {kind === "REACTION" ? <>
      <div className="mb-3 flex flex-wrap gap-2">{capabilities?.reactionEmoji.map((emoji) => <Button key={emoji} variant="secondary" disabled={blocked} onClick={() => void execute({ emoji })} aria-label={`React ${emoji}`}>{emoji}</Button>)}</div>
      <Button variant="secondary" disabled={blocked} onClick={() => void execute({ emoji: null })}>Remove my reaction</Button>
      <p className="mt-3 text-xs text-neutral-400">Telegram decides which reactions this account and dialog allow. Counts update from Telegram.</p>
    </> : null}
    {kind === "FORWARD" ? <>
      <label className="mb-3 block text-sm">Search this page<Input value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      {destinations.isLoading ? <p role="status">Loading destinations…</p> : null}
      {destinations.error ? <div role="alert"><p>Destinations could not be loaded.</p><Button onClick={() => void destinations.refetch()}>Retry destinations</Button></div> : null}
      <div className="max-h-72 space-y-2 overflow-y-auto">{destinations.data?.items.filter((item) => item.id !== message.conversationId && item.mtprotoAccountId === accountId).filter((item) => [item.peer.firstName, item.peer.lastName, item.peer.username].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase())).map((item) => <Button key={item.id} className="w-full justify-start" variant="secondary" disabled={blocked} onClick={() => void execute({ destinationConversationId: item.id })}>{[item.peer.firstName, item.peer.lastName].filter(Boolean).join(" ") || item.peer.username || item.peer.telegramUserId}</Button>)}</div>
      {destinations.isSuccess && !destinations.data.items.length ? <p className="text-sm text-neutral-400">No permitted conversations.</p> : null}
      <div className="mt-3 flex items-center gap-2"><Button variant="secondary" disabled={page <= 1 || destinations.isFetching} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-xs">Page {page}</span><Button variant="secondary" disabled={!destinations.data?.pagination.hasNextPage || destinations.isFetching} onClick={() => setPage(page + 1)}>Next</Button></div>
    </> : null}
    {blocked ? <p role="status" className="mt-3 text-xs text-amber-300">{pending ? "Waiting for Telegram confirmation…" : "Result unknown. Check the operation result before another action."}</p> : null}
    <Button variant="secondary" className="mt-3" disabled={pending} onClick={onClose}>Cancel</Button>
  </Modal>;
}
