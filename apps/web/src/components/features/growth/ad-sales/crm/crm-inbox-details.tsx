"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmConversationListItem } from "@telegram-system/shared";
import { Button } from "@/components/ui/primitives";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { patchInboxConversation } from "@/lib/features/growth/crm-inbox-cache";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { CrmContactNotes } from "./crm-contact-notes";
import { CrmSalesControls } from "./crm-sales-controls";
import { CrmInboxPurchases } from "./crm-inbox-purchases";
import { useCrmSalesCopy } from "./crm-sales-copy";

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
  const t = useCrmSalesCopy();
  const client = useQueryClient();
  const contactId = conversation.contactId;
  const contact = useQuery({
    queryKey: telegramCrmKeys.chatContext(contactId ?? "unassigned"),
    queryFn: ({ signal }) => telegramCrmApi.getChatContext(contactId!, signal),
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
  const username = (
    contact.data?.telegramUsername || conversation.peer.username
  )?.replace(/^@/, "");
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
        <h3 className="font-medium text-neutral-200">
          {t("crmSales.contacts")}
        </h3>
        {username ? (
          <a
            className="inline-flex min-h-10 items-center break-all text-blue-300"
            href={`https://t.me/${encodeURIComponent(username)}`}
            target="_blank"
            rel="noreferrer"
          >
            @{username}
          </a>
        ) : (
          <p className="text-xs text-neutral-500">
            Публичный контакт Telegram не указан.
          </p>
        )}
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
            Свяжите переписку с клиентом, чтобы добавлять заметки и планировать
            контакт.
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
          <CrmSalesControls conversationId={conversation.id} />
          <section className="space-y-3 border-t border-neutral-800 pt-3">
            <h3 className="font-medium text-neutral-200">Заметки и история</h3>
            <CrmContactNotes contact={{ id: contactId }} canEdit={canEdit} />
          </section>
          {canViewSales ? (
            <section className="space-y-3 border-t border-neutral-800 pt-3">
              <h3 className="font-medium text-neutral-200">
                {t("crmSales.purchases")}
              </h3>
              <CrmInboxPurchases
                contactId={contactId}
                conversationId={conversation.id}
                workspaceId={conversation.workspaceId}
              />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
