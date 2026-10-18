import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BotRuntimeAvatar } from "./bot-runtime-avatar";

const { getAvatar } = vi.hoisted(() => ({ getAvatar: vi.fn() }));

vi.mock("@/lib/api", () => ({
  api: { get: getAvatar },
}));

describe("BotRuntimeAvatar", () => {
  beforeEach(() => {
    getAvatar.mockClear();
    getAvatar.mockResolvedValue({ data: new Blob(["avatar"]) });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:finance-avatar"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads a protected avatar through the authenticated API and falls back on image failure", async () => {
    const { container, unmount } = render(
      <BotRuntimeAvatar type="FINANCE" avatarUrl="/missing-avatar" />,
    );

    await waitFor(() =>
      expect(container.querySelector("img")).toHaveAttribute(
        "src",
        "blob:finance-avatar",
      ),
    );
    expect(getAvatar).toHaveBeenCalledWith("/missing-avatar", {
      responseType: "blob",
      signal: expect.any(AbortSignal),
    });
    fireEvent.error(container.querySelector("img") as HTMLImageElement);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByLabelText("Finance bot")).toBeInTheDocument();
    unmount();
  });

  it("keeps each environment avatar in memory until Refresh changes its version", async () => {
    const { rerender } = render(
      <BotRuntimeAvatar
        type="FINANCE"
        avatarUrl="/telegram-bots/configured/finance/avatar?environment=LOCAL"
        refreshKey={1}
      />,
    );
    await waitFor(() => expect(getAvatar).toHaveBeenCalledTimes(1));

    rerender(
      <BotRuntimeAvatar
        type="FINANCE"
        avatarUrl="/telegram-bots/configured/finance/avatar?environment=PRODUCTION"
        refreshKey={1}
      />,
    );
    await waitFor(() => expect(getAvatar).toHaveBeenCalledTimes(2));

    rerender(
      <BotRuntimeAvatar
        type="FINANCE"
        avatarUrl="/telegram-bots/configured/finance/avatar?environment=LOCAL"
        refreshKey={1}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getAvatar).toHaveBeenCalledTimes(2);

    rerender(
      <BotRuntimeAvatar
        type="FINANCE"
        avatarUrl="/telegram-bots/configured/finance/avatar?environment=LOCAL"
        refreshKey={2}
      />,
    );
    await waitFor(() => expect(getAvatar).toHaveBeenCalledTimes(3));
  });

  it("renders bundled bot branding without an authenticated avatar request", () => {
    const { container } = render(
      <BotRuntimeAvatar type="NONE" avatarUrl="/brand/telegram-system-dev.png" />,
    );

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/brand/telegram-system-dev.png",
    );
    expect(getAvatar).not.toHaveBeenCalled();
  });
});
