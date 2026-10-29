import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FinanceMarketingHome } from "./finance-marketing-home";

describe("FinanceMarketingHome", () => {
  it("renders marketing content and login link immediately without an API request", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<FinanceMarketingHome initialLocale="en" initialTheme="dark" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Know where your money goes.");
    expect(screen.getAllByRole("link", { name: /Sign in or sign up/ })[0]).toHaveAttribute("href", "/login");
    expect(document.querySelector(".groshly-landing")).toHaveAttribute("data-theme", "dark");
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("changes language and theme within the same page", () => {
    render(<FinanceMarketingHome initialLocale="uk" initialTheme="light" />);
    fireEvent.click(screen.getByRole("button", { name: /English/ }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Know where your money goes.");
    fireEvent.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(document.querySelector(".groshly-landing")).toHaveAttribute("data-theme", "dark");
  });
});
