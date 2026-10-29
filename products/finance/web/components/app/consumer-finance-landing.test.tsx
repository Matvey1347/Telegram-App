import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsumerFinanceLanding } from "@consumer-finance/web/components/app/consumer-finance-landing";
import offers from "../../../../../apps/standalone/finance/api/src/billing/finance-billing-offers.json";

afterEach(() => { vi.unstubAllGlobals(); });

describe("ConsumerFinanceLanding", () => {
  it("uses real product screens and the supplied Groshly icon", () => {
    render(<ConsumerFinanceLanding
      locale="en" theme="light" iconUrl="/brand/groshly-dark-icon.png" onThemeChange={vi.fn()} onLocaleChange={vi.fn()}
    />);
    expect(document.querySelector(".landing-brand img")).toHaveAttribute("src", "/brand/groshly-dark-icon.png");
    expect(document.querySelector('iframe[src="/preview/home"]')).toBeTruthy();
    expect(document.querySelector('iframe[src="/preview/analytics"]')).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    const question = screen.getByRole("button", { name: "Do I need a separate password?" });
    expect(question).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(question);
    expect(question).toHaveAttribute("aria-expanded", "true");
  });

  it("exposes language and theme controls", () => {
    const onLocaleChange = vi.fn();
    const onThemeChange = vi.fn();
    render(<ConsumerFinanceLanding
      locale="uk" theme="dark" iconUrl="/brand/groshly-dark-icon.png" onThemeChange={onThemeChange} onLocaleChange={onLocaleChange}
    />);
    fireEvent.click(screen.getByRole("button", { name: /English/ }));
    fireEvent.click(screen.getByRole("button", { name: "Light theme" }));
    expect(onLocaleChange).toHaveBeenCalledWith("en");
    expect(onThemeChange).toHaveBeenCalledOnce();
  });

  it("lets visitors switch product screens without reloading preview for language or theme", () => {
    const props = { iconUrl: "/brand/groshly-dark-icon.png", onThemeChange: vi.fn(), onLocaleChange: vi.fn() };
    const { rerender } = render(<ConsumerFinanceLanding locale="uk" theme="light" {...props} />);
    const preview = document.querySelector(".landing-showcase-visual iframe");
    expect(preview).toHaveAttribute("src", "/preview/analytics");
    fireEvent.click(screen.getByRole("button", { name: "Борги й повернення" }));
    expect(preview).toHaveAttribute("src", "/preview/debts");
    rerender(<ConsumerFinanceLanding locale="en" theme="dark" {...props} />);
    expect(preview).toHaveAttribute("src", "/preview/debts");
    expect(preview).not.toHaveAttribute("aria-hidden");
  });

  it("shows the four current billing prices and the automatic intro renewal in both languages", () => {
    for (const [locale, currency] of [["uk", "грн"], ["en", "UAH"]] as const) {
      const { unmount } = render(<ConsumerFinanceLanding
        locale={locale} theme="light" iconUrl="/brand/groshly-dark-icon.png"
        onThemeChange={vi.fn()} onLocaleChange={vi.fn()}
      />);
      const pricing = document.querySelector("#pricing");
      expect(pricing).toBeTruthy();
      for (const period of ["INTRO", "MONTH", "QUARTER", "YEAR"] as const) {
        expect(pricing?.textContent).toContain(`${offers[period].amountMinor / 100} ${currency}`);
      }
      expect(pricing?.textContent).toContain(`${offers.INTRO.introNextAmountMinor / 100} ${currency}`);
      expect(pricing?.textContent).toMatch(locale === "uk" ? /автоматично списуватиметься/ : /charged automatically/);
      unmount();
    }
  });

  it("emits a single pricing view and a registration start event from the pricing CTA", () => {
    let callback: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(next: IntersectionObserverCallback) { callback = next; }
      observe = observe;
      disconnect = disconnect;
    });
    const viewed = vi.fn();
    const started = vi.fn();
    window.addEventListener("finance:pricing_view", viewed);
    window.addEventListener("finance:registration_start", started);
    render(<ConsumerFinanceLanding
      locale="en" theme="light" iconUrl="/brand/groshly-dark-icon.png"
      onThemeChange={vi.fn()} onLocaleChange={vi.fn()}
    />);
    expect(observe).toHaveBeenCalledWith(document.querySelector("#pricing"));
    callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(viewed).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalled();
    const signup = screen.getByRole("link", { name: /Create account to view PLUS/ });
    signup.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(signup);
    expect(started).toHaveBeenCalledOnce();
    expect(signup).toHaveAttribute("href", "/login");
    window.removeEventListener("finance:pricing_view", viewed);
    window.removeEventListener("finance:registration_start", started);
  });
});
