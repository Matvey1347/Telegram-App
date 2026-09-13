import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramAdSalesApi } from "@/lib/api";
import { WorkspaceAdSalesDefaults } from "./workspace-ad-sales-defaults";

function renderDefaults(isOwner = true) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WorkspaceAdSalesDefaults isOwner={isOwner} />
    </QueryClientProvider>,
  );
}

describe("WorkspaceAdSalesDefaults", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(telegramAdSalesApi, "getWorkspaceSettings").mockResolvedValue({
      workspaceId: "workspace-1",
      defaultOrganicPostsPerAdSlot: 3,
      salesCommissionEnabled: false,
      defaultSalesCommissionRate: 0,
      createdAt: "2026-09-12T00:00:00.000Z",
      updatedAt: "2026-09-12T00:00:00.000Z",
    });
    vi.spyOn(telegramAdSalesApi, "updateWorkspaceSettings").mockResolvedValue(
      {} as never,
    );
  });

  it("lets an owner enable a default commission for future deals", async () => {
    const user = userEvent.setup();
    renderDefaults();

    const toggle = await screen.findByRole("switch", {
      name: "Enable sales commission",
    });
    await user.click(toggle);
    const rate = screen.getByRole("spinbutton");
    await user.clear(rate);
    await user.type(rate, "12.5");
    await user.click(
      screen.getByRole("button", { name: "Save ad-sales defaults" }),
    );

    expect(telegramAdSalesApi.updateWorkspaceSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        salesCommissionEnabled: true,
        defaultSalesCommissionRate: 12.5,
      }),
      expect.anything(),
    );
  });

  it("does not expose compensation controls to a non-owner", async () => {
    renderDefaults(false);
    expect(
      await screen.findByRole("button", { name: "Save ad-sales defaults" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sales commission")).toBeNull();
  });
});
