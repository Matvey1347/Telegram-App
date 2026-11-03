import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { AccountModal, TransferModal } from "./finance-overview-modals";

describe("Finance overview modal layout", () => {
  it("applies loaded currencies without discarding account form edits", () => {
    const props = {
      open: true,
      currencies: ["USD"],
      onClose: vi.fn(),
      onSubmit: vi.fn(),
    };
    const { rerender } = render(
      <QueryClientProvider client={new QueryClient()}>
        <AccountModal {...props} />
      </QueryClientProvider>,
    );

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <AccountModal {...props} currencies={["EUR", "USD"]} />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("button", { name: /EUR/ })).toBeInTheDocument();
    const name = document.querySelector<HTMLInputElement>('input[name="name"]');
    expect(name).not.toBeNull();
    fireEvent.change(name!, { target: { value: "Travel" } });
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <AccountModal {...props} currencies={["GBP", "EUR", "USD"]} />
      </QueryClientProvider>,
    );

    expect(name).toHaveValue("Travel");
    expect(screen.getByRole("button", { name: /EUR/ })).toBeInTheDocument();
  });

  it("allows an opening investment to be added while editing an account", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AccountModal
          open
          initial={{
            id: "account-1",
            name: "Main account",
            currency: "USD",
            initialBalance: 0,
            isSystem: false,
            isActive: true,
          }}
          currencies={["USD"]}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Add opening investment")).toBeInTheDocument();
    expect(
      screen.getByText("Adds an auditable income transaction to this account."),
    ).toBeInTheDocument();
  });

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
            isSystem: false,
            isActive: true,
          },
        ]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveClass("!max-w-[400px]");
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
