import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ManagedPostReadOnlyPanel } from "./managed-post-read-only-panel";

describe("ManagedPostReadOnlyPanel", () => {
  it("explains the synced read-only state and links to Telegram", () => {
    render(
      <ManagedPostReadOnlyPanel
        title="Imported post"
        telegramUrl="https://t.me/channel/42"
      />,
    );

    expect(screen.getByText("Synced from Telegram")).toBeVisible();
    expect(screen.getByText(/cannot be edited, scheduled/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Open original post/ }),
    ).toHaveAttribute("href", "https://t.me/channel/42");
  });
});
