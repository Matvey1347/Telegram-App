import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroshlyFinanceApp } from "./groshly-finance-app";

const { startup } = vi.hoisted(() => ({
  startup: vi.fn().mockResolvedValue({ authenticated: false }),
}));
vi.mock("@finance-web/groshly/main", () => ({ GroshlyApp: () => null }));
vi.mock("@consumer-finance/web/components/hooks/use-finance-bot-branding", () => ({
  useFinanceBotBranding: () => ({ logoUrl: "", faviconUrl: "" }),
}));
vi.mock("@consumer-finance/web/lib/api/consumer-finance-insights-api", () => ({
  consumerFinanceInsightsApi: { startup },
}));
vi.mock("@consumer-finance/web/components/app/consumer-finance-login", () => ({
  ConsumerFinanceLogin: () => <button>Telegram sign in</button>,
  ConsumerFinanceBootstrapError: () => <p role="alert">Unable to sign in to Mini App</p>,
}));

describe("GroshlyFinanceApp unauthenticated entry", () => {
  it("shows the Telegram login flow when the startup response has no session", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GroshlyFinanceApp botId="finance-bot" bootstrap={{ status: "browser" }} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("button", { name: "Telegram sign in" })).toBeInTheDocument();
  });

  it("keeps a rejected Telegram launch inside the Mini App", async () => {
    startup.mockRejectedValueOnce(new Error("Invalid Telegram signature"));
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <GroshlyFinanceApp botId="finance-bot" bootstrap={{ status: "ready", initData: "telegram-launch" }} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to sign in to Mini App");
    expect(startup).toHaveBeenLastCalledWith("finance-bot", "telegram-launch");
    expect(screen.queryByRole("button", { name: "Telegram sign in" })).toBeNull();
  });
});
