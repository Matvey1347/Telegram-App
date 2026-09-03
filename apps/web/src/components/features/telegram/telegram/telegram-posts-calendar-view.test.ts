import { describe, expect, it } from "vitest";
import { calendarWeekdays, monthLabel } from "./telegram-posts-calendar-view";

describe("Telegram posts calendar localization", () => {
  it("formats the month and weekdays in Russian", () => {
    const september = new Date(2026, 8, 1);

    expect(monthLabel(september, "ru-RU")).toContain("сентябрь");
    expect(calendarWeekdays("ru-RU")).toEqual([
      "пн",
      "вт",
      "ср",
      "чт",
      "пт",
      "сб",
      "вс",
    ]);
  });
});
