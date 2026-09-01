import type {
  CrmAutomationLocale,
  CrmAutomationStatusResponse,
  CrmContactAutomationSettings,
  CrmDealAutomationStatus,
  CrmWorkspaceSettings,
  UpdateCrmContactAutomationPayload,
  UpdateCrmCustomerFollowUpPayload,
  UpdateCrmDealAutomationPayload,
} from "@telegram-system/shared";
import { api } from "@/lib/api";

export type UpdateCrmWorkspaceAutomationPayload = {
  customerTelegramAutomationsEnabled?: boolean;
  prePublicationReminderEnabled?: boolean;
  publishedLinksEnabled?: boolean;
  followUpEnabled?: boolean;
  automationLocale?: CrmAutomationLocale;
};

export const telegramCrmAutomationsApi = {
  getStatus: async (
    params: { contactId: string; dealId?: string; limit?: number },
    signal?: AbortSignal,
  ) =>
    (
      await api.get<CrmAutomationStatusResponse>(
        "/telegram-crm/automations/status",
        { params, signal },
      )
    ).data,
  updateWorkspace: async (payload: UpdateCrmWorkspaceAutomationPayload) =>
    (await api.patch<CrmWorkspaceSettings>("/telegram-crm/settings", payload))
      .data,
  updateContact: async (
    contactId: string,
    payload: UpdateCrmContactAutomationPayload,
  ) =>
    (
      await api.patch<CrmContactAutomationSettings>(
        `/telegram-crm/contacts/${contactId}/automation`,
        payload,
      )
    ).data,
  updateDeal: async (dealId: string, payload: UpdateCrmDealAutomationPayload) =>
    (
      await api.patch<CrmDealAutomationStatus>(
        `/telegram-crm/deals/${dealId}/automation`,
        payload,
      )
    ).data,
  updateDealFollowUp: async (
    dealId: string,
    payload: UpdateCrmCustomerFollowUpPayload,
  ) =>
    (
      await api.patch<CrmDealAutomationStatus>(
        `/telegram-crm/deals/${dealId}/automation/follow-up`,
        payload,
      )
    ).data,
};
