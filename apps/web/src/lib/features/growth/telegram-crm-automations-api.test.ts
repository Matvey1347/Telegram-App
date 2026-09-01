import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, patch } = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: { get, patch } }));

import { telegramCrmAutomationsApi } from "./telegram-crm-automations-api";

describe("telegramCrmAutomationsApi", () => {
  beforeEach(() => {
    get.mockReset();
    patch.mockReset();
    get.mockResolvedValue({ data: { deals: [] } });
    patch.mockResolvedValue({ data: { ok: true } });
  });

  it("loads one bounded contact-wide status read", async () => {
    const signal = new AbortController().signal;
    await telegramCrmAutomationsApi.getStatus(
      { contactId: "contact-1", limit: 50 },
      signal,
    );
    expect(get).toHaveBeenCalledWith("/telegram-crm/automations/status", {
      params: { contactId: "contact-1", limit: 50 },
      signal,
    });
  });

  it("uses focused workspace, Contact, Deal and follow-up mutation contracts", async () => {
    await telegramCrmAutomationsApi.updateWorkspace({
      customerTelegramAutomationsEnabled: true,
    });
    await telegramCrmAutomationsApi.updateContact("contact-1", {
      typeOverrides: { PUBLISHED_LINKS: "DISABLED" },
    });
    await telegramCrmAutomationsApi.updateDeal("deal-1", {
      conversationId: "conversation-1",
    });
    await telegramCrmAutomationsApi.updateDealFollowUp("deal-1", {
      dueAt: "2026-09-03T12:00:00.000Z",
    });

    expect(patch.mock.calls).toEqual([
      ["/telegram-crm/settings", { customerTelegramAutomationsEnabled: true }],
      [
        "/telegram-crm/contacts/contact-1/automation",
        { typeOverrides: { PUBLISHED_LINKS: "DISABLED" } },
      ],
      [
        "/telegram-crm/deals/deal-1/automation",
        { conversationId: "conversation-1" },
      ],
      [
        "/telegram-crm/deals/deal-1/automation/follow-up",
        { dueAt: "2026-09-03T12:00:00.000Z" },
      ],
    ]);
  });
});
