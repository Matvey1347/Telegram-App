"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CrmAutomationLocale,
  CrmAutomationOverride,
  CrmContactDetail,
  CrmCustomerAutomationType,
  UpdateCrmDealAutomationPayload,
} from "@telegram-system/shared";
import { Button, EmptyState, LoadingState } from "@/components/ui/primitives";
import { telegramCrmAutomationsApi } from "@/lib/features/growth/telegram-crm-automations-api";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import {
  crmAutomationStatusQuery,
  patchCrmContactAutomationCaches,
  patchCrmDealAutomationCaches,
  patchCrmWorkspaceAutomationCaches,
} from "@/lib/features/growth/telegram-crm-automations-query";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { CrmAutomationSettings } from "./crm-automation-settings";
import { CrmAutomationStatus } from "./crm-automation-status";

const workspaceTypeFields: Record<
  CrmCustomerAutomationType,
  "prePublicationReminderEnabled" | "publishedLinksEnabled" | "followUpEnabled"
> = {
  PRE_PUBLICATION_REMINDER: "prePublicationReminderEnabled",
  PUBLISHED_LINKS: "publishedLinksEnabled",
  FOLLOW_UP: "followUpEnabled",
};

export function CrmAutomationSection({
  contact,
  canManageWorkspace,
  canManageContact,
}: {
  contact: CrmContactDetail;
  canManageWorkspace: boolean;
  canManageContact: boolean;
}) {
  const queryClient = useQueryClient();
  const status = useQuery(crmAutomationStatusQuery(contact.id));
  const conversationParams = {
    contactId: contact.id,
    page: 1,
    pageSize: 50,
    state: "ACTIVE" as const,
  };
  const conversations = useQuery({
    queryKey: telegramCrmKeys.conversationList(conversationParams),
    queryFn: ({ signal }) =>
      telegramCrmApi.listConversations(conversationParams, signal),
    retry: false,
  });

  const workspaceUpdate = useMutation({
    mutationFn: telegramCrmAutomationsApi.updateWorkspace,
    onSuccess: (updated) =>
      patchCrmWorkspaceAutomationCaches(queryClient, updated),
  });
  const contactUpdate = useMutation({
    mutationFn: (payload: {
      enabled?: boolean;
      locale?: CrmAutomationLocale | null;
      typeOverrides?: Partial<
        Record<CrmCustomerAutomationType, CrmAutomationOverride>
      >;
    }) => telegramCrmAutomationsApi.updateContact(contact.id, payload),
    onSuccess: (updated) =>
      patchCrmContactAutomationCaches(queryClient, updated),
  });
  const dealUpdate = useMutation({
    mutationFn: ({
      dealId,
      payload,
    }: {
      dealId: string;
      payload: UpdateCrmDealAutomationPayload;
    }) => telegramCrmAutomationsApi.updateDeal(dealId, payload),
    onSuccess: (updated) =>
      patchCrmDealAutomationCaches(queryClient, contact.id, updated),
  });
  const followUpUpdate = useMutation({
    mutationFn: ({ dealId, dueAt }: { dealId: string; dueAt: string | null }) =>
      telegramCrmAutomationsApi.updateDealFollowUp(dealId, { dueAt }),
    onSuccess: (updated) =>
      patchCrmDealAutomationCaches(queryClient, contact.id, updated),
  });

  if (status.isLoading) {
    return <LoadingState text="Loading automation safety status…" />;
  }
  if (status.isError || !status.data) {
    return (
      <div>
        <EmptyState text="Automation settings and server status could not be loaded. No settings were changed; manual messages remain available." />
        <div className="mt-3 text-center">
          <Button variant="secondary" onClick={() => void status.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const mutationPending =
    workspaceUpdate.isPending ||
    contactUpdate.isPending ||
    dealUpdate.isPending ||
    followUpUpdate.isPending;

  return (
    <div className="space-y-4">
      <CrmAutomationSettings
        status={status.data}
        conversations={conversations.data?.items ?? []}
        conversationsLoading={conversations.isLoading}
        conversationsError={conversations.isError}
        canManageWorkspace={canManageWorkspace}
        canManageContact={canManageContact}
        pending={{
          workspace: workspaceUpdate.isPending,
          contact: contactUpdate.isPending,
          deal: dealUpdate.isPending,
          followUp: followUpUpdate.isPending,
        }}
        errors={{
          workspace: workspaceUpdate.isError,
          contact: contactUpdate.isError,
          deal: dealUpdate.isError,
          followUp: followUpUpdate.isError,
        }}
        onWorkspaceEnabled={async (enabled) => {
          await workspaceUpdate.mutateAsync({
            customerTelegramAutomationsEnabled: enabled,
          });
        }}
        onWorkspaceType={async (type, enabled) => {
          await workspaceUpdate.mutateAsync({
            [workspaceTypeFields[type]]: enabled,
          });
        }}
        onWorkspaceLocale={async (locale) => {
          await workspaceUpdate.mutateAsync({ automationLocale: locale });
        }}
        onContactEnabled={async (enabled) => {
          await contactUpdate.mutateAsync({ enabled });
        }}
        onContactLocale={async (locale) => {
          await contactUpdate.mutateAsync({ locale });
        }}
        onContactType={async (type, override) => {
          await contactUpdate.mutateAsync({
            typeOverrides: { [type]: override },
          });
        }}
        onDealUpdate={async (dealId, payload) => {
          await dealUpdate.mutateAsync({ dealId, payload });
        }}
        onFollowUp={async (dealId, dueAt) => {
          await followUpUpdate.mutateAsync({ dealId, dueAt });
        }}
        onRetryConversations={() => void conversations.refetch()}
      />
      <CrmAutomationStatus
        status={status.data}
        refreshing={status.isFetching || mutationPending}
        onRefresh={() => void status.refetch()}
      />
    </div>
  );
}
