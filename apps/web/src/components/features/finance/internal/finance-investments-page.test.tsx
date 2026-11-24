import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FinanceInvestmentsPage } from "./finance-investments-page";

const { listPage } = vi.hoisted(() => ({ listPage: vi.fn() }));
vi.mock("@/lib/api", () => ({ investmentsApi: { listPage } }));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/providers/finance-display-provider", () => ({
  useFinanceDisplay: () => ({
    currency: "UAH",
    rates: [{ baseCurrency: "PLN", targetCurrency: "UAH", rate: 10 }],
  }),
}));
vi.mock("@/providers/i18n-provider", () => ({
  useI18n: () => ({ locale: "en" }),
  useOptionalI18n: () => null,
}));

describe("FinanceInvestmentsPage", () => {
  it("reads the investment ledger and keeps its original currencies and withdrawal signs", async () => {
    listPage.mockResolvedValue({
      items: [
        { id: "contribution", amount: "250.00", currency: "UAH", date: "2026-11-23", movementType: "CONTRIBUTION" },
        { id: "withdrawal", amount: "18.00", currency: "PLN", date: "2026-11-24", movementType: "WITHDRAWAL" },
      ],
      pagination: { page: 1, pageSize: 10, totalItems: 2, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    render(<QueryClientProvider client={new QueryClient()}><FinanceInvestmentsPage /></QueryClientProvider>);
    expect(await screen.findByText("-18.00 zł")).toContainElement(screen.getByText("≈ -180.00 ₴"));
    expect(screen.getByText("250.00 ₴")).toBeVisible();
    expect(listPage).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
  });
});
