import { describe, expect, it } from "vitest";
import type { TelegramPublicationPlanCalendarEvent } from "@telegram-system/shared";
import {
  eventMatchesPublicationSlot,
  isPublicationCalendarLoading,
  shouldLoadPublicationCalendar,
} from "./publication-plan-calendar-page";
import { indexPublicationCalendarItems } from "./publication-calendar-index";

describe("isPublicationCalendarLoading", () => {
  it("keeps the loading state visible while the derived default plan loads", () => {
    expect(isPublicationCalendarLoading(false, "plan-1", true)).toBe(true);
  });

  it("does not block the calendar when no plan can be selected", () => {
    expect(isPublicationCalendarLoading(false, "", true)).toBe(false);
  });
});

describe("shouldLoadPublicationCalendar", () => {
  it("starts a default calendar request before the schedule list finishes", () => {
    expect(shouldLoadPublicationCalendar(true, "")).toBe(true);
  });

  it("loads an explicitly selected schedule after the list has loaded", () => {
    expect(shouldLoadPublicationCalendar(false, "plan-1")).toBe(true);
  });

  it("does not request a default calendar after an empty schedule list", () => {
    expect(shouldLoadPublicationCalendar(false, "")).toBe(false);
  });
});

describe("eventMatchesPublicationSlot", () => {
  it("keeps a 10:10 VP on its 10:10 slot across the Warsaw DST boundary", () => {
    const event: TelegramPublicationPlanCalendarEvent = {
      id: "vp-1",
      channelId: "channel-1",
      // 10:10 in Warsaw after the clock changes back on 25 October.
      scheduledAt: "2026-10-25T09:10:00.000Z",
      title: "Partner publication",
      kind: "VP",
      slotId: null,
    };
    const slot = {
      slotId: "ad-1010",
      // The legacy canonical-UTC slot occurrence is one hour earlier.
      scheduledAt: "2026-10-25T08:10:00.000Z",
      title: "Ad slot",
      time: "10:10",
    };

    expect(eventMatchesPublicationSlot(event, slot, "Europe/Warsaw")).toBe(
      true,
    );
  });

  it("does not attach an event with a different displayed time", () => {
    const event: TelegramPublicationPlanCalendarEvent = {
      id: "vp-2",
      channelId: "channel-1",
      scheduledAt: "2026-10-25T10:10:00.000Z",
      title: "Later partner publication",
      kind: "VP",
      slotId: null,
    };
    const slot = {
      slotId: "ad-1010",
      scheduledAt: "2026-10-25T08:10:00.000Z",
      title: "Ad slot",
      time: "10:10",
    };

    expect(eventMatchesPublicationSlot(event, slot, "Europe/Warsaw")).toBe(
      false,
    );
  });
});

describe("indexPublicationCalendarItems", () => {
  it("groups visible slots and events once and attaches DST-matched events to their slot", () => {
    const event: TelegramPublicationPlanCalendarEvent = {
      id: "vp-1",
      channelId: "channel-1",
      scheduledAt: "2026-10-25T09:10:00.000Z",
      title: "Partner publication",
      kind: "VP",
      slotId: null,
    };
    const slot = {
      slotId: "ad-1010",
      scheduledAt: "2026-10-25T08:10:00.000Z",
      title: "Ad slot",
      time: "10:10",
    };
    const indexed = indexPublicationCalendarItems(
      [slot],
      [event],
      "Europe/Warsaw",
    );

    expect(indexed.get("2026-10-25")).toMatchObject({
      slots: [slot],
      outsideEvents: [],
    });
    expect(
      indexed
        .get("2026-10-25")
        ?.eventsBySlot.get(`${slot.slotId}:${slot.scheduledAt}`),
    ).toEqual([event]);
  });
});
