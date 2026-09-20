import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FinanceBotAdmin } from "./finance-bot-admin";

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/ui/primitives", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("./finance-overview-section", () => ({
  FinanceOverviewSection: () => <div>Logical bot overview</div>,
}));
vi.mock("./finance-subscribers-section", () => ({
  FinanceSubscribersSection: () => <div>Logical bot users</div>,
}));
vi.mock("./finance-monetization-section", () => ({
  FinanceMonetizationSection: () => <div>Monetization</div>,
}));
vi.mock("./finance-integrations-section", () => ({
  FinanceIntegrationsSection: () => <div>Integrations</div>,
}));

describe("FinanceBotAdmin", () => {
  it("keeps analytics and users on one logical bot", () => {
    render(<FinanceBotAdmin botId="finance-bot" />);

    expect(
      screen.getByText("Logical bot overview"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Users/ }));
    expect(screen.getByText("Logical bot users")).toBeInTheDocument();
  });
});
