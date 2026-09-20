import { describe, expect, it } from "vitest";
import type { TelegramPublicationSlotOccurrence } from "@telegram-system/shared";
import { commonAdSlotOptions } from "./common-ad-slot-options";

const occurrence = (
  time: string,
  state: TelegramPublicationSlotOccurrence["state"] = "AVAILABLE",
  kind: TelegramPublicationSlotOccurrence["kind"] = "AD",
): TelegramPublicationSlotOccurrence => ({
  slotId: `slot-${time}`,
  scheduledAt: `2026-09-22T${time}:00.000Z`,
  title: "Advertising",
  kind,
  time,
  timezone: "UTC",
  state,
});

describe("commonAdSlotOptions", () => {
  it("offers only advertising times available in every selected channel", () => {
    expect(
      commonAdSlotOptions(["a", "b"], "2026-09-22", {
        a: [
          occurrence("10:00"),
          occurrence("11:00"),
          occurrence("12:00", "AVAILABLE", "CONTENT"),
        ],
        b: [occurrence("10:00"), occurrence("13:00")],
      }),
    ).toEqual([
      {
        time: "10:00",
        state: "AVAILABLE",
        detail: "Available in all channels",
      },
      {
        time: "11:00",
        state: "UNAVAILABLE",
        detail: "Missing in 1 of 2 channels",
      },
      {
        time: "13:00",
        state: "UNAVAILABLE",
        detail: "Missing in 1 of 2 channels",
      },
    ]);
  });

  it("marks a shared time occupied or past when one channel has that state", () => {
    expect(
      commonAdSlotOptions(["a", "b"], "2026-09-22", {
        a: [occurrence("10:00", "OCCUPIED"), occurrence("11:00", "PAST")],
        b: [occurrence("10:00"), occurrence("11:00")],
      }).map(({ time, state }) => ({ time, state })),
    ).toEqual([
      { time: "10:00", state: "OCCUPIED" },
      { time: "11:00", state: "PAST" },
    ]);
  });

  it("uses the schedule timezone to keep occurrences on the chosen day", () => {
    const late = {
      ...occurrence("01:00"),
      scheduledAt: "2026-09-21T23:00:00.000Z",
      timezone: "Europe/Warsaw",
    };
    expect(
      commonAdSlotOptions(["a"], "2026-09-22", { a: [late] })[0]?.time,
    ).toBe("01:00");
  });
});
