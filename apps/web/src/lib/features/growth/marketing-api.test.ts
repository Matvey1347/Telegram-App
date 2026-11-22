import { describe, expect, it, vi } from "vitest";
import { createMarketingApi } from "./marketing-api";

describe("campaign invite window feedback", () => {
  it("keeps the request silent when the campaign operation already owns the alert", async () => {
    const put = vi.fn().mockResolvedValue({ data: { failed: [] } });
    const quietMutationConfig = { feedback: { mode: "silent" } };
    const crud = () => ({ list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() });
    const { adCampaignsApi } = createMarketingApi({ api: { put } as never, quietCrud: crud as never, getPaginated: vi.fn() as never, quietMutationConfig: quietMutationConfig as never, streamProgressAction: vi.fn() as never });
    await adCampaignsApi.setInviteLinkWindows("campaign", [{ inviteLinkId: "link", fromDate: "2026-11-13" }]);
    expect(put).toHaveBeenCalledWith("/ad-campaigns/campaign/invite-link-windows", { windows: [{ inviteLinkId: "link", fromDate: "2026-11-13" }] }, quietMutationConfig);
  });
});
