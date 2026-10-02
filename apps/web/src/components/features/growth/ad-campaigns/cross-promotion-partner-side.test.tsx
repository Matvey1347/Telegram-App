import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CrossPromotionPartnerSide } from "./cross-promotion-partner-side";

vi.mock("./cross-promotion-placement-settings", () => ({
  CrossPromotionPlacementSettings: ({
    title,
    defaultDate,
    onDefaultDateChange,
  }: {
    title: string;
    defaultDate: string;
    onDefaultDateChange: (value: string) => void;
  }) => (
    <div>
      <span>{title}</span>
      <button type="button" onClick={() => onDefaultDateChange("2026-09-20")}>
        Partner publication date {defaultDate}
      </button>
    </div>
  ),
}));

describe("CrossPromotionPartnerSide", () => {
  it("hides partner formats and promo placement until partner channels are selected", () => {
    const onDefaultDateChange = vi.fn();
    const onAddTarget = vi.fn();

    render(
      <CrossPromotionPartnerSide
        expanded
        onExpandedChange={vi.fn()}
        channels={[
          { id: "own-1", title: "My selected publishing channel" } as never,
        ]}
        partnerChannels={[]}
        ownChannels={[
          { id: "own-1", title: "My selected publishing channel" } as never,
        ]}
        partnerIds={[]}
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
        targets={[]}
        onTargetsChange={vi.fn()}
        onAddTarget={onAddTarget}
        onResolved={vi.fn()}
        outboundMode="PROMO"
        onOutboundModeChange={vi.fn()}
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

    expect(screen.getByText("Client")).toBeVisible();
    expect(screen.getByText("Partner channels (optional)")).toBeVisible();
    expect(screen.queryByText("Formats in partner channels")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Add promo placement" }),
    ).toBeNull();
    expect(onDefaultDateChange).not.toHaveBeenCalled();
    expect(onAddTarget).not.toHaveBeenCalled();
  });

  it("can hide the partner side without clearing its fields", () => {
    const onExpandedChange = vi.fn();
    render(
      <CrossPromotionPartnerSide
        expanded={false}
        onExpandedChange={onExpandedChange}
        channels={[]}
        partnerChannels={[]}
        ownChannels={[]}
        partnerIds={[]}
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
        onDefaultDateChange={vi.fn()}
        defaultTime="17:00"
        onSettingsChange={vi.fn()}
        targets={[]}
        onTargetsChange={vi.fn()}
        onResolved={vi.fn()}
        outboundMode="PROMO"
        onOutboundModeChange={vi.fn()}
        outboundPost={{ title: "", text: "", imageUrls: [], buttonRows: [] }}
        onOutboundPostChange={vi.fn()}
        botConnected={false}
        importStatus="idle"
        sendStatus="idle"
        onImportPost={vi.fn()}
        onSendPost={vi.fn()}
        promoReady={false}
      />,
    );

    const toggle = screen.getByRole("button", { name: /Partner side/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Client")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });
});
