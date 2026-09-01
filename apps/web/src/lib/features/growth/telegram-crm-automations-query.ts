import type {
  CrmAutomationStatusResponse,
  CrmContactAutomationSettings,
  CrmContactDetail,
  CrmDealAutomationStatus,
  CrmWorkspaceSettings,
} from "@telegram-system/shared";
import type { QueryClient } from "@tanstack/react-query";
import { patchCrmContactCaches, telegramCrmKeys } from "./telegram-crm-query";
import { telegramCrmAutomationsApi } from "./telegram-crm-automations-api";

export function crmAutomationStatusQuery(contactId: string) {
  return {
    queryKey: telegramCrmKeys.automationStatus(contactId),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      telegramCrmAutomationsApi.getStatus({ contactId, limit: 50 }, signal),
    retry: false,
  } as const;
}

export function patchCrmWorkspaceAutomationCaches(
  queryClient: QueryClient,
  settings: CrmWorkspaceSettings,
) {
  queryClient.setQueryData(telegramCrmKeys.settings(), settings);
  queryClient.setQueriesData<CrmAutomationStatusResponse>(
    { queryKey: telegramCrmKeys.automationStatuses() },
    (current) =>
      current ? { ...current, workspace: settings.automation } : current,
  );
  void queryClient.invalidateQueries({
    queryKey: telegramCrmKeys.automationStatuses(),
    refetchType: "active",
  });
}

export function patchCrmContactAutomationCaches(
  queryClient: QueryClient,
  settings: CrmContactAutomationSettings,
) {
  queryClient.setQueryData<CrmAutomationStatusResponse>(
    telegramCrmKeys.automationStatus(settings.contactId),
    (current) => (current ? { ...current, contact: settings } : current),
  );
  patchCrmContactCaches(queryClient, {
    id: settings.contactId,
    automatedMessagesEnabled: settings.enabled,
    automatedMessagesEnabledAt: settings.enabledAt,
  });
  void queryClient.invalidateQueries({
    queryKey: telegramCrmKeys.automationStatus(settings.contactId),
    refetchType: "active",
  });
}

export function patchCrmDealAutomationCaches(
  queryClient: QueryClient,
  contactId: string,
  deal: CrmDealAutomationStatus,
) {
  queryClient.setQueryData<CrmAutomationStatusResponse>(
    telegramCrmKeys.automationStatus(contactId),
    (current) =>
      current
        ? {
            ...current,
            deals: current.deals.map((item) =>
              item.dealId === deal.dealId ? deal : item,
            ),
          }
        : current,
  );
  queryClient.setQueryData<CrmContactDetail>(
    telegramCrmKeys.contactDetail(contactId),
    (current) =>
      current
        ? {
            ...current,
            dealAutomation: current.dealAutomation.map((item) =>
              item.dealId === deal.dealId
                ? {
                    dealId: deal.dealId,
                    override: deal.override,
                    eligibleAt: deal.eligibleAt,
                  }
                : item,
            ),
          }
        : current,
  );
}
