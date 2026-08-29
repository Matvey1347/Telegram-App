import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TransferModal } from "./finance-overview-modals";

describe("Finance overview modal layout", () => {
  it("keeps each transfer account beside its amount in the compact modal", () => {
    render(
      <TransferModal
        open
        accounts={[
          {
            id: "account-1",
            name: "Main account",
            currency: "USD",
            initialBalance: 0,
            isActive: true,
          },
        ]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveClass("max-w-[400px]");
    const fromRow = screen.getByTestId("transfer-from-row");
    const toRow = screen.getByTestId("transfer-to-row");
    expect(fromRow).toHaveClass("sm:grid-cols-[minmax(0,1fr)_160px]");
    expect(toRow).toHaveClass("sm:grid-cols-[minmax(0,1fr)_160px]");
    expect(within(fromRow).getByText("From")).toBeInTheDocument();
    expect(within(fromRow).getByText("From amount")).toBeInTheDocument();
    expect(within(toRow).getByText("To")).toBeInTheDocument();
    expect(within(toRow).getByText("To amount")).toBeInTheDocument();
  });
});
