import { describe, expect, it } from "vitest";
import {
  amountInDisplayCurrency,
  formatCompactMoney,
  formatMoneyPreview,
  getDominantMoneyAmount,
  getMoneyPreview,
  sumDisplayBalances,
} from "./money";

describe("compact money", () => {
  it("hides zero cents but keeps real cents", () => {
    expect(formatCompactMoney(500, "UAH", "symbol")).toBe("₴ 500");
    expect(formatCompactMoney(500.65, "UAH", "symbol")).toBe("₴ 500.65");
    expect(formatCompactMoney(493.5, "UAH", "code")).toBe("493.50 UAH");
  });
});

const rates = [
  {
    id: "1",
    baseCurrency: "USD",
    targetCurrency: "EUR",
    rate: 0.5,
    date: "2026-08-08",
  },
  {
    id: "2",
    baseCurrency: "USD",
    targetCurrency: "UAH",
    rate: 40,
    date: "2026-08-08",
  },
  {
    id: "3",
    baseCurrency: "USD",
    targetCurrency: "PLN",
    rate: 3.639732,
    date: "2026-08-08",
  },
];

describe("money preview", () => {
  it("renders primary and secondary first, then tertiary currency on the next line", () => {
    const settings = {
      primaryCurrency: "USD",
      secondaryCurrency: "EUR",
      tertiaryCurrency: "UAH",
      currencyDisplayMode: "code" as const,
    };

    expect(
      formatMoneyPreview({ amount: 100, currency: "USD", settings, rates }),
    ).toBe("100.00 USD / 50.00 EUR\n4,000.00 UAH");
  });

  it("keeps preview currencies unique when UAH is already secondary", () => {
    const settings = {
      primaryCurrency: "USD",
      secondaryCurrency: "UAH",
      tertiaryCurrency: "UAH",
      currencyDisplayMode: "code" as const,
    };

    expect(
      getMoneyPreview({ amount: 100, currency: "USD", settings, rates }),
    ).toHaveLength(2);
  });

  it("converts secondary currency through a shared base rate", () => {
    const settings = {
      primaryCurrency: "USD",
      secondaryCurrency: "PLN",
      tertiaryCurrency: "UAH",
      currencyDisplayMode: "symbol" as const,
    };

    expect(
      formatMoneyPreview({ amount: 4000, currency: "UAH", settings, rates }),
    ).toBe("₴ 4,000.00 / $ 100.00\nzł 363.97");
  });

  it("keeps the source transaction currency first when it is not the workspace primary", () => {
    const settings = {
      primaryCurrency: "USD",
      secondaryCurrency: "PLN",
      tertiaryCurrency: "UAH",
      currencyDisplayMode: "code" as const,
    };

    expect(
      formatMoneyPreview({ amount: 1200, currency: "PLN", settings, rates }),
    ).toBe("1,200.00 PLN / 329.69 USD\n13,187.78 UAH");
  });

  it("uses the largest normalized currency total for mixed-currency aggregates", () => {
    expect(
      getDominantMoneyAmount([
        { amount: 1_200, currency: "PLN", amountInPrimaryCurrency: 330 },
        { amount: 50, currency: "USD", amountInPrimaryCurrency: 50 },
      ]),
    ).toEqual({ currency: "PLN", amount: 1_200, amountInPrimary: 330 });
  });
});

describe("display-currency balances", () => {
  const rates = [{ id: "quote", baseCurrency: "PLN", targetCurrency: "UAH", rate: 11, date: "2026-11-24" }];

  it("sums original balances in the chosen currency, preserving signed amounts", () => {
    const balances = [{ balance: 722.46, currency: "UAH" }, { balance: -18, currency: "PLN" }];
    expect(sumDisplayBalances(balances, "UAH", rates)).toBeCloseTo(524.46);
    expect(sumDisplayBalances(balances, "PLN", rates)).toBeCloseTo(722.46 / 11 - 18);
    expect(amountInDisplayCurrency(722.46, "UAH", "UAH")).toBe(722.46);
  });

  it("withholds an incomplete total and handles an empty or zero balance", () => {
    expect(sumDisplayBalances([{ balance: 5, currency: "GBP" }], "UAH", rates)).toBeNull();
    expect(sumDisplayBalances([{ balance: 0, currency: "GBP" }], "UAH", rates)).toBe(0);
    expect(sumDisplayBalances([
      { balance: 50, currency: "GBP" },
      { balance: -50, currency: "GBP" },
    ], "UAH", rates)).toBe(0);
    expect(sumDisplayBalances([], "UAH")).toBe(0);
  });
});
