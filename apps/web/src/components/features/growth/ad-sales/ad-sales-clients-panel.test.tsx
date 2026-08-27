import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdSalesClientsPanel } from "./ad-sales-clients-panel";

const { listCrmAdvertisers } = vi.hoisted(() => ({
  listCrmAdvertisers: vi.fn().mockResolvedValue({
    items: [],
    pagination: {
      page: 1,
      pageSize: 25,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  }),
}));

vi.mock("@/lib/api", () => ({
  telegramAdSalesApi: { listCrmAdvertisers },
}));

vi.mock("@/components/features/workspace/member-select", () => ({
  MemberSelect: () => <select aria-label="Owner" />,
}));

describe("AdSalesClientsPanel", () => {
  it("keeps search and sorting visible while hiding secondary filters and summary tiles", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <AdSalesClientsPanel />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(listCrmAdvertisers).toHaveBeenCalledWith(
        expect.objectContaining({
          sortBy: "PRIORITY",
          sortDirection: "DESC",
        }),
      ),
    );
    expect(
      screen.getByPlaceholderText("Name, company, Telegram, contact"),
    ).toBeTruthy();
    const filtersButton = screen.getByRole("button", { name: "Filters" });
    const sortButton = screen.getByRole("button", { name: "Sort clients" });
    expect(filtersButton.textContent).toBe("");
    expect(filtersButton.className).not.toContain("border");
    expect(sortButton.className).not.toContain("border");
    expect(filtersButton.className).toContain("h-[38px]");
    expect(sortButton.className).toContain("h-[38px]");
    expect(screen.queryByText("High value")).toBeNull();
    expect(screen.queryByText("Needs action")).toBeNull();
    expect(screen.queryByText("Page revenue")).toBeNull();
    expect(screen.queryByText("Status")).toBeNull();

    fireEvent.click(filtersButton);
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.getByText("Lifecycle")).toBeTruthy();
    expect(screen.getByText("Archive")).toBeTruthy();

    fireEvent.click(sortButton);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(sortButton);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Name: A–Z" }));
    await waitFor(() =>
      expect(listCrmAdvertisers).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: "NAME", sortDirection: "ASC" }),
      ),
    );
  });
});
