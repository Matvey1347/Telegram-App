import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TelegramPostsViewNavigation } from "./telegram-posts-workspace-navigation";

describe("TelegramPostsViewNavigation", () => {
  it("exposes editor, calendar, and AI Posting tabs and changes the selected view", () => {
    const onViewChange = vi.fn();
    render(
      <TelegramPostsViewNavigation
        view="editor"
        onViewChange={onViewChange}
        labels={{
          editor: "Editor",
          calendar: "Calendar",
          "ai-posting": "AI Posting",
        }}
      />,
    );

    expect(screen.getByRole("tab", { name: "Editor" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "AI Posting" }));
    expect(onViewChange).toHaveBeenCalledWith("ai-posting");
  });
});
