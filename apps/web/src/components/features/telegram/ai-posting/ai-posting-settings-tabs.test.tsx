import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AiPostingSettingsTabs } from "./ai-posting-settings-tabs";

describe("AiPostingSettingsTabs", () => {
  it("shows the four settings sections and reports the selected section", () => {
    const onChange = vi.fn();
    render(<AiPostingSettingsTabs value="context" onChange={onChange} />);

    expect(
      screen.getByRole("group", { name: "Раздел настроек AI Posting" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Контекст" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Источники" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Форматы" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Автопилот" }));
    expect(onChange).toHaveBeenCalledWith("autopilot");
  });
});
