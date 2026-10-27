import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroshlyFinanceApp } from "./groshly-finance-app";

vi.mock("@finance-web/groshly/main", () => ({ GroshlyApp: () => null }));
vi.mock("@consumer-finance/web/components/hooks/use-telegram-mini-app-bootstrap", () => ({
  useTelegramMiniAppBootstrap: () => ({ status: "browser" }),
}));
vi.mock("@consumer-finance/web/components/hooks/use-finance-bot-branding", () => ({
  useFinanceBotBranding: () => ({ logoUrl: "", faviconUrl: "" }),
}));
vi.mock("@consumer-finance/web/lib/api/consumer-finance-insights-api", () => ({
  consumerFinanceInsightsApi: {
    startup: () => Promise.resolve({ authenticated: false }),
  },
}));
vi.mock("@consumer-finance/web/components/app/consumer-finance-login", () => ({
  ConsumerFinanceLogin: () => <button>Telegram sign in</button>,
}));

describe("GroshlyFinanceApp unauthenticated entry", () => {
  it("shows the Telegram login flow when the startup response has no session", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GroshlyFinanceApp botId="finance-bot" />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("button", { name: "Telegram sign in" })).toBeInTheDocument();
  });
});
