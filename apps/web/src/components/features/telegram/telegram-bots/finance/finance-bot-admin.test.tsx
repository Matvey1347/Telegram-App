import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FinanceBotAdmin } from "./finance-bot-admin";

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/ui/primitives", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
  LoadingState: () => <div>Loading</div>,
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

vi.mock("../ads/bot-ads-section", () => ({
  BotAdsSection: () => <div>Bot advertising dashboard</div>,
}));

describe("FinanceBotAdmin", () => {
  it("links all sections to separate URLs and keeps the selected runtime", () => {
    render(<FinanceBotAdmin botId="finance-bot" environment="LOCAL" />);
    for (const [label, slug] of [
      ["Overview", "overview"],
      ["Monetization", "monetization"],
      ["Users", "users"],
      ["Integrations", "integrations"],
      ["Ads", "ads"],
    ]) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute(
        "href", `/telegram-bots/finance-bot/finance/${slug}?environment=LOCAL`,
      );
    }
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Logical bot overview")).toBeInTheDocument();
    expect(screen.queryByText("Bot advertising dashboard")).toBeNull();
  });

  it.each([
    ["users", "Users", "Lazy logical bot users section"],
    ["monetization", "Monetization", "Lazy monetization section"],
    ["integrations", "Integrations", "Lazy integrations section"],
    ["ads", "Ads", "Bot advertising dashboard"],
  ] as const)("renders the %s section directly", async (section, label, content) => {
    render(<FinanceBotAdmin botId="finance-bot" section={section} />);
    expect(await screen.findByText(content)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("Logical bot overview")).toBeNull();
  });
});
