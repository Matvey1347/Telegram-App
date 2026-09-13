import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromoCreationMethodPicker } from "./promo-creation-method-picker";

const baseProps = {
  connected: true,
  connectionLoading: false,
  importStatus: "idle" as const,
  dots: 1,
  onChooseBot: vi.fn(),
  onChooseManual: vi.fn(),
};

describe("PromoCreationMethodPicker", () => {
  it("offers compact bot and manual actions without a separate choice screen", () => {
    const onChooseBot = vi.fn();
    const onChooseManual = vi.fn();
    render(
      <PromoCreationMethodPicker
        {...baseProps}
        mode="choose"
        onChooseBot={onChooseBot}
        onChooseManual={onChooseManual}
      />,
    );

    expect(screen.getByRole("region", { name: "Promo post" })).toHaveClass(
      "p-3",
    );
    expect(
      screen.queryByText("How do you want to add the promo post?"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Import from bot/ }));
    fireEvent.click(screen.getByRole("button", { name: /Create manually/ }));
    expect(onChooseBot).toHaveBeenCalledOnce();
    expect(onChooseManual).toHaveBeenCalledOnce();
  });

  it("handles an unavailable bot and a failed import", () => {
    const onChooseBot = vi.fn();
    const { rerender } = render(
      <PromoCreationMethodPicker
        {...baseProps}
        mode="choose"
        connected={false}
        onChooseBot={onChooseBot}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Import from bot/ }),
    ).toBeDisabled();
    expect(screen.getByText(/Connect the workspace system bot/)).toBeVisible();

    rerender(
      <PromoCreationMethodPicker
        {...baseProps}
        mode="bot"
        error="Could not start import."
        onChooseBot={onChooseBot}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onChooseBot).toHaveBeenCalledOnce();
  });
});
