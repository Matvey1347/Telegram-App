import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TelegramAdSale } from "@telegram-system/shared";
import { SalesTab } from "./ad-sales-sales-tab";

describe("SalesTab", () => {
  it("shows the buyer, channel preview, and received amount without legacy status fields", () => {
    const onOpenSale = vi.fn();
    const sale = {
      id: "sale-1",
      title: null,
      advertiserTelegramSnapshot: "@buyer",
      advertiserTelegram: null,
      advertiserNameSnapshot: null,
      advertiserName: null,
      advertiserContact: null,
      settlementCurrency: "USD",
      origin: "REPEAT",
      assignedMember: {
        id: "member-1",
        name: "Matthew Kayden",
        email: "matthew@example.com",
        avatarPresentation: {
          type: "unicode",
          value: "👨🏻",
          name: null,
        },
      },
      totalPaidAmount: "100",
      payments: [
        {
          id: "payment-1",
          amount: "4100",
          currency: "UAH",
          paidAt: "2026-08-20T11:00:00.000Z",
          status: "ACTIVE",
        },
      ],
      outstandingAmount: "0",
      createdAt: "2026-08-20T10:00:00.000Z",
      placements: [
        {
          id: "placement-1",
          telegramChannelId: "channel-1",
          scheduledAt: "2026-08-22T10:00:00.000Z",
          telegramPostId: null,
          telegramPost: {
            viewsCount: 1200,
            reactionsCount: 45,
            commentsCount: 6,
            forwardsCount: 18,
          },
          publishedAt: "2026-08-22T09:00:00.000Z",
          plannedDeleteAt: "2026-08-23T11:00:00.000Z",
        },
        {
          id: "placement-2",
          telegramChannelId: "channel-2",
          scheduledAt: "2026-08-22T10:00:00.000Z",
          telegramPostId: null,
          telegramPost: {
            viewsCount: 800,
            reactionsCount: 30,
            commentsCount: 4,
            forwardsCount: 12,
          },
          publishedAt: "2026-08-22T09:00:00.000Z",
          plannedDeleteAt: "2026-08-23T11:00:00.000Z",
        },
      ],
    } as unknown as TelegramAdSale;

    render(
      <SalesTab
        sales={[sale]}
        channels={[
          {
            id: "channel-1",
            title: "Mentor Self-development",
            photoUrl: null,
          } as never,
          {
            id: "channel-2",
            title: "Business Patterns",
            photoUrl: null,
          } as never,
        ]}
        loading={false}
        error={null}
        page={1}
        pageSize={25}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
        settings={undefined}
        rates={undefined}
        onOpenSale={onOpenSale}
        onDeleteSale={vi.fn()}
      />,
    );

    expect(screen.getByText("@buyer")).toBeTruthy();
    expect(screen.getByText("Mentor Self-development")).toBeTruthy();
    expect(screen.getByText("Business Patterns")).toBeTruthy();
    const channelPreview = screen.getByLabelText("Show 2 placement channels");
    expect(channelPreview).toBeTruthy();
    fireEvent.click(channelPreview);
    expect(onOpenSale).not.toHaveBeenCalled();
    expect(screen.getByText("Repeat sales")).toBeTruthy();
    expect(screen.getByText("Matthew Kayden")).toBeTruthy();
    expect(screen.getByText("Money received")).toBeTruthy();
    expect(screen.getByText("2/2 posts linked")).toBeTruthy();
    expect(screen.getByText("Automatic deletion pending")).toBeTruthy();
    expect(screen.queryByText("20/08/2026")).toBeNull();
    expect(screen.getByText("4,100.00 UAH")).toBeTruthy();
    expect(screen.getByLabelText("Views: 2000")).toBeTruthy();
    expect(screen.getByLabelText("Reactions: 75")).toBeTruthy();
    expect(screen.getByLabelText("Comments: 10")).toBeTruthy();
    expect(screen.getByLabelText("Forwards: 30")).toBeTruthy();
    expect(screen.queryByText(/USD/)).toBeNull();
    expect(screen.queryByText("Untitled Sale")).toBeNull();
    expect(screen.queryByText("Payment status")).toBeNull();
    expect(screen.queryByText("Fulfillment status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Actions for @buyer" }));
    expect(screen.getByRole("menuitem", { name: "Edit deal" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Delete deal" })).toBeTruthy();
  });

  it("collapses multiple placements for one channel into a scheduled range", () => {
    const sale = {
      id: "sale-range",
      advertiserName: "Range buyer",
      advertiserTelegramSnapshot: null,
      advertiserTelegram: null,
      advertiserNameSnapshot: null,
      advertiserContact: null,
      settlementCurrency: "UAH",
      origin: "DIRECT",
      assignedMember: null,
      totalPaidAmount: "300",
      outstandingAmount: "0",
      payments: [],
      createdAt: "2026-08-01T10:00:00.000Z",
      placements: [2, 3, 4, 5, 6].map((day) => ({
        id: `placement-${day}`,
        telegramChannelId: "channel-1",
        scheduledAt: `2026-08-0${day}T12:00:00.000Z`,
        telegramPostId: null,
        publishedAt: null,
        plannedDeleteAt: null,
        deletedAt: null,
        topDurationMinutesSnapshot: 60,
        feedDurationHoursSnapshot: 24,
        isPermanentSnapshot: false,
      })),
    } as unknown as TelegramAdSale;

    render(
      <SalesTab
        sales={[sale]}
        channels={[
          {
            id: "channel-1",
            title: "Mentor Self-development",
            photoUrl: null,
          } as never,
        ]}
        loading={false}
        error={null}
        page={1}
        pageSize={25}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
        settings={undefined}
        rates={undefined}
        onOpenSale={vi.fn()}
        onDeleteSale={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Mentor Self-development")).toHaveLength(1);
    expect(screen.getByText("5 placements")).toBeTruthy();
    expect(screen.getByText(/Scheduled .*02\/08\/2026.*→.*06\/08\/2026/)).toBeTruthy();
    expect(screen.getByText(/· 1\/24$/)).toBeTruthy();
    expect(screen.queryByText("Publication pending")).toBeNull();
  });
});
