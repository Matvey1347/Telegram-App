import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstallAppButton } from "./install-app-button";

function matchMedia(matches: boolean) {
  vi.stubGlobal("matchMedia", () => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe("InstallAppButton", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    matchMedia(false);
  });

  it("appears only after the browser offers an explicit install prompt", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    render(<InstallAppButton />);
    expect(screen.queryByRole("button", { name: "Install app" })).toBeNull();

    const event = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted" }>;
    };
    event.prompt = prompt;
    event.userChoice = Promise.resolve({ outcome: "accepted" });
    fireEvent(window, event);

    await userEvent.click(
      await screen.findByRole("button", { name: "Install app" }),
    );
    await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
  });

  it("stays hidden in standalone display mode", () => {
    matchMedia(true);
    render(<InstallAppButton />);
    const event = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "dismissed" }>;
    };
    event.prompt = vi.fn().mockResolvedValue(undefined);
    event.userChoice = Promise.resolve({ outcome: "dismissed" });
    fireEvent(window, event);
    expect(screen.queryByRole("button", { name: "Install app" })).toBeNull();
  });
});
