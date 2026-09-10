import { act, render, waitFor } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFinanceBotBranding } from "./use-finance-bot-branding";

const mocks = vi.hoisted(() => ({
  apiBase: "/api",
}));

vi.mock("@/lib/features/finance/consumer-finance-http", () => ({
  resolveConsumerFinanceApiBase: () => mocks.apiBase,
}));

function BrandingImage() {
  const { logoUrl } = useFinanceBotBranding("finance bot");
  return <span data-logo-url={logoUrl} />;
}

beforeEach(() => {
  mocks.apiBase = "/api";
});

describe("useFinanceBotBranding", () => {
  it("keeps the branding URL stable when the server has a loopback API URL", async () => {
    const browserWindow = window;
    mocks.apiBase = "http://localhost:4000/api";
    vi.stubGlobal("window", undefined);
    const serverHtml = renderToString(<BrandingImage />);
    vi.stubGlobal("window", browserWindow);
    mocks.apiBase = "/api";

    expect(serverHtml).toContain(
      'data-logo-url="/api/finance-bots/finance%20bot/branding/logo"',
    );

    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let root: Root | undefined;

    await act(async () => {
      root = hydrateRoot(container, <BrandingImage />);
      await Promise.resolve();
    });

    expect(
      consoleError.mock.calls.some((call) =>
        call.some((value) =>
          String(value).includes("didn't match the client properties"),
        ),
      ),
    ).toBe(false);
    expect(container.querySelector("span")).toHaveAttribute(
      "data-logo-url",
      "/api/finance-bots/finance%20bot/branding/logo",
    );

    await act(async () => root?.unmount());
    consoleError.mockRestore();
    container.remove();
  });

  it("uses the direct API after mounting on the localhost web app", async () => {
    mocks.apiBase = "http://localhost:4000/api";
    const { container } = render(<BrandingImage />);

    await waitFor(() =>
      expect(container.querySelector("span")).toHaveAttribute(
        "data-logo-url",
        "http://localhost:4000/api/finance-bots/finance%20bot/branding/logo",
      ),
    );
  });
});
