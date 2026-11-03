import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramChannelNetworksApi, telegramChannelsApi } from "@/lib/api";
import { crossPromotionPlansApi } from "@/lib/features/growth/cross-promotion-plans-api";
import { CrossPromotionPlansPage } from "./cross-promotion-plans-page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ startOperation: vi.fn() }),
}));
vi.mock("./cross-promotion-plan-modal", () => ({
  CrossPromotionPlanModal: ({ open }: { open: boolean }) => (
    <div data-testid="plan-modal" data-open={open} />
  ),
}));
vi.mock("./promo-form-modal", () => ({
  PromoFormModal: () => null,
}));
vi.mock("./cross-promotion-plan-card", () => ({
  CrossPromotionPlanCard: () => null,
}));

describe("CrossPromotionPlansPage query loading", () => {
  beforeEach(() => {
    vi.spyOn(crossPromotionPlansApi, "list").mockResolvedValue([]);
    vi.spyOn(telegramChannelsApi, "select").mockResolvedValue([]);
    vi.spyOn(telegramChannelNetworksApi, "listOptions").mockResolvedValue([]);
  });

  it("waits to fetch channel and network catalogs until a plan editor opens", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <CrossPromotionPlansPage kind="DIRECT_MUTUAL" sectionTabs={null} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(crossPromotionPlansApi.list).toHaveBeenCalled());

    expect(telegramChannelsApi.select).not.toHaveBeenCalled();
    expect(telegramChannelNetworksApi.listOptions).not.toHaveBeenCalled();
    expect(screen.getByTestId("plan-modal")).toHaveAttribute("data-open", "false");

    await user.click(screen.getByRole("button", { name: "New placement" }));
    await waitFor(() => {
      expect(telegramChannelsApi.select).toHaveBeenCalledTimes(1);
      expect(telegramChannelNetworksApi.listOptions).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("plan-modal")).toHaveAttribute("data-open", "true");
    queryClient.clear();
  });
});
