import {
  managedPostScheduleUi,
  managedPostScheduleUnchanged,
} from "./managed-post-presentation";
import { describe, expect, it } from "vitest";
import messages from "@/i18n/locales/en/telegram/posts/editor";
import { interpolateTranslation } from "@/i18n/types";
import type { TranslationFunction } from "@/providers/i18n-provider";

const t: TranslationFunction = (key, values) =>
  interpolateTranslation(messages[key as keyof typeof messages] ?? key, values);

describe("managed post schedule feedback", () => {
  it("does not claim that a Bot API post is already in Telegram", () => {
    expect(
      managedPostScheduleUi({ title: "Post", scheduleMode: "LOCAL", t }).message,
    ).toContain("not in Telegram Scheduled Messages");
    expect(managedPostScheduleUi({ hasInlineButtons: true, t }).label).toBe(
      "Schedule via Nexeloq",
    );
  });

  it("confirms a native Telegram schedule", () => {
    expect(
      managedPostScheduleUi({ title: "Post", scheduleMode: "TELEGRAM_NATIVE", t })
        .message,
    ).toBe('"Post" scheduled in Telegram.');
    expect(managedPostScheduleUi({ hasInlineButtons: false, t }).label).toBe(
      "Schedule in Telegram",
    );
  });

  it("recognizes an unchanged existing schedule without requiring rescheduling", () => {
    expect(
      managedPostScheduleUnchanged(
        { status: "SCHEDULED", scheduledAt: "2026-08-25T09:00:00.000Z" },
        "2026-08-25T11:00:00.000+02:00",
      ),
    ).toBe(true);
  });

  it("requires scheduling when the time or status changed", () => {
    expect(
      managedPostScheduleUnchanged(
        { status: "SCHEDULED", scheduledAt: "2026-08-25T09:00:00.000Z" },
        "2026-08-25T09:01:00.000Z",
      ),
    ).toBe(false);
    expect(
      managedPostScheduleUnchanged(
        { status: "DRAFT", scheduledAt: "2026-08-25T09:00:00.000Z" },
        "2026-08-25T09:00:00.000Z",
      ),
    ).toBe(false);
  });
});
