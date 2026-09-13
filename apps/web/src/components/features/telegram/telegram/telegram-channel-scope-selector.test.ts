import { describe, expect, it } from "vitest";
import { resolveTelegramChannelScopeIds } from "./telegram-channel-scope-selector";

const networks = [
  {
    id: "network-1",
    name: "Main network",
    channels: [
      { id: "channel-1", title: "One" },
      { id: "channel-2", title: "Two" },
    ],
  },
] as never;

describe("resolveTelegramChannelScopeIds", () => {
  it("expands a network to its channel ids", () => {
    expect(
      resolveTelegramChannelScopeIds({
        mode: "network",
        selectedNetworkId: "network-1",
        selectedChannelIds: [],
        networks,
      }),
    ).toEqual(["channel-1", "channel-2"]);
  });

  it("uses explicitly selected channels and keeps an empty scope as all", () => {
    expect(
      resolveTelegramChannelScopeIds({
        mode: "channels",
        selectedNetworkId: "",
        selectedChannelIds: ["channel-1", "channel-1"],
        networks,
      }),
    ).toEqual(["channel-1"]);
    expect(
      resolveTelegramChannelScopeIds({
        mode: "network",
        selectedNetworkId: "",
        selectedChannelIds: [],
        networks,
      }),
    ).toEqual([]);
  });
});
