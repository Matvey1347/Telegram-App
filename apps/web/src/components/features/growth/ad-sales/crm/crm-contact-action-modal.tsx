"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import type {
  CrmContactDetail,
  CrmContactStage,
} from "@telegram-system/shared";
import { authApi, workspaceMembersApi } from "@/lib/api";
import {
  Button,
  CustomSelect,
  EmptyState,
  LoadingState,
  Modal,
} from "@/components/ui/primitives";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import type { UpdateCrmContactPayload } from "@/lib/features/growth/telegram-crm-api";
import {
  patchCrmContactCaches,
  telegramCrmKeys,
} from "@/lib/features/growth/telegram-crm-query";
import { authKeys, memberKeys } from "@/lib/query-keys";
import { crmPermissions } from "./crm-permissions";
import { MemberSelect } from "@/components/features/workspace/member-select";
import {
  CrmConversations,
  CrmConversationsSkeleton,
} from "./crm-conversations";
import { CrmContactDeals } from "./crm-contact-deals";
import { CrmContactInfoForm } from "./crm-contact-info-form";
import { CrmContactNotes } from "./crm-contact-notes";
import { CrmContactTasks } from "./crm-contact-tasks";
import {
  crmContactStages,
  crmContactStagePresentation,
} from "./crm-contact-stage";

export type CrmContactAction =
  | "conversations"
  | "deals"
  | "tasks"
  | "notes"
  | "info";

export const crmContactActionLabels: Record<CrmContactAction, string> = {
  conversations: "Conversations",
  deals: "Deals",
  tasks: "Tasks",
  notes: "Notes / Activities",
  info: "Contact info",
};

const crmContactActionSizes: Record<CrmContactAction, "md" | "xl"> = {
  conversations: "xl",
  deals: "xl",
  tasks: "md",
  notes: "md",
  info: "md",
};

export function CrmContactActionModal({
  contactId,
  action,
  onClose,
  chatContactIds = [],
  onSelectChat,
}: {
  contactId: string;
  action: CrmContactAction;
  onClose: () => void;
  chatContactIds?: string[];
  onSelectChat?: (contactId: string) => void;
}) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: telegramCrmKeys.contactDetail(contactId),
    queryFn: ({ signal }) => telegramCrmApi.getContact(contactId, signal),
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
  const contact = detail.data;
  const visibleChatContactIds = chatContactIds.length
    ? chatContactIds
    : [contactId];
  const currentMemberId = members.data?.find(
    (member) => member.isCurrentUser,
  )?.id;
  const canEdit = Boolean(
    contact &&
    (permissions.canEditAll ||
      (permissions.canEditOwn && currentMemberId === contact.ownerMemberId)),
  );

  if (action === "conversations") {
    return (
      <aside
        role="dialog"
        aria-modal="false"
        aria-label="Contact conversations"
        className="fixed bottom-4 right-4 z-50 flex h-[min(720px,calc(100dvh-2rem))] w-[min(440px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-950 shadow-2xl"
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-neutral-800 px-3 py-2">
          <nav
            className="flex min-w-0 flex-1 gap-2 overflow-x-auto"
            aria-label="Open chats"
          >
            {visibleChatContactIds.map((id) => (
              <CrmChatTab
                key={id}
                contactId={id}
                active={id === contactId}
                onSelect={() => onSelectChat?.(id)}
              />
            ))}
          </nav>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden p-4">
          {detail.isLoading ? <CrmConversationsSkeleton /> : null}
          {detail.error || (!detail.isLoading && !contact) ? (
            <div>
              <EmptyState text="Contact could not be loaded." />
              <div className="mt-3 text-center">
                <Button variant="secondary" onClick={() => detail.refetch()}>
                  Retry
                </Button>
              </div>
            </div>
          ) : null}
          {contact ? (
            <CrmConversations contact={contact} canEditContact={canEdit} />
          ) : null}
        </div>
      </aside>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size={crmContactActionSizes[action]}
      title={
        contact ? (
          <span className="inline-flex min-w-0 items-center gap-2.5">
            <TelegramEntityAvatar
              imageUrl={contactAvatarUrl(contact)}
              alt=""
              kind="person"
              size="sm"
            />
            <span className="truncate">
              {contact.displayName.replace(/^@+/, "")} ·{" "}
              {crmContactActionLabels[action]}
            </span>
          </span>
        ) : (
          crmContactActionLabels[action]
        )
      }
    >
      {detail.isLoading ? <LoadingState text="Loading contact…" /> : null}
      {detail.error || (!detail.isLoading && !contact) ? (
        <div>
          <EmptyState text="Contact could not be loaded." />
          <div className="mt-3 text-center">
            <Button variant="secondary" onClick={() => detail.refetch()}>
              Retry
            </Button>
          </div>
        </div>
      ) : null}
      {contact ? (
        <ContactActionContent
          action={action}
          contact={contact}
          canEdit={canEdit}
          canViewSales={permissions.canViewSales}
          canEditAll={permissions.canEditAll}
          updatePending={update.isPending}
          updateError={Boolean(update.error)}
          onStageChange={(stage) => update.mutate({ stage })}
          onOwnerChange={(ownerMemberId) =>
            update.mutate({ ownerMemberId: ownerMemberId || null })
          }
          onInfoSave={(payload) => update.mutate(payload)}
        />
      ) : null}
    </Modal>
  );
}

