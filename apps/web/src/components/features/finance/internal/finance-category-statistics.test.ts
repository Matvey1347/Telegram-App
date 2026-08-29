import { describe, expect, it } from "vitest";
import { getDominantMoneyAmount } from "@/lib/features/finance/money";
import { mapFinanceCategoryStatistics } from "./finance-category-statistics";

describe("finance category statistics read model", () => {
  it("preserves primary totals and dominant-currency inputs", () => {
    const statistics = mapFinanceCategoryStatistics({
      type: "expense",
      items: [
        {
          categoryId: "category-1",
          categoryName: "Operations",
          count: 3,
          totalInPrimaryCurrency: "150",
          currencies: [
            {
              currency: "USD",
              amount: "40",
              amountInPrimaryCurrency: "120",
            },
            {
              currency: "PLN",
              amount: "130",
              amountInPrimaryCurrency: "30",
            },
          ],
        },
      ],
    });

    const category = statistics.get("category-1")!;
    expect(category).toMatchObject({ count: 3, totalPrimary: 150 });
    expect(getDominantMoneyAmount(category.transactions)).toEqual({
      currency: "USD",
      amount: 40,
      amountInPrimary: 120,
    });
  });
});
