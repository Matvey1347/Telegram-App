import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CrmClientField } from "./crm-client-field";

describe("CrmClientField", () => {
  it("keeps the saved client selected when the editor opens before any search", () => {
    const { container } = render(
      <CrmClientField
        contact="@partner"
        selectedAdvertiserId="client-1"
        selectedClient={{
          id: "client-1",
          displayName: "Partner client",
          telegramUsername: "@partner",
          photoUrl: "https://cdn.example.com/partner.jpg",
        }}
        onContactChange={vi.fn()}
        onTelegramChange={vi.fn()}
        onSelect={vi.fn()}
        onSearchAdvertisers={vi.fn().mockResolvedValue([])}
      />,
    );

    expect(screen.getByText("Existing client")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Partner client/i }),
    ).toBeInTheDocument();
    expect(
      container.querySelector('img[src="https://cdn.example.com/partner.jpg"]'),
    ).toBeInTheDocument();
  });

  it("resolves an exact existing Telegram username typed as a new client", async () => {
    const advertiser = {
      id: "client-existing",
      displayName: "Returning client",
      telegramUsername: "@partner_123",
      totalSalesCount: 3,
    };
    const onSelect = vi.fn();
    const onSearchAdvertisers = vi.fn().mockResolvedValue([advertiser]);
    const onContactChange = vi.fn();
    const onTelegramChange = vi.fn();
    const { rerender } = render(
      <CrmClientField
        contact=""
        selectedAdvertiserId={null}
        onContactChange={onContactChange}
        onTelegramChange={onTelegramChange}
        onSelect={onSelect}
        onSearchAdvertisers={onSearchAdvertisers}
        resolveExistingOnNewContact
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Telegram username" }), {
      target: { value: "@partner_123" },
    });
    rerender(
      <CrmClientField
        contact="@partner_123"
        selectedAdvertiserId={null}
        onContactChange={onContactChange}
        onTelegramChange={onTelegramChange}
        onSelect={onSelect}
        onSearchAdvertisers={onSearchAdvertisers}
        resolveExistingOnNewContact
      />,
    );

    await waitFor(() => expect(onSearchAdvertisers).toHaveBeenCalledWith("partner_123"));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(advertiser));
    expect(onContactChange).toHaveBeenCalledWith("@partner_123");
    expect(onTelegramChange).toHaveBeenCalledWith("@partner_123");
    expect(screen.getByText("Existing client")).toBeInTheDocument();
  });
});
