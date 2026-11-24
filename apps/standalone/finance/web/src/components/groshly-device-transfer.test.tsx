import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { consumerFinanceAuthApi } from "@consumer-finance/web/lib/api/consumer-finance-auth-api";
import { GroshlyCreateDeviceTransfer, GroshlyDeviceTransferLogin } from "./groshly-device-transfer";
import { GroshlySignOut } from "./groshly-sign-out";

const code = "x".repeat(43);
const botId = "finance-test";

function setup(ui: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

it("issues a sign-in code only after the user requests one from their profile", async () => {
  const create = vi.spyOn(consumerFinanceAuthApi, "createBrowserTransfer").mockResolvedValue({
    token: code,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    url: "https://example.test/finance/test",
    diagnosticId: "transfer-test",
  });
  const user = userEvent.setup();
  setup(<GroshlyCreateDeviceTransfer botId={botId} locale="en" />);
  await user.click(screen.getByRole("button", { name: "Sign in on another device" }));
  expect(create).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Generate sign-in code" }));
  expect(await screen.findByLabelText("One-time sign-in code")).toHaveValue(code);
  expect(create).toHaveBeenCalledWith(botId);
});

it("keeps a scanned code out of the URL and waits for confirmation", async () => {
  const consume = vi.spyOn(consumerFinanceAuthApi, "consumeBrowserTransfer").mockRejectedValue(new Error("expired"));
  const onAuthenticated = vi.fn();
  const user = userEvent.setup();
  window.history.replaceState({}, "", `/login#deviceLogin=${code}`);
  setup(<GroshlyDeviceTransferLogin botId={botId} locale="en" onAuthenticated={onAuthenticated} />);

  expect(await screen.findByLabelText("One-time sign-in code")).toHaveValue(code);
  expect(window.location.hash).toBe("");
  expect(consume).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/Generate a new code/);
  expect(consume).toHaveBeenCalledWith(botId, code);
  expect(onAuthenticated).not.toHaveBeenCalled();
});

it("reports a failed sign-out and keeps the action available", async () => {
  const logout = vi.spyOn(consumerFinanceAuthApi, "logout").mockRejectedValue(new Error("offline"));
  const user = userEvent.setup();
  setup(<GroshlySignOut botId={botId} locale="en" />);
  await user.click(screen.getByRole("button", { name: "Sign out" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not sign out");
  expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  expect(logout).toHaveBeenCalledWith(botId);
});

it("opens the app after a one-time code is accepted", async () => {
  vi.spyOn(consumerFinanceAuthApi, "consumeBrowserTransfer").mockResolvedValue({
    authenticated: true,
    profile: {} as never,
  });
  const onAuthenticated = vi.fn();
  const user = userEvent.setup();
  setup(<GroshlyDeviceTransferLogin botId={botId} locale="en" onAuthenticated={onAuthenticated} />);
  await user.click(screen.getByRole("button", { name: "Use a code from another device" }));
  await user.type(screen.getByLabelText("One-time sign-in code"), code);
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(onAuthenticated).toHaveBeenCalledOnce();
});
