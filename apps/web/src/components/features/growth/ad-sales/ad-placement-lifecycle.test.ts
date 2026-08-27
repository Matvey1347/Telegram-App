import { describe, expect, it } from "vitest";
import {
  placementFormatLabel,
  placementRunWindow,
  placementTimer,
} from "./ad-placement-lifecycle";

describe("placementTimer", () => {
  it("counts down to publication before Telegram publishes the post", () => {
    expect(
      placementTimer(
        {
          scheduledAt: "2026-08-27T10:00:00.000Z",
          publishedAt: null,
          plannedDeleteAt: null,
          deletedAt: null,
        } as never,
        new Date("2026-08-27T09:00:00.000Z").getTime(),
      ),
    ).toEqual({ phase: "publication", label: "Publishes in 01:00:00" });
  });

  it("uses each placement's own deletion deadline", () => {
    const base = {
      scheduledAt: "2026-08-27T09:30:00.000Z",
      publishedAt: "2026-08-27T09:31:00.000Z",
      deletedAt: null,
    };
    expect(
      placementTimer(
        {
          ...base,
          plannedDeleteAt: "2026-08-28T10:31:00.000Z",
        } as never,
        new Date("2026-08-27T10:00:00.000Z").getTime(),
      )?.label,
    ).toBe("Auto-delete in 1d 00:31:00");
  });

  it("does not show deletion pending after Telegram confirms the post is missing", () => {
    expect(
      placementTimer(
        {
          scheduledAt: "2026-08-25T17:00:00.000Z",
          publishedAt: "2026-08-25T17:00:00.000Z",
          plannedDeleteAt: "2026-08-27T18:00:00.000Z",
          deletedAt: null,
          managedPost: { telegramRemoteStatus: "MISSING" },
        } as never,
        new Date("2026-08-27T18:05:00.000Z").getTime(),
      ),
    ).toEqual({ phase: "complete", label: "Post deleted" });
  });

  it("shows the actual deletion time when a post stayed longer than planned", () => {
    expect(
      placementRunWindow({
        scheduledAt: "2026-08-20T09:00:00.000Z",
        publishedAt: "2026-08-20T09:00:00.000Z",
        plannedDeleteAt: "2026-08-21T09:00:00.000Z",
        deletedAt: "2026-08-22T12:00:00.000Z",
      } as never),
    ).toContain("22/08/2026");
  });
});

describe("placementFormatLabel", () => {
  it("formats the stored top and feed durations", () => {
    expect(
      placementFormatLabel({
        topDurationMinutesSnapshot: 60,
        feedDurationHoursSnapshot: 24,
        isPermanentSnapshot: false,
      } as never),
    ).toBe("1/24");
  });

  it("preserves sub-hour and permanent formats", () => {
    expect(
      placementFormatLabel({
        topDurationMinutesSnapshot: 30,
        feedDurationHoursSnapshot: null,
        isPermanentSnapshot: true,
      } as never),
    ).toBe("30m/∞");
  });
});
