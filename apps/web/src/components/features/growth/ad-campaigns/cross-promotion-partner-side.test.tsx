import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("./cross-promotion-target-editor", () => ({
  CrossPromotionTargetEditor: () => <div>Tracking invite link</div>,
}));

describe("CrossPromotionPartnerSide", () => {
  it("hides partner formats until partner channels are selected", async () => {
    const onAddTarget = vi.fn();

    render(
      <CrossPromotionPartnerSide
        expanded
        onExpandedChange={vi.fn()}
        channels={[
          { id: "own-1", title: "My selected publishing channel" } as never,
        ]}
        ownChannels={[
          { id: "own-1", title: "My selected publishing channel" } as never,
        ]}
        partnerAdvertiserId={null}
        partnerContact=""
        onPartnerContactChange={vi.fn()}
        onPartnerTelegramChange={vi.fn()}
        onPartnerAdvertiserChange={vi.fn()}
        onSearchAdvertisers={vi.fn().mockResolvedValue([])}
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
    expect(screen.queryByText("Partner channels")).toBeNull();
    expect(screen.queryByText("Formats in partner channels")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Add promo placement" }),
    ).toBeVisible();
    await waitFor(() => expect(onAddTarget).toHaveBeenCalledOnce());
  });

  it("keeps formats hidden while retaining the required first promo placement", () => {
    render(
      <CrossPromotionPartnerSide
        expanded
        onExpandedChange={vi.fn()}
        channels={[{ id: "own-1", title: "My channel" } as never]}
        ownChannels={[{ id: "own-1", title: "My channel" } as never]}
        partnerAdvertiserId={null}
        partnerContact=""
        onPartnerContactChange={vi.fn()}
        onPartnerTelegramChange={vi.fn()}
        onPartnerAdvertiserChange={vi.fn()}
        onSearchAdvertisers={vi.fn().mockResolvedValue([])}
        targets={[
          {
            telegramChannelId: "own-1",
            promoId: "promo-1",
            inviteLinkId: "link-1",
          },
        ]}
        onTargetsChange={vi.fn()}
        onAddTarget={vi.fn()}
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
        promoReady
      />,
    );

    expect(screen.queryByText("Formats in partner channels")).toBeNull();
    expect(screen.getByText("My channel being promoted")).toBeVisible();
  });

  it("can hide the partner side without clearing its fields", () => {
    const onExpandedChange = vi.fn();
    render(
      <CrossPromotionPartnerSide
        expanded={false}
        onExpandedChange={onExpandedChange}
        channels={[]}
        ownChannels={[]}
        partnerAdvertiserId={null}
        partnerContact=""
        onPartnerContactChange={vi.fn()}
        onPartnerTelegramChange={vi.fn()}
        onPartnerAdvertiserChange={vi.fn()}
        onSearchAdvertisers={vi.fn().mockResolvedValue([])}
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
