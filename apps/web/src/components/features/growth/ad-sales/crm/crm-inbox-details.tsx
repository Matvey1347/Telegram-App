"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmConversationListItem } from "@telegram-system/shared";
import { Button } from "@/components/ui/primitives";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { patchInboxConversation } from "@/lib/features/growth/crm-inbox-cache";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { CrmContactNotes } from "./crm-contact-notes";
import { CrmContactTagsEditor } from "./crm-contact-tags-editor";
import { CrmInboxPurchases } from "./crm-inbox-purchases";

export function CrmInboxDetails({
  conversation,
  canManage,
  canViewSales,
  canEditOwn = false,
  currentMemberId,
}: {
  conversation: CrmConversationListItem;
  canManage: boolean;
  canViewSales: boolean;
  canEditOwn?: boolean;
  currentMemberId?: string;
}) {
  const client = useQueryClient();
  const contactId = conversation.contactId;
  const contact = useQuery({
    queryKey: telegramCrmKeys.chatContext(contactId ?? "unassigned"),
    queryFn: ({ signal }) => telegramCrmApi.getChatContext(contactId!, signal),
    enabled: Boolean(contactId),
    staleTime: 60_000,
  });
  const tagContact = useQuery({
    queryKey: telegramCrmKeys.contactDetail(contactId ?? "unassigned"),
    queryFn: ({ signal }) => telegramCrmApi.getContact(contactId!, signal),
    enabled: Boolean(contactId),
    staleTime: 60_000,
  });
  const promote = useMutation({
    mutationFn: () =>
      telegramCrmApi.promoteInboxPeer(conversation.telegramCrmPeerId, "LEAD"),
    onSuccess: (result) => {
      client.setQueryData(telegramCrmKeys.conversationDetail(conversation.id), {
        ...conversation,
        contactId: result.contact.id,
      });
      patchInboxConversation(client, conversation.id, {
        contact: {
          id: result.contact.id,
          displayName: result.contact.displayName,
          stage: result.contact.stage,
          nextContactAt: result.contact.nextContactAt,
        },
      });
      void client.invalidateQueries({
        queryKey: telegramCrmKeys.contactLists(),
      });
    },
  });
  const canEdit =
    canManage ||
    Boolean(
      canEditOwn &&
      currentMemberId &&
      contact.data?.ownerMemberId === currentMemberId,
    );
  return (
    <div className="space-y-4 text-sm">
      {contact.data?.displayName ? (
        <span className="sr-only">{contact.data.displayName}</span>
      ) : null}
      <section className="space-y-2">
        {contact.error ? (
          <p role="alert" className="text-xs text-amber-200">
            Не удалось обновить данные клиента.{" "}
            <button
              className="text-blue-300"
              onClick={() => void contact.refetch()}
            >
              Повторить
            </button>
          </p>
        ) : null}
      </section>
      {!contactId ? (
        <div className="space-y-3">
          <p className="text-xs text-neutral-400">
            Свяжите переписку с клиентом, чтобы добавлять заметки и теги.
          </p>
          {canManage ? (
            <Button
              disabled={promote.isPending}
              onClick={() => promote.mutate()}
            >
              Create CRM client
            </Button>
          ) : null}
          {promote.error ? (
            <p role="alert" className="text-xs text-rose-300">
              Client could not be created. Try again.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          {tagContact.data ? <CrmContactTagsEditor key={tagContact.data.id} contact={tagContact.data} canEdit={canEdit} /> : tagContact.error ? <p role="alert">Не удалось загрузить теги. <button onClick={() => void tagContact.refetch()} className="text-blue-300">Повторить</button></p> : <p role="status">Загрузка тегов…</p>}
          <section className="space-y-3 border-t border-neutral-800 pt-3">
            <h3 className="font-medium text-neutral-200">Заметки и история</h3>
            <CrmContactNotes contact={{ id: contactId }} canEdit={canEdit} />
          </section>
          {canViewSales ? (
            <CrmInboxPurchases
                contactId={contactId}
                conversationId={conversation.id}
                workspaceId={conversation.workspaceId}
              />
          ) : null}
        </>
      )}
    </div>
  );
}
