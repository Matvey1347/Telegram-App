import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CurrencyAmount } from "./currency-amount";

const rates = [{ id: "quote", baseCurrency: "PLN", targetCurrency: "UAH", rate: 10, date: "2026-11-24" }];

describe("CurrencyAmount", () => {
  it("shows the original signed amount and the conversion below it with trailing symbols", () => {
    render(<CurrencyAmount amount="-168.21" currency="PLN" fallbackCurrency="UAH" rates={rates} />);
    const native = screen.getByText("-168.21 zł");
    const equivalent = screen.getByText("≈ -1,682.10 ₴");
    expect(native).toContainElement(equivalent);
    expect(equivalent).toHaveClass("block");
  });

  it("shows a single amount when the original currency is already selected", () => {
    render(<CurrencyAmount amount={10} currency="UAH" fallbackCurrency="UAH" />);
    expect(screen.getByText("10.00 ₴")).toBeVisible();
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument();
  });

  it("keeps the native amount visible when the exchange rate is unavailable", () => {
    render(<CurrencyAmount amount={10} currency="PLN" fallbackCurrency="UAH" />);
    expect(screen.getByText("10.00 zł")).toBeVisible();
    expect(screen.getByTitle("Exchange rate unavailable")).toHaveTextContent("—");
  });
});
