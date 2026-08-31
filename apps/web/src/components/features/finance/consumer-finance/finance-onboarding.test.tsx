import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FinanceOnboarding } from "./finance-onboarding";

describe("FinanceOnboarding", () => {
  it("shows a recoverable error when profile persistence fails", async () => {
    const onComplete = vi.fn().mockRejectedValue(new Error("offline"));
    render(
      <FinanceOnboarding
        profile={{
          id: "profile-1",
          defaultCurrency: "USD",
          timezone: "UTC",
          locale: "en",
          onboardingCompletedAt: null,
        }}
        onComplete={onComplete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const timezone = screen.getByRole("button", { name: /UTC/u });
    fireEvent.click(timezone);
    expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
    fireEvent.click(timezone);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Open my finances" }));

    expect(
      await screen.findByText("Finance could not be loaded."),
    ).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledWith({
      defaultCurrency: "USD",
      timezone: "UTC",
      locale: "en",
    });
    expect(
      screen.getByRole("button", { name: "Open my finances" }),
    ).toBeEnabled();
  });
});
