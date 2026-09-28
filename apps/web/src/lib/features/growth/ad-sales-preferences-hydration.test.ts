import type { TelegramAdSalesMemberPreferences } from "@telegram-system/shared";
import { describe, expect, it } from "vitest";
import {
  resolveAdSalesPreferenceSelection,
  revealCreatedPlacementChannels,
} from "./ad-sales-preferences-hydration";

const preferences: TelegramAdSalesMemberPreferences = {
  id: "preferences-1",
  workspaceId: "workspace-1",
  workspaceMemberId: "member-1",
  selectedChannelIds: ["channel-1", "channel-2"],
  selectedNetworkId: "network-1",
  calendarView: "month",
  initialized: true,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
};

describe("resolveAdSalesPreferenceSelection", () => {
  it("waits for channels and networks when preferences arrive first", () => {
    const pending = resolveAdSalesPreferenceSelection({
      preferences,
      channelsReady: false,
      networksReady: false,
      saleableChannelIds: [],
      networks: [],
    });

    expect(pending).toBeNull();

    const hydrated = resolveAdSalesPreferenceSelection({
      preferences,
      channelsReady: true,
      networksReady: true,
      saleableChannelIds: ["channel-1", "channel-2"],
      networks: [
        {
          id: "network-1",
          channels: [{ id: "channel-1" }, { id: "channel-2" }],
        },
      ],
    });

    expect(hydrated).toEqual({
      selectedChannelIds: ["channel-1", "channel-2"],
      selectedNetworkId: "network-1",
    });
  });

  it("lets a valid channel deep link override persisted selection", () => {
    expect(
      resolveAdSalesPreferenceSelection({
        preferences,
        channelsReady: true,
        networksReady: true,
        saleableChannelIds: ["channel-1", "channel-2"],
        networks: [
          {
            id: "network-1",
            channels: [{ id: "channel-1" }, { id: "channel-2" }],
          },
        ],
        requestedChannelId: "channel-2",
      }),
    ).toEqual({ selectedChannelIds: ["channel-2"], selectedNetworkId: "" });
  });
});

describe("revealCreatedPlacementChannels", () => {
  it("adds a newly booked channel and clears a restrictive network scope", () => {
    expect(
      revealCreatedPlacementChannels({
        selectedChannelIds: ["channel-1"],
        selectedNetworkId: "network-1",
        activeChannelIds: ["channel-1"],
        saleableChannelIds: ["channel-1", "channel-2"],
        createdChannelIds: ["channel-2"],
      }),
    ).toEqual({
      selectedChannelIds: ["channel-1", "channel-2"],
      selectedNetworkId: "",
    });
  });

  it("keeps the all-channels selection unchanged", () => {
    expect(
      revealCreatedPlacementChannels({
        selectedChannelIds: [],
        selectedNetworkId: "",
        activeChannelIds: ["channel-1"],
        saleableChannelIds: ["channel-1"],
        createdChannelIds: ["channel-1"],
      }),
    ).toEqual({ selectedChannelIds: [], selectedNetworkId: "" });
  });

  it("expands an empty network selection with the active network channels", () => {
    expect(
      revealCreatedPlacementChannels({
        selectedChannelIds: [],
        selectedNetworkId: "network-1",
        activeChannelIds: ["channel-1"],
        saleableChannelIds: ["channel-1", "channel-2"],
        createdChannelIds: ["channel-2"],
      }),
    ).toEqual({
      selectedChannelIds: ["channel-1", "channel-2"],
      selectedNetworkId: "",
    });
  });
});
