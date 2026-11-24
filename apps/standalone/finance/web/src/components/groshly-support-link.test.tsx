import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GroshlyApp } from "@finance-web/groshly/main";
import { initial } from "@finance-web/groshly/data";

const App = GroshlyApp as ComponentType<{
  initialData: ReturnType<typeof initial>;
  previewScreen: string;
  telegramAuthenticated: boolean;
  supportBotUsername?: string;
  financeTelegramInitData?: string;
}>;

const supportBotUsername = "groshly_help_bot";
const target = `https://t.me/${supportBotUsername}`;

function profile(options?: { username?: string; telegram?: boolean }) {
  const data = initial();
  data.onboarded = true;
  data.lang = "en";
  return render(
    <App
      initialData={data}
      previewScreen="profile"
      telegramAuthenticated
      supportBotUsername={options?.username}
      financeTelegramInitData={
        options?.telegram ? "telegram-launch" : undefined
      }
    />,
  );
}

describe("Groshly profile support", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    delete window.Telegram;
    vi.unstubAllGlobals();
  });

  it("uses the configured bot URL in the profile settings group in a browser", () => {
    profile({ username: supportBotUsername });
    const group = screen.getByRole("button", {
      name: "Data & privacy",
    }).parentElement!;
    expect(
      within(group).getByRole("link", { name: "Support" }),
    ).toHaveAttribute("href", target);
  });

  it("opens the support chat through the Telegram Mini App SDK", () => {
    const openTelegramLink = vi.fn();
    window.Telegram = { WebApp: { openTelegramLink } };
    profile({ username: supportBotUsername, telegram: true });

    expect(fireEvent.click(screen.getByRole("link", { name: "Support" }))).toBe(
      false,
    );
    expect(openTelegramLink).toHaveBeenCalledWith(target);
  });

  it("keeps the browser link available if the Telegram client rejects the native action", () => {
    window.Telegram = {
      WebApp: {
        openTelegramLink: () => {
          throw new Error("Unsupported");
        },
      },
    };
    profile({ username: supportBotUsername, telegram: true });

    expect(fireEvent.click(screen.getByRole("link", { name: "Support" }))).toBe(
      true,
    );
  });

  it("shows the unavailable state if the selected environment has no support bot", () => {
    profile();
    expect(
      screen.queryByRole("link", { name: "Support" }),
    ).not.toBeInTheDocument();
  });
});
