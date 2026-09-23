"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type {
  CrmContactDetail,
  CrmContactListItem,
} from "@telegram-system/shared";
import { authApi, workspaceMembersApi } from "@/lib/api";
import { authKeys, memberKeys } from "@/lib/query-keys";
import {
  telegramCrmApi,
  type UpdateCrmContactPayload,
} from "@/lib/features/growth/telegram-crm-api";
import {
  patchCrmContactCaches,
  telegramCrmKeys,
} from "@/lib/features/growth/telegram-crm-query";
import {
  Button,
  EmptyState,
  LoadingState,
  Modal,
} from "@/components/ui/primitives";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { MemberSelect } from "@/components/features/workspace/member-select";
import { CrmChatWindow } from "./crm-chat-window";
import type { CrmContactChatPreview } from "./crm-contact-chat-preview";
import { CrmContactDeals } from "./crm-contact-deals";
import { CrmContactInfoForm } from "./crm-contact-info-form";
import { CrmContactTagsEditor } from "./crm-contact-tags-editor";
import { CrmContactTasks } from "./crm-contact-tasks";
import { crmPermissions } from "./crm-permissions";

export type CrmContactAction =
  | "conversations"
  | "deals"
  | "reminder"
  | "tags"
  | "info";

export const crmContactActionLabels: Record<CrmContactAction, string> = {
  conversations: "Conversations",
  deals: "Deals",
  reminder: "Reminder",
  tags: "Tags",
  info: "Contact info",
};

const crmContactActionSizes: Record<
  Exclude<CrmContactAction, "conversations">,
  "md" | "xl"
> = {
  deals: "xl",
  reminder: "md",
  tags: "md",
  info: "md",
};

type Props = {
  contactId: string;
  action: CrmContactAction;
  onClose: () => void;
  chatContactIds?: string[];
  chatPreviews?: Record<string, CrmContactChatPreview>;
  onSelectChat?: (contactId: string) => void;
  onMinimize?: () => void;
  initialConversationId?: string;
  initialContact?: CrmContactListItem;
};

export function CrmContactActionModal(props: Props) {
  if (props.action === "conversations") {
    return (
      <CrmChatWindow
        contactId={props.contactId}
        chatContactIds={props.chatContactIds ?? []}
        chatPreviews={props.chatPreviews}
        onSelectChat={props.onSelectChat}
        onMinimize={props.onMinimize}
        initialConversationId={props.initialConversationId}
        onClose={props.onClose}
      />
    );
  }
  return <CrmContactDetailActionModal {...props} action={props.action} />;
}

