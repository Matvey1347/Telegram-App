import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AiPostingSettingsTabs } from "./ai-posting-settings-tabs";

describe("AiPostingSettingsTabs", () => {
  it("shows current settings tabs and reports the selected section", () => {
    const onChange = vi.fn();
    render(<AiPostingSettingsTabs value="idea" onChange={onChange} />);

    expect(
      screen.getByRole("group", { name: "Разделы AI Posting" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Идея канала" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Импорт / экспорт" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Источники" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Медиа" }));
    expect(onChange).toHaveBeenCalledWith("images");
    expect(screen.getByRole("link", { name: "Медиа" })).toHaveAttribute("href", "?aiPostingTab=images");
  });
});
