import { describe, expect, it } from "vitest";
import { financePageForItem, resizeFinanceListPage } from "./finance-overview-pagination";

describe("resizeFinanceListPage", () => {
  it("loads five latest entries per page on mobile and resets to page one", () => {
    expect(resizeFinanceListPage({ page: 3, pageSize: 10 }, true)).toEqual({
      page: 1,
      pageSize: 5,
    });
  });

  it("keeps ten entries per page on desktop", () => {
    expect(resizeFinanceListPage({ page: 2, pageSize: 5 }, false)).toEqual({
      page: 1,
      pageSize: 10,
    });
  });
});

describe("financePageForItem", () => {
  it("opens the page containing a freshly saved category", () => {
    expect(financePageForItem(["a", "b", "c"], "c", 2)).toBe(2);
  });
});
