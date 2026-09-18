import { describe, expect, it, vi } from "vitest";
import { createTelegramChannelHelpers } from "./telegram-channel-helpers-api";

describe("telegram channel invite-link options", () => {
  it("loads every invite link with one non-paginated request", async () => {
    const get = vi.fn().mockResolvedValue({ data: [{ id: "link-1" }] });
    const helpers = createTelegramChannelHelpers({
      api: { get } as never,
      getPaginated: vi.fn(),
      streamProgressAction: vi.fn(),
      silentFeedbackConfig: {},
    });

    await expect(
      helpers.getAllTelegramChannelInviteLinks("channel-1"),
    ).resolves.toEqual([{ id: "link-1" }]);
    expect(get).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith(
      "/telegram-channels/channel-1/invite-links/select",
      { params: { all: true } },
    );
  });

  it("loads only the current/default link for a closed selector", async () => {
    const get = vi.fn().mockResolvedValue({ data: [{ id: "link-1" }] });
    const helpers = createTelegramChannelHelpers({
      api: { get } as never,
      getPaginated: vi.fn(),
      streamProgressAction: vi.fn(),
      silentFeedbackConfig: {},
    });

    await helpers.getTelegramChannelInitialInviteLink("channel-1", "link-1");

    expect(get).toHaveBeenCalledWith(
      "/telegram-channels/channel-1/invite-links/select",
      {
        params: { initial: true, selectedId: "link-1" },
        paramsSerializer: { indexes: null },
      },
    );
  });

  it("loads every saved purpose link for closed channel-settings selectors", async () => {
    const get = vi.fn().mockResolvedValue({
      data: [{ id: "link-main" }, { id: "link-vp" }],
    });
    const helpers = createTelegramChannelHelpers({
      api: { get } as never,
      getPaginated: vi.fn(),
      streamProgressAction: vi.fn(),
      silentFeedbackConfig: {},
    });

    await helpers.getTelegramChannelInitialInviteLink(
      "channel-1",
      "link-main",
      ["link-main", "link-vp"],
    );

    expect(get).toHaveBeenCalledWith(
      "/telegram-channels/channel-1/invite-links/select",
      {
        params: {
          initial: true,
          selectedId: "link-main",
          selectedIds: ["link-main", "link-vp"],
        },
        paramsSerializer: { indexes: null },
      },
    );
  });
});
