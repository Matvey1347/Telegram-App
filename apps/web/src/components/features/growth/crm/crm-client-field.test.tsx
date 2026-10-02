import { render, screen } from "@testing-library/react";
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
});
