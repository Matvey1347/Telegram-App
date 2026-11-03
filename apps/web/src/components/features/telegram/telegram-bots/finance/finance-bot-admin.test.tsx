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
  FinanceSubscribersSection: () => <div>Lazy logical bot users section</div>,
}));
vi.mock("./finance-monetization-section", () => ({
  FinanceMonetizationSection: () => <div>Lazy monetization section</div>,
}));
vi.mock("./finance-integrations-section", () => ({
  FinanceIntegrationsSection: () => <div>Lazy integrations section</div>,
}));

describe("FinanceBotAdmin", () => {
  it("loads each billing section only when selected", async () => {
    render(<FinanceBotAdmin botId="finance-bot" />);

    expect(
      screen.getByText("Logical bot overview"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Logical bot users")).toBeNull();
    expect(screen.queryByText("Lazy monetization section")).toBeNull();
    expect(screen.queryByText("Lazy integrations section")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Users/ }));
    expect(await screen.findByText("Lazy logical bot users section")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Monetization/ }));
    expect(await screen.findByText("Lazy monetization section")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Integrations/ }));
    expect(await screen.findByText("Lazy integrations section")).toBeInTheDocument();
  });
});
