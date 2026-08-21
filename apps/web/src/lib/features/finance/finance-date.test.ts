import { describe, expect, it } from "vitest";
import {
  financeCalendarDate,
  financeCalendarDateToIso,
  financeHistoryDateMatches,
  financeOccurredAtForDate,
  financeToday,
} from "./finance-date";

describe("consumer finance dates", () => {
  it("round-trips a calendar date in UTC+14 without shifting to the previous day", () => {
    const iso = financeCalendarDateToIso("2026-01-02", "Pacific/Kiritimati");
    expect(iso).toBe("2026-01-01T22:00:00.000Z");
    expect(financeCalendarDate(iso, "Pacific/Kiritimati")).toBe("2026-01-02");
  });

  it("uses the profile timezone for today and survives a DST boundary", () => {
    expect(
      financeToday("Pacific/Kiritimati", new Date("2026-01-01T11:30:00.000Z")),
    ).toBe("2026-01-02");
    const iso = financeCalendarDateToIso("2026-03-08", "America/Los_Angeles");
    expect(financeCalendarDate(iso, "America/Los_Angeles")).toBe("2026-03-08");
  });

  it("preserves the original instant while its local calendar date is unchanged", () => {
    const original = "2026-01-01T23:37:00.000Z";
    expect(
      financeOccurredAtForDate("2026-01-02", "Pacific/Kiritimati", original),
    ).toBe(original);
    expect(
      financeOccurredAtForDate("2026-01-03", "Pacific/Kiritimati", original),
    ).toBe("2026-01-02T22:00:00.000Z");
  });

  it("matches date-only bounds locally and timestamp bounds exactly", () => {
    const value = "2026-08-20T22:00:00.000Z";
    expect(
      financeHistoryDateMatches(
        value,
        "2026-08-21",
        "2026-08-21",
        "Pacific/Kiritimati",
      ),
    ).toBe(true);
    expect(
      financeHistoryDateMatches(
        value,
        "2026-08-20T22:00:00.001Z",
        undefined,
        "Pacific/Kiritimati",
      ),
    ).toBe(false);
  });
});
