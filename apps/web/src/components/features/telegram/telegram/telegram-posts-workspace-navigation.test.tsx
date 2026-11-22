import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TelegramPostsViewNavigation } from "./telegram-posts-workspace-navigation";

describe("publication navigation", () => {
  it("shows AI Posting, Calendar and Editor as the only tabs", async () => {
    const change = vi.fn();
    render(<TelegramPostsViewNavigation
      view="ai-posting"
      labels={{ "ai-posting": "AI Posting", calendar: "Calendar", editor: "Editor" }}
      onViewChange={change}
    />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "AI Posting", "Calendar", "Editor",
    ]);
    expect(screen.getByRole("tab", { name: "AI Posting", selected: true })).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "Editor" }));
    expect(change).toHaveBeenCalledWith("editor");
  });
});
