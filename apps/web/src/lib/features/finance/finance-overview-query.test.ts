import { describe, expect, it } from "vitest";
import { financeOverviewQuery } from "./finance-overview-query";

describe("financeOverviewQuery", () => {
  it("requests only the ten newest records instead of loading every page", () => {
    expect(financeOverviewQuery({ from: "", to: "" })).toEqual({
      sort: "date_desc",
      page: 1,
      pageSize: 10,
    });
  });

  it("keeps the selected period in the paginated request", () => {
    expect(financeOverviewQuery({ from: "2026-08-01", to: "2026-08-27" })).toMatchObject({
      dateFrom: "2026-08-01",
      dateTo: "2026-08-27",
      pageSize: 10,
    });
  });

  it("uses the independently selected overview page", () => {
    expect(financeOverviewQuery({ from: "", to: "" }, { page: 3, pageSize: 25 })).toMatchObject({
      page: 3,
      pageSize: 25,
    });
  });
});