function CrmChatTab({
  contactId,
  active,
  onSelect,
}: {
  contactId: string;
  active: boolean;
  onSelect: () => void;
}) {
  const contact = useQuery({
    queryKey: telegramCrmKeys.contactDetail(contactId),
    queryFn: ({ signal }) => telegramCrmApi.getContact(contactId, signal),
    staleTime: 60_000,
  });
  const account = contact.data?.conversationAccounts?.[0] ?? null;
  const contactLabel = contact.data?.displayName.replace(/^@+/, "") ?? "chat";
  const accountLabel = account
    ? account.username
      ? `@${account.username.replace(/^@+/, "")}`
      : account.label
    : "Telegram account";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={
        contact.isLoading
          ? "Loading chat"
          : `Open chat ${contactLabel} via ${accountLabel}`
      }
      aria-current={active ? "true" : undefined}
      title={`${contactLabel} · ${accountLabel}`}
      className={`flex shrink-0 items-center gap-1 rounded-xl border p-1.5 transition ${active ? "border-blue-500 bg-blue-950/30" : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"}`}
    >
      <TelegramEntityAvatar
        imageUrl={contact.data ? contactAvatarUrl(contact.data) : null}
        alt={contactLabel}
        kind="person"
        size="sm"
      />
      {account ? (
        <TelegramEntityAvatar
          imageUrl={account.photoUrl}
          alt={accountLabel}
          kind="mtproto"
          size="sm"
        />
      ) : null}
    </button>
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
  onStageChange,
  onOwnerChange,
  onInfoSave,
}: {
  action: CrmContactAction;
  contact: CrmContactDetail;
  canEdit: boolean;
  canViewSales: boolean;
  canEditAll: boolean;
  updatePending: boolean;
  updateError: boolean;
  onStageChange: (stage: CrmContactStage) => void;
  onOwnerChange: (memberId: string) => void;
  onInfoSave: (payload: UpdateCrmContactPayload) => void;
}) {
  if (action === "conversations") {
    return <CrmConversations contact={contact} canEditContact={canEdit} />;
  }
  if (action === "deals") {
    return canViewSales ? (
      <CrmContactDeals contact={contact} />
    ) : (
      <EmptyState text="You do not have access to Deals." />
    );
  }
  if (action === "tasks")
    return <CrmContactTasks contact={contact} canEdit={canEdit} />;
  if (action === "notes")
    return <CrmContactNotes contact={contact} canEdit={canEdit} />;
  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="grid gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3 sm:grid-cols-2">
          <CustomSelect
            value={contact.stage}
            disabled={updatePending}
            searchable={false}
            onChange={(stage) => onStageChange(stage as CrmContactStage)}
            options={crmContactStages.map((stage) => ({
              value: stage,
              label: crmContactStagePresentation(stage).label,
              tone: crmContactStagePresentation(stage).tone,
            }))}
          />
          {canEditAll ? (
            <MemberSelect
              allowAssignOthers
              value={contact.ownerMemberId ?? ""}
              onChange={onOwnerChange}
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
        key={contact.updatedAt}
        contact={contact}
        canEdit={canEdit}
        pending={updatePending}
        error={updateError}
        onSave={onInfoSave}
      />
    </div>
  );
}

function contactAvatarUrl(contact: CrmContactDetail) {
  const username = contact.telegramUsername?.replace(/^@+/, "");
  return (
    contact.peers[0]?.photoUrl ??
    (username ? `https://t.me/i/userpic/320/${username}.jpg` : undefined)
  );
}
