import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CrossPromotionPartnerSide } from "./cross-promotion-partner-side";

vi.mock("./cross-promotion-placement-settings", () => ({
  CrossPromotionPlacementSettings: ({
    defaultDate,
    onDefaultDateChange,
  }: {
    defaultDate: string;
    onDefaultDateChange: (value: string) => void;
  }) => (
    <button type="button" onClick={() => onDefaultDateChange("2026-09-20")}>
      Partner publication date {defaultDate}
    </button>
  ),
}));

describe("CrossPromotionPartnerSide", () => {
  it("allows a separate partner date and promoting a channel used on my side", () => {
    const onDefaultDateChange = vi.fn();
    const onOutboundModeChange = vi.fn();

    render(
      <CrossPromotionPartnerSide
        channels={[
          { id: "partner-1", title: "Partner" } as never,
          { id: "own-1", title: "My selected publishing channel" } as never,
        ]}
        partnerChannels={[{ id: "partner-1", title: "Partner" } as never]}
        ownChannels={[
          { id: "own-1", title: "My selected publishing channel" } as never,
        ]}
        partnerIds={["partner-1"]}
        onPartnerIdsChange={vi.fn()}
        partnerAdvertiserId={null}
        partnerContact=""
        onPartnerContactChange={vi.fn()}
        onPartnerTelegramChange={vi.fn()}
        onPartnerAdvertiserChange={vi.fn()}
        onSearchAdvertisers={vi.fn().mockResolvedValue([])}
        importingChannel={false}
        onImportChannel={vi.fn()}
        productsByChannelId={{}}
        settings={{ formatIds: {}, times: {} }}
        defaultDate="2026-09-15"
        onDefaultDateChange={onDefaultDateChange}
        defaultTime="17:00"
        onSettingsChange={vi.fn()}
        basicsReady
        targetIds={[]}
        targets={[]}
        onTargetIdsChange={vi.fn()}
        onTargetsChange={vi.fn()}
        onResolved={vi.fn()}
        outboundMode="PROMO"
        onOutboundModeChange={onOutboundModeChange}
        outboundPost={{ title: "", text: "", imageUrls: [], buttonRows: [] }}
        onOutboundPostChange={vi.fn()}
        botConnected
        importStatus="idle"
        sendStatus="idle"
        onImportPost={vi.fn()}
        onSendPost={vi.fn()}
        promoReady={false}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Partner publication date 2026-09-15",
      }),
    );
    expect(onDefaultDateChange).toHaveBeenCalledWith("2026-09-20");
    expect(screen.getByText("Client")).toBeVisible();
    expect(screen.getByText("Partner channels")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Custom post" }));
    expect(onOutboundModeChange).toHaveBeenCalledWith("CUSTOM");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Select the channel promoted by my promo",
      }),
    );
    expect(screen.getByText("My selected publishing channel")).toBeVisible();
  });
});
