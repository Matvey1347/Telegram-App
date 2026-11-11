import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AiPostingRulesSection,
  type AiPostingRule,
} from "./ai-posting-rules-section";

describe("AiPostingRulesSection", () => {
  it("adds, toggles, and removes rules through the configuration callback", () => {
    const initial: AiPostingRule[] = [
      {
        id: "feedback-rule",
        text: "Use practical examples",
        source: "feedback",
        active: true,
        createdAt: "2026-11-11T00:00:00.000Z",
      },
    ];
    const onChange = vi.fn();
    const { rerender } = render(
      <AiPostingRulesSection rules={initial} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Включено" }));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: "feedback-rule", active: false }),
    ]);

    fireEvent.change(
      screen.getByRole("textbox", { name: "Новое правило канала" }),
      {
        target: { value: "Avoid clickbait" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    expect(onChange).toHaveBeenLastCalledWith([
      ...initial,
      expect.objectContaining({
        text: "Avoid clickbait",
        source: "manual",
        active: true,
      }),
    ]);

    rerender(<AiPostingRulesSection rules={initial} onChange={onChange} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Удалить правило: Use practical examples",
      }),
    );
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
