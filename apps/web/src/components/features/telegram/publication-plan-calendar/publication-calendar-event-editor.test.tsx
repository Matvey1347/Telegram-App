import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TelegramPublicationPlanCalendarEvent } from "@telegram-system/shared";
import { PublicationCalendarEventEditor } from "./publication-calendar-event-editor";

vi.mock(
  "@/components/features/growth/ad-sales/ad-sales-sale-details-dialog",
  () => ({
    AdSalesSaleDetailsDialog: ({
      selectedSaleId,
    }: {
      selectedSaleId: string;
    }) => <div>Ad editor: {selectedSaleId}</div>,
  }),
);
vi.mock(
  "@/components/features/growth/ad-campaigns/cross-promotion-plan-modal",
  () => ({
    CrossPromotionPlanModal: ({
      initial,
    }: {
      initial: { id: string } | null;
    }) => <div>VP editor: {initial?.id ?? "loading"}</div>,
  }),
);
vi.mock("@/lib/api", () => ({
  accountsApi: { list: vi.fn().mockResolvedValue([]) },
  currenciesApi: {
    getSettings: vi.fn().mockResolvedValue({}),
    listLatestRates: vi.fn().mockResolvedValue([]),
  },
  telegramAdSalesApi: {
    getSale: vi.fn().mockResolvedValue({ id: "sale-1", placements: [] }),
    listProductsByChannels: vi.fn().mockResolvedValue({}),
  },
  telegramChannelNetworksApi: { list: vi.fn().mockResolvedValue([]) },
  telegramChannelsApi: { select: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/lib/features/growth/cross-promotion-plans-api", () => ({
  crossPromotionPlanKeys: { list: (kind: string) => ["plans", kind] },
  crossPromotionPlansApi: {
    list: vi.fn().mockResolvedValue([{ id: "vp-1" }]),
    saveDraft: vi.fn(),
    updateCompleted: vi.fn(),
    replaceAndSchedule: vi.fn(),
    replaceAndPublishNow: vi.fn(),
    updatePublicationInTelegram: vi.fn(),
    replacePublicationAndPublishNow: vi.fn(),
  },
}));

function renderEditor(event: TelegramPublicationPlanCalendarEvent) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PublicationCalendarEventEditor event={event} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("PublicationCalendarEventEditor", () => {
  it("opens the existing ad-sale editor for an advertising calendar event", async () => {
    renderEditor({
      id: "placement-1",
      kind: "AD",
      channelId: "channel-1",
      scheduledAt: "2026-10-01T10:00:00.000Z",
      title: "Campaign",
      slotId: "slot-1",
      adSaleId: "sale-1",
    });

    expect(await screen.findByText("Ad editor: sale-1")).toBeTruthy();
  });

  it("opens the existing direct-exchange editor for a VP calendar event", async () => {
    renderEditor({
      id: "publication-1",
      kind: "VP",
      channelId: "channel-1",
      scheduledAt: "2026-10-01T10:00:00.000Z",
      title: "Exchange",
      slotId: "slot-1",
      crossPromotionPlanId: "vp-1",
    });

    expect(await screen.findByText("VP editor: vp-1")).toBeTruthy();
  });
});
