import { describe, expect, it } from "vitest";
import {
  parseTelegramChannelsTab,
  TELEGRAM_CHANNEL_TAB_LABELS,
  TELEGRAM_CHANNEL_TAB_OPTIONS,
} from "./telegram-channels-route-state";

describe("telegram channels route state", () => {
  it("keeps the saved Networks destination available to the page", () => {
    expect(TELEGRAM_CHANNEL_TAB_OPTIONS.all).toEqual([
      "channels",
      "networks",
      "accounts",
    ]);
    expect(parseTelegramChannelsTab("networks")).toBe("networks");
  });

  it("shows Network between Channels and Accounts in the primary tabs", () => {
    expect(TELEGRAM_CHANNEL_TAB_OPTIONS.primary).toEqual([
      "channels",
      "networks",
      "accounts",
    ]);
    expect(
      TELEGRAM_CHANNEL_TAB_OPTIONS.primary.map(
        (tab) => TELEGRAM_CHANNEL_TAB_LABELS[tab],
      ),
    ).toEqual(["Channels", "Network", "Accounts"]);
  });
});
