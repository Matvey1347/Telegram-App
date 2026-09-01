import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { CrmContactDetail } from "@telegram-system/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CrmAutomationSection } from "./crm-automation";

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  listConversations: vi.fn(),
}));

vi.mock("@/lib/features/growth/telegram-crm-automations-api", () => ({
  telegramCrmAutomationsApi: {
    getStatus: mocks.getStatus,
    updateWorkspace: vi.fn(),
    updateContact: vi.fn(),
    updateDeal: vi.fn(),
    updateDealFollowUp: vi.fn(),
  },
}));

vi.mock("@/lib/features/growth/telegram-crm-api", () => ({
  telegramCrmApi: { listConversations: mocks.listConversations },
}));

describe("CrmAutomationSection states", () => {
  beforeEach(() => {
    mocks.getStatus.mockReset();
    mocks.listConversations.mockReset();
    mocks.listConversations.mockResolvedValue({ items: [] });
  });

  it("fails closed when status cannot be loaded and communicates manual messaging", async () => {
    mocks.getStatus.mockRejectedValue(new Error("unavailable"));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <CrmAutomationSection
          contact={{ id: "contact-1" } as CrmContactDetail}
          canManageWorkspace
          canManageContact
        />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          /Automation settings and server status could not be loaded/i,
        ),
      ).toBeTruthy(),
    );
    expect(screen.getByText(/manual messages remain available/i)).toBeTruthy();
    expect(mocks.getStatus).toHaveBeenCalledTimes(1);
  });
});
