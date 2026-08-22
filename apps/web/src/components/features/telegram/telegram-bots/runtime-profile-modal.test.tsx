import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RuntimeProfileModal } from "./runtime-profile-modal";

describe("RuntimeProfileModal", () => {
  it("offers bot-scoped logo and favicon controls for Finance bots", () => {
    render(
      <RuntimeProfileModal
        config={{
          environment: "LOCAL",
          bot: {
            id: "bot-1",
            label: "Smart Budget",
            applicationType: "FINANCE",
            runtimes: [],
          } as never,
        }}
        saving={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Logo")).toBeInTheDocument();
    expect(screen.getByText("Favicon")).toBeInTheDocument();
    expect(
      screen.getByText(
        /updates the finance app logo and the selected telegram bot/i,
      ),
    ).toBeInTheDocument();
  });
});
