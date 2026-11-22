import { describe, expect, it } from "vitest";
import type { TelegramPublicationSlotOccurrence } from "@telegram-system/shared";
import { commonAdSlotOptionsForDates } from "./common-ad-slot-options";

function occurrence(date: string, time: string, state = "AVAILABLE") {
  return {
    kind: "AD",
    scheduledAt: `${date}T12:00:00.000Z`,
    timezone: "UTC",
    time,
    state,
    postTitle: null,
  } as TelegramPublicationSlotOccurrence;
}

describe("commonAdSlotOptionsForDates", () => {
  it("shows each available time once only when it is free on every date and channel", () => {
    const options = commonAdSlotOptionsForDates(
      ["channel-a", "channel-b"],
      ["2026-11-22", "2026-11-27"],
      {
        "channel-a": [
          occurrence("2026-11-22", "18:10"),
          occurrence("2026-11-22", "19:10"),
          occurrence("2026-11-27", "18:10"),
          occurrence("2026-11-27", "19:10", "OCCUPIED"),
        ],
        "channel-b": [
          occurrence("2026-11-22", "18:10"),
          occurrence("2026-11-27", "18:10"),
        ],
      },
    );

    expect(options).toEqual([
      expect.objectContaining({
        time: "18:10",
        state: "AVAILABLE",
        detail: "Available in all channels and selected dates",
      }),
    ]);
  });
});
