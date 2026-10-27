import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsumerFinanceLogin } from "@consumer-finance/web/components/app/consumer-finance-login";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  consume: vi.fn(),
}));

vi.mock("@consumer-finance/web/lib/api/consumer-finance-auth-api", () => ({
  consumerFinanceAuthApi: {
    createBrowserLoginChallenge: mocks.create,
    consumeBrowserLoginChallenge: mocks.consume,
  },
}));

function renderLogin(onAuthenticated = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <ConsumerFinanceLogin botId="bot-1" onAuthenticated={onAuthenticated} />
    </QueryClientProvider>,
  );
  return onAuthenticated;
}

beforeEach(() => {
  mocks.create.mockReset();
  mocks.consume.mockReset();
  mocks.create.mockResolvedValue({
    token: "a".repeat(32),
    expiresAt: "2026-08-21T23:59:00.000Z",
    loginUrl: `https://t.me/finance_bot?start=finlogin_${"a".repeat(32)}`,
  });
});

describe("ConsumerFinanceLogin", () => {
  it("renders a domain-independent Telegram button and completes the challenge", async () => {
    mocks.consume.mockResolvedValue({
      status: "authenticated",
      profile: { id: "profile-1" },
    });
    const onAuthenticated = renderLogin();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Know where your money goes.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "All accounts in one view",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Sign in with Telegram" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "A clearer picture of your money.",
      }),
    ).toBeInTheDocument();

    const link = await waitFor(() => {
      const candidate = screen
        .getAllByRole("link", {
          name: "Sign in or sign up",
        })
        .find((item) => item.getAttribute("href")?.startsWith("https://t.me/"));
      if (!candidate) throw new Error("Telegram sign-in link is missing");
      return candidate;
    });
    expect(link).toHaveAttribute(
      "href",
      `https://t.me/finance_bot?start=finlogin_${"a".repeat(32)}`,
    );
    expect(document.querySelector("script[data-telegram-login]")).toBeNull();

    fireEvent.click(link);

    await waitFor(() => expect(mocks.consume).toHaveBeenCalledOnce());
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledOnce());
  });

  it("keeps challenge creation failures recoverable", async () => {
    mocks.create.mockRejectedValue(new Error("offline"));
    renderLogin();

    expect(
      await screen.findByText(
        "Telegram sign in is unavailable. Please try again later.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });
});
