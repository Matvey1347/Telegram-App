import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import { GroshlyApp } from "@finance-web/groshly/main";
import { initial } from "@finance-web/groshly/data";

const TestApp = GroshlyApp as ComponentType<{
  initialData: ReturnType<typeof initial>;
  onSaveDebt: (input: { values: { recordTransaction?: boolean } }) => Promise<ReturnType<typeof initial>>;
}>;

afterEach(() => vi.unstubAllGlobals());

describe("Groshly debt creation", () => {
  it("shows its loading alert while saving a debt without an account transaction", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const data = initial();
    data.onboarded = true;
    data.lang = "en";
    let finish!: (value: ReturnType<typeof initial>) => void;
    const onSaveDebt = vi.fn((input: { values: { recordTransaction?: boolean } }) => {
      expect(input.values).toBeDefined();
      return new Promise<ReturnType<typeof initial>>((resolve) => { finish = resolve; });
    });
    render(<TestApp initialData={data} onSaveDebt={onSaveDebt} />);

    fireEvent.click(screen.getByRole("button", { name: /all debts/i }));
    fireEvent.click(screen.getByRole("button", { name: "New debt" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Alex"), { target: { value: "Item" } });
    fireEvent.change(screen.getByLabelText("AMOUNT"), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("switch", { name: "Record in account" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaveDebt).toHaveBeenCalledOnce());
    expect(onSaveDebt.mock.calls[0]?.[0]?.values.recordTransaction).toBe(false);
    expect(screen.getByText("Creating debt").closest('[role="status"]')).toBeInTheDocument();
    finish(data);
    await waitFor(() => expect(screen.getByText("Debt created")).toBeInTheDocument());
  });
});
