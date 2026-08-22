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
  FinanceOverviewSection: ({ environment }: { environment: string }) => (
    <div>Overview runtime: {environment}</div>
  ),
}));
vi.mock("./finance-subscribers-section", () => ({
  FinanceSubscribersSection: ({ environment }: { environment: string }) => (
    <div>Users runtime: {environment}</div>
  ),
}));
vi.mock("./finance-monetization-section", () => ({
  FinanceMonetizationSection: () => <div>Monetization</div>,
}));
vi.mock("./finance-integrations-section", () => ({
  FinanceIntegrationsSection: () => <div>Integrations</div>,
}));

describe("FinanceBotAdmin runtime isolation", () => {
  it("defaults analytics to production and explicitly carries the selected runtime into Users", () => {
    render(<FinanceBotAdmin botId="finance-bot" />);

    expect(
      screen.getByText("Overview runtime: PRODUCTION"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Local bot" }));
    expect(screen.getByText("Overview runtime: LOCAL")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Users/ }));
    expect(screen.getByText("Users runtime: LOCAL")).toBeInTheDocument();
  });
});
