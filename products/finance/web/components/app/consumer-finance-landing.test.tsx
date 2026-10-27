import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsumerFinanceLanding } from "@consumer-finance/web/components/app/consumer-finance-landing";

describe("ConsumerFinanceLanding", () => {
  it("uses real product screens and the supplied Groshly icon", () => {
    render(<ConsumerFinanceLanding
      locale="en" botId="bot-1" theme="light" iconUrl="/brand/groshly-icon.png" onThemeChange={vi.fn()} onLocaleChange={vi.fn()}
      login={<div>Login</div>} onLoginClick={vi.fn()}
    />);
    expect(document.querySelector(".landing-brand img")).toHaveAttribute("src", "/brand/groshly-icon.png");
    expect(document.querySelector('iframe[src="/preview/home?lang=en&theme=light&botId=bot-1"]')).toBeTruthy();
    expect(document.querySelector('iframe[src="/preview/analytics?lang=en&theme=light&botId=bot-1"]')).toBeTruthy();
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
      locale="uk" botId="bot-1" theme="dark" iconUrl="/brand/groshly-icon.png" onThemeChange={onThemeChange} onLocaleChange={onLocaleChange}
      login={<div>Login</div>} onLoginClick={vi.fn()}
    />);
    fireEvent.click(screen.getByRole("button", { name: /English/ }));
    fireEvent.click(screen.getByRole("button", { name: "Light theme" }));
    expect(onLocaleChange).toHaveBeenCalledWith("en");
    expect(onThemeChange).toHaveBeenCalledOnce();
  });
});
