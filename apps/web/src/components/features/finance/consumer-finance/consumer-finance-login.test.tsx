import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsumerFinanceLogin } from "./consumer-finance-login";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  consume: vi.fn(),
}));

vi.mock("@/lib/features/finance/consumer-finance-api", () => ({
  consumerFinanceApi: {
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

    const link = await screen.findByRole("link", {
      name: "Telegram sign in",
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
