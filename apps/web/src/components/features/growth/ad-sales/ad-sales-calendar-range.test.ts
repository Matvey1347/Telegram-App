import { describe, expect, it } from "vitest";
import {
  monthGridDays,
  rangeForCalendarMode,
  rangeForVisibleCalendarDays,
} from "./ad-sales-calendar-range";

describe("rangeForVisibleCalendarDays", () => {
  it("includes the next-month cells displayed by a month grid", () => {
    const cursor = new Date(2026, 8, 30);
    const selectedRange = rangeForCalendarMode("month", cursor);
    const visibleRange = rangeForVisibleCalendarDays(monthGridDays(cursor), selectedRange);

    expect(visibleRange.from).toEqual(new Date(2026, 7, 31));
    expect(visibleRange.to).toEqual(new Date(2026, 9, 11, 23, 59, 59, 999));
  });
});
