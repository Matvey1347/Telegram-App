import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TelegramPublicationPlanCalendarEvent } from "@telegram-system/shared";
import { PublicationCalendarEventDetailsModal } from "./publication-calendar-event-details-modal";

vi.mock("@/lib/api", () => ({
  telegramChannelsApi: {
    select: vi.fn().mockResolvedValue([{ id: "channel-1", title: "Psychology" }]),
  },
  telegramAdSalesApi: {
    getSale: vi.fn().mockResolvedValue({
      id: "sale-1",
      title: "Autumn campaign",
      advertiserName: "Buyer",
      advertiserTelegram: "@buyer",
      advertiserContact: null,
      status: "CONFIRMED",
      origin: "DIRECT",
      settlementCurrency: "UAH",
      totalAgreedAmount: "500",
      placements: [{
        id: "placement-1",
        telegramChannelId: "channel-1",
        scheduledAt: "2026-10-01T10:00:00.000Z",
        status: "SCHEDULED",
        agreedPrice: "500",
        currency: "UAH",
        managedPost: { title: "Campaign post" },
      }],
    }),
  },
}));

vi.mock("@/lib/features/growth/cross-promotion-plans-api", () => ({
  crossPromotionPlanKeys: { list: (kind: string) => ["plans", kind] },
  crossPromotionPlansApi: { list: vi.fn() },
}));

describe("PublicationCalendarEventDetailsModal", () => {
  it("shows an advertising deal in a modal without leaving the calendar", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const event: TelegramPublicationPlanCalendarEvent = {
      id: "placement-1",
      kind: "AD",
      channelId: "channel-1",
      scheduledAt: "2026-10-01T10:00:00.000Z",
      title: "Autumn campaign",
      slotId: null,
      adSaleId: "sale-1",
    };

    render(
      <QueryClientProvider client={client}>
        <PublicationCalendarEventDetailsModal event={event} onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Autumn campaign")).toBeTruthy();
    expect(screen.getByText("Psychology")).toBeTruthy();
    expect(screen.getByText(/Campaign post/)).toBeTruthy();
    expect(screen.getByText("500 UAH")).toBeTruthy();
  });
});