function CrmContactDetailActionModal({
  contactId,
  action,
  onClose,
  initialContact,
}: Props & { action: Exclude<CrmContactAction, "conversations"> }) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: telegramCrmKeys.contactDetail(contactId),
    queryFn: ({ signal }) => telegramCrmApi.getContact(contactId, signal),
    enabled:
      !initialContact || (action !== "tags" && action !== "reminder"),
    retry: false,
  });
  const me = useQuery({
    queryKey: authKeys.me(),
    queryFn: authApi.me,
    staleTime: 5 * 60_000,
  });
  const members = useQuery({
    queryKey: memberKeys.membersSelect(),
    queryFn: workspaceMembersApi.select,
  });
  const permissions = crmPermissions(me.data?.workspace.access);
  const update = useMutation({
    mutationFn: (payload: UpdateCrmContactPayload) =>
      telegramCrmApi.updateContact(contactId, payload),
    onSuccess: (contact) => {
      patchCrmContactCaches(queryClient, contact);
      void queryClient.invalidateQueries({
        queryKey: telegramCrmKeys.contactDetail(contactId),
      });
    },
  });
  const syncTelegram = useMutation({
    mutationFn: (reference: string) =>
      telegramCrmApi.syncTelegramContact(contactId, reference),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: telegramCrmKeys.contactDetail(contactId),
      });
      await queryClient.invalidateQueries({ queryKey: telegramCrmKeys.contactLists() });
    },
  });
  const contact = detail.data;
  const headerContact = contact ?? initialContact;
  const currentMemberId = members.data?.find(
    (member) => member.isCurrentUser,
  )?.id;
  const canEdit = Boolean(
    headerContact &&
    (permissions.canEditAll ||
      (permissions.canEditOwn && currentMemberId === headerContact.ownerMemberId)),
  );
  return (
    <Modal
      open
      onClose={onClose}
      size={crmContactActionSizes[action]}
      title={
        headerContact ? (
          <span className="inline-flex min-w-0 items-center gap-2.5">
            <TelegramEntityAvatar
              imageUrl={contactAvatarUrl(headerContact)}
              alt=""
              kind="person"
              size="sm"
            />
            <span className="truncate">
              {headerContact.displayName.replace(/^@+/, "")} ·{" "}
              {crmContactActionLabels[action]}
            </span>
          </span>
        ) : (
          crmContactActionLabels[action]
        )
      }
    >
      {detail.isLoading && !initialContact ? <LoadingState text="Loading contact…" /> : null}
      {detail.error || (!detail.isLoading && !contact && !initialContact) ? (
        <div>
          <EmptyState text="Contact could not be loaded." />
          <div className="mt-3 text-center">
            <Button variant="secondary" onClick={() => detail.refetch()}>
              Retry
            </Button>
          </div>
        </div>
      ) : null}
      {action === "tags" && initialContact ? (
        <CrmContactTagsEditor contact={initialContact} canEdit={canEdit} />
      ) : null}
      {action === "reminder" && initialContact ? (
        <CrmContactTasks contact={initialContact} canEdit={canEdit} />
      ) : null}
      {contact && action !== "tags" ? (
        <ContactActionContent
          action={action}
          contact={contact}
          canEdit={canEdit}
          canViewSales={permissions.canViewSales}
          canEditAll={permissions.canEditAll}
          updatePending={update.isPending}
          updateError={Boolean(update.error)}
          onInfoSave={(payload) => update.mutate(payload)}
          onSyncTelegram={(reference) => syncTelegram.mutate(reference)}
        />
      ) : null}
    </Modal>
  );
}

function ContactActionContent({
  action,
  contact,
  canEdit,
  canViewSales,
  canEditAll,
  updatePending,
  updateError,
  onInfoSave,
  onSyncTelegram,
}: {
  action: Exclude<CrmContactAction, "conversations">;
  contact: CrmContactDetail;
  canEdit: boolean;
  canViewSales: boolean;
  canEditAll: boolean;
  updatePending: boolean;
  updateError: boolean;
  onInfoSave: (payload: UpdateCrmContactPayload) => void;
  onSyncTelegram: (reference: string) => void;
}) {
  const [ownerMemberId, setOwnerMemberId] = useState(
    () => contact.ownerMemberId ?? "",
  );
  if (action === "deals")
    return canViewSales ? (
      <CrmContactDeals contact={contact} />
    ) : (
      <EmptyState text="You do not have access to Deals." />
    );
  if (action === "tags")
    return <CrmContactTagsEditor contact={contact} canEdit={canEdit} />;
  if (action === "reminder")
    return <CrmContactTasks contact={contact} canEdit={canEdit} />;
  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="grid gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3 sm:grid-cols-2">
          {canEditAll ? (
            <MemberSelect
              allowAssignOthers
              value={ownerMemberId}
              onChange={setOwnerMemberId}
            />
          ) : (
            <span className="self-center text-sm text-neutral-500">
              Owner: {contact.ownerMember?.name || "Unassigned"}
            </span>
          )}
          {updateError ? (
            <p className="text-xs text-rose-300 sm:col-span-2">
              Contact changes could not be saved.
            </p>
          ) : null}
        </div>
      ) : null}
      <CrmContactInfoForm
        contact={contact}
        canEdit={canEdit}
        pending={updatePending}
        error={updateError}
        onSave={(payload) =>
          onInfoSave({
            ...payload,
            ...(canEditAll ? { ownerMemberId: ownerMemberId || null } : {}),
          })
        }
        onSyncTelegram={onSyncTelegram}
      />
    </div>
  );
}

function contactAvatarUrl(
  contact:
    | Pick<CrmContactDetail, "telegramUsername" | "peers">
    | Pick<CrmContactListItem, "telegramUsername" | "peer">,
) {
  const username = contact.telegramUsername?.replace(/^@+/, "");
  const photoUrl = "peers" in contact ? contact.peers[0]?.photoUrl : contact.peer?.photoUrl;
  return (
    photoUrl ??
    (username ? `https://t.me/i/userpic/320/${username}.jpg` : undefined)
  );
}
