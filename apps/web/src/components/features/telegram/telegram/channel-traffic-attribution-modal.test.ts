import { describe, expect, it } from "vitest";
import { pivotTrafficAttributionPoints } from "./channel-traffic-attribution-modal";

describe("pivotTrafficAttributionPoints", () => {
  it("carries the latest source value into subsequent chart dates", () => {
    expect(
      pivotTrafficAttributionPoints([
        {
          at: "2026-09-01T00:00:00.000Z",
          inviteLinkId: "bot-link",
          kind: "BOT",
          acquired: 10,
          retained: 8,
          unsubscribed: 2,
        },
        {
          at: "2026-09-02T00:00:00.000Z",
          inviteLinkId: "ad-link",
          kind: "AD_CAMPAIGNS",
          acquired: 20,
          retained: 20,
          unsubscribed: 0,
        },
      ]),
    ).toEqual([
      { date: "2026-09-01", BOT: 8 },
      { date: "2026-09-02", BOT: 8, AD_CAMPAIGNS: 20 },
    ]);
  });
});
