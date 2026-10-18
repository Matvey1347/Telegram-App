import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FinanceRootApp } from "./finance-root-app";

vi.mock("@consumer-finance/web/components/app/consumer-finance-app", () => ({
  ConsumerFinanceApp: () => <div>Finance application</div>,
}));

describe("FinanceRootApp", () => {
  it("uses the SSR locale for its initial loading render", () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as typeof fetch;

    render(<FinanceRootApp />);

    expect(screen.getByText("Loading…")).toBeTruthy();
  });
});
