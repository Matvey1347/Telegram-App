import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { telegramSystemBotApi } from "@/lib/api";
import { AdSalePlacementCard } from "./ad-sale-placement-card";

vi.mock("@/lib/api", () => ({
  telegramSystemBotApi: {
    startPostImport: vi.fn(),
    readPostImport: vi.fn(),
    cancelPostImport: vi.fn(),
    sendPostPreview: vi.fn(),
  },
}));

describe("AdSalePlacementCard bot actions", () => {
  it("offers independent send and import actions for an individual channel post", async () => {
    vi.mocked(telegramSystemBotApi.startPostImport).mockResolvedValue({
      workflowId: "workflow-channel-1",
      mode: "single",
    });
    vi.mocked(telegramSystemBotApi.readPostImport).mockResolvedValue({
      ready: false,
      mode: "single",
      status: "ACTIVE",
    });
    const unmount = render(
      <AdSalePlacementCard
        placement={{
          key: "channel-1:2099-01-01",
          channelId: "channel-1",
          date: "2099-01-01",
          time: "12:00",
          timezone: "Europe/Kyiv",
          productId: "",
          expectedViews: 0,
          targetCpm: "0",
          recommendedPrice: "0",
          minimumPrice: "0",
          agreedPrice: "0",
          pricingMode: "MANUAL",
          manualPriceReason: "",
          warnings: [],
          conflict: null,
          agreedPriceManuallyEdited: false,
          managedPostDraft: {
            title: "Channel ad",
            text: "Post for channel one",
            imageUrls: [],
            buttonRows: [],
          },
        }}
        channel={{ id: "channel-1", title: "Channel one" } as never}
        products={[]}
        currency="UAH"
        priceLocked={false}
        showPricing={false}
        sharedPostActive={false}
        individualPostMode
        systemBotConnected
        systemBotUsername="system_bot"
        workspaceId="workspace-1"
        publishedPosts={[]}
        postsLoading={false}
        setPlacements={vi.fn()}
        onLoadPublishedPosts={vi.fn().mockResolvedValue(null)}
        onManualPriceEdit={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Send current post to bot" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Send from bot" }));

    await waitFor(() =>
      expect(telegramSystemBotApi.startPostImport).toHaveBeenCalledWith({
        mode: "single",
        context: "Ad sale · Channel one",
      }),
    );
    unmount.unmount();
  });
});
