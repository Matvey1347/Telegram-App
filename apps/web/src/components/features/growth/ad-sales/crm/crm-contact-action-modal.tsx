"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { CrmConversations } from "./crm-conversations";
import { CrmAutomationSection } from "./crm-automation";
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
  | "info"
  | "automation";

export const crmContactActionLabels: Record<CrmContactAction, string> = {
  conversations: "Conversations",
  deals: "Deals",
  tasks: "Tasks",
  notes: "Notes / Activities",
  info: "Contact info",
  automation: "Automation",
};

export function CrmContactActionModal({
  contactId,
  action,
  onClose,
}: {
  contactId: string;
  action: CrmContactAction;
  onClose: () => void;
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
  const currentMemberId = members.data?.find(
    (member) => member.isCurrentUser,
  )?.id;
  const canEdit = Boolean(
    contact &&
    (permissions.canEditAll ||
      (permissions.canEditOwn && currentMemberId === contact.ownerMemberId)),
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
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
          canManageAutomation={permissions.canManageAutomation}
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

function ContactActionContent({
  action,
  contact,
  canEdit,
  canViewSales,
  canManageAutomation,
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
  canManageAutomation: boolean;
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
  if (action === "automation") {
    return (
      <CrmAutomationSection
        contact={contact}
        canManageWorkspace={canManageAutomation}
        canManageContact={canManageAutomation && canEdit}
      />
    );
  }
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
