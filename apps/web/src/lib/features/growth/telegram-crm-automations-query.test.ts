import { QueryClient } from "@tanstack/react-query";
import type {
  CrmContactDetail,
  CrmWorkspaceSettings,
} from "@telegram-system/shared";
import { describe, expect, it } from "vitest";
import { automationStatusFixture } from "@/components/features/growth/ad-sales/crm/crm-automation-test-fixtures";
import {
  crmAutomationStatusQuery,
  patchCrmContactAutomationCaches,
  patchCrmDealAutomationCaches,
  patchCrmWorkspaceAutomationCaches,
} from "./telegram-crm-automations-query";
import { telegramCrmKeys } from "./telegram-crm-query";

describe("CRM automation query and cache contract", () => {
  it("uses a narrow Contact status key with no polling option", () => {
    const first = crmAutomationStatusQuery("contact-1");
    const second = crmAutomationStatusQuery("contact-2");
    expect(first.queryKey).toEqual([
      "telegram-crm",
      "automations",
      "status",
      "contact-1",
    ]);
    expect(first.queryKey).not.toEqual(second.queryKey);
    expect(first).not.toHaveProperty("refetchInterval");
  });

  it("patches authoritative fields and invalidates server-evaluated readiness", () => {
    const queryClient = new QueryClient();
    const first = automationStatusFixture();
    const second = automationStatusFixture();
    second.contact = { ...second.contact, contactId: "contact-2" };
    queryClient.setQueryData(
      telegramCrmKeys.automationStatus("contact-1"),
      first,
    );
    queryClient.setQueryData(
      telegramCrmKeys.automationStatus("contact-2"),
      second,
    );
    queryClient.setQueryData<CrmContactDetail>(
      telegramCrmKeys.contactDetail("contact-1"),
      { id: "contact-1", automatedMessagesEnabled: false } as CrmContactDetail,
    );

    const workspaceSettings: CrmWorkspaceSettings = {
      workspaceId: "workspace-1",
      defaultCrmSenderAccountId: null,
      automation: {
        ...first.workspace,
        customerTelegramAutomationsEnabled: true,
        customerTelegramAutomationsEnabledAt: "2026-09-01T12:00:00.000Z",
      },
      createdAt: null,
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    patchCrmWorkspaceAutomationCaches(queryClient, workspaceSettings);
    patchCrmContactAutomationCaches(queryClient, {
      ...first.contact,
      enabled: true,
      enabledAt: "2026-09-01T12:05:00.000Z",
    });

    expect(
      queryClient.getQueryData<CrmWorkspaceSettings>(
        telegramCrmKeys.settings(),
      ),
    ).toBe(workspaceSettings);
    expect(
      queryClient.getQueryData<typeof first>(
        telegramCrmKeys.automationStatus("contact-2"),
      )?.workspace.customerTelegramAutomationsEnabled,
    ).toBe(true);
    expect(
      queryClient.getQueryData<typeof first>(
        telegramCrmKeys.automationStatus("contact-1"),
      )?.contact.enabled,
    ).toBe(true);
    expect(
      queryClient.getQueryData<CrmContactDetail>(
        telegramCrmKeys.contactDetail("contact-1"),
      )?.automatedMessagesEnabled,
    ).toBe(true);
    expect(
      queryClient.getQueryState(telegramCrmKeys.automationStatus("contact-1"))
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(telegramCrmKeys.automationStatus("contact-2"))
        ?.isInvalidated,
    ).toBe(true);
  });

  it("patches only the authoritative Deal in status and Contact detail", () => {
    const queryClient = new QueryClient();
    const status = automationStatusFixture();
    queryClient.setQueryData(
      telegramCrmKeys.automationStatus("contact-1"),
      status,
    );
    queryClient.setQueryData<CrmContactDetail>(
      telegramCrmKeys.contactDetail("contact-1"),
      {
        id: "contact-1",
        dealAutomation: status.deals.map(
          ({ dealId, override, eligibleAt }) => ({
            dealId,
            override,
            eligibleAt,
          }),
        ),
      } as CrmContactDetail,
    );
    const updated = {
      ...status.deals[0]!,
      override: "ENABLED" as const,
      eligibleAt: "2026-09-01T12:10:00.000Z",
    };

    patchCrmDealAutomationCaches(queryClient, "contact-1", updated);

    expect(
      queryClient.getQueryData<typeof status>(
        telegramCrmKeys.automationStatus("contact-1"),
      )?.deals[0],
    ).toEqual(updated);
    expect(
      queryClient.getQueryData<CrmContactDetail>(
        telegramCrmKeys.contactDetail("contact-1"),
      )?.dealAutomation[0],
    ).toMatchObject({
      override: "ENABLED",
      eligibleAt: "2026-09-01T12:10:00.000Z",
    });
  });
});
