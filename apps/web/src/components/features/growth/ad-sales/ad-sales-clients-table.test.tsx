import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdSalesClientsTable } from "./ad-sales-clients-table";

describe("AdSalesClientsTable", () => {
  it("shows native UAH revenue without workspace currency conversions", () => {
    const onOpenOrders = vi.fn();
    render(
      <AdSalesClientsTable
        clients={[
          {
            id: "no-client",
            displayName: "Advertiser",
            companyName: null,
            telegramUsername: null,
            description: null,
            phone: null,
            email: null,
            website: null,
            primaryContact: null,
            ownerMember: null,
            status: "LEAD",
            lifecycleStage: "NEW",
            completedSalesCount: 0,
            totalSalesCount: 5,
            paidSalesCount: 5,
            completedPlacementsCount: 0,
            totalPlacementsCount: 14,
            totalRevenueInPrimaryCurrency: "19.87",
            averageOrderValueInPrimaryCurrency: "3.97",
            revenueByCurrency: [{ currency: "UAH", amount: "887.93" }],
            averageOrderValueByCurrency: [
              { currency: "UAH", amount: "177.586" },
            ],
            firstPurchaseAt: null,
            lastPurchaseAt: null,
            lastContactAt: null,
            nextContactAt: null,
            daysSinceLastPurchase: null,
            recencyBucket: "NONE",
            frequencyBucket: "NONE",
            monetaryValue: 19.87,
            isHighValue: false,
            rfmSegment: "LEAD",
            priorityRank: 1,
            urgency: "NONE",
            nextOpenTask: null,
            lostReason: null,
            lostAt: null,
          } as never,
        ]}
        overdueTaskCount={0}
        onOpenOrders={onOpenOrders}
      />,
    );

    expect(screen.getByText("No client")).toBeTruthy();
    expect(screen.getByText("887.93 UAH")).toBeTruthy();
    expect(screen.queryByText(/19\.87|PLN|USD/)).toBeNull();
    expect(screen.getByText("Orders")).toBeTruthy();
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(screen.getByText("5 / 5")).toBeTruthy();
    expect(screen.getByText("Placements")).toBeTruthy();
    expect(screen.queryByText("Sales")).toBeNull();
    expect(screen.queryByText(/has at least one active deal now/i)).toBeNull();
    expect(screen.getByText("No client").closest("article")?.parentElement?.className).not.toContain(
      "bg-[#171717]",
    );
  });

  it("opens all orders for the selected client", async () => {
    const user = userEvent.setup();
    const onOpenOrders = vi.fn();
    const client = {
      id: "client-orders",
      displayName: "Order Client",
      companyName: null,
      telegramUsername: null,
      primaryContact: null,
      status: "ACTIVE",
      totalSalesCount: 2,
      paidSalesCount: 2,
      totalPlacementsCount: 2,
      revenueByCurrency: [],
    } as never;

    render(
      <AdSalesClientsTable
        clients={[client]}
        overdueTaskCount={0}
        onOpenOrders={onOpenOrders}
      />,
    );

    await user.hover(screen.getByText("Active"));
    expect(
      await screen.findByText(/deletion timer is running/i),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: "View 2 orders for Order Client",
      }),
    );
    expect(onOpenOrders).toHaveBeenCalledWith(client);

    await user.click(
      screen.getByRole("button", {
        name: "View paid orders for Order Client",
      }),
    );
    expect(onOpenOrders).toHaveBeenCalledTimes(2);
    expect(onOpenOrders).toHaveBeenLastCalledWith(client);
  });

  it("shows purchased channel avatars and opens the complete channel list", async () => {
    const user = userEvent.setup();
    render(
      <AdSalesClientsTable
        clients={[
          {
            id: "client-channels",
            displayName: "Channel Buyer",
            companyName: null,
            telegramUsername: null,
            primaryContact: null,
            ownerMember: null,
            status: "ACTIVE",
            activityStatus: "WAITING",
            totalSalesCount: 2,
            paidSalesCount: 2,
            totalPlacementsCount: 6,
            revenueByCurrency: [],
            purchasedChannels: [
              { id: "channel-1", title: "Channel One", photoUrl: null },
              { id: "channel-2", title: "Channel Two", photoUrl: null },
            ],
          } as never,
        ]}
        overdueTaskCount={0}
      />,
    );

    expect(screen.getByText("Waiting")).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: "View channels purchased by Channel Buyer",
      }),
    );

    expect(screen.getByText("2 channels")).toBeTruthy();
    expect(screen.getByText("Channel One")).toBeTruthy();
    expect(screen.getByText("Channel Two")).toBeTruthy();
  });

  it("shows one Telegram username, profile link, description, and saves client details", async () => {
    const user = userEvent.setup();
    const onUpdateClient = vi.fn().mockResolvedValue({});
    render(
      <AdSalesClientsTable
        clients={[
          {
            id: "client-1",
            displayName: "Eva Love",
            companyName: "Eva Studio",
            telegramUsername: "@evaloveconnect",
            description: "Repeat advertiser interested in psychology channels.",
            phone: null,
            email: null,
            website: null,
            primaryContact: null,
            ownerMember: null,
            status: "ACTIVE",
            lifecycleStage: "CUSTOMER",
            completedSalesCount: 1,
            totalSalesCount: 1,
            paidSalesCount: 1,
            completedPlacementsCount: 1,
            totalPlacementsCount: 1,
            totalRevenueInPrimaryCurrency: "102",
            averageOrderValueInPrimaryCurrency: "102",
            revenueByCurrency: [{ currency: "UAH", amount: "102" }],
            averageOrderValueByCurrency: [{ currency: "UAH", amount: "102" }],
            firstPurchaseAt: null,
            lastPurchaseAt: null,
            lastContactAt: null,
            nextContactAt: null,
            daysSinceLastPurchase: null,
            recencyBucket: "NONE",
            frequencyBucket: "NONE",
            monetaryValue: 102,
            isHighValue: false,
            rfmSegment: "ACTIVE",
            priorityRank: 1,
            urgency: "NONE",
            nextOpenTask: null,
            lostReason: null,
            lostAt: null,
          } as never,
        ]}
        overdueTaskCount={0}
        onUpdateClient={onUpdateClient}
      />,
    );

    expect(screen.queryByText("@evaloveconnect")).toBeNull();
    expect(screen.getByRole("link", { name: "Eva Love" })).toHaveAttribute(
      "href",
      "https://t.me/evaloveconnect",
    );
    expect(
      screen.getByText("Repeat advertiser interested in psychology channels."),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Edit Eva Love" }));
    expect(screen.getAllByRole("img", { name: "Eva Love" })).toHaveLength(2);
    const description = screen.getByLabelText("Description");
    await user.clear(description);
    await user.type(description, "Important recurring client");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.queryByLabelText("Description")).toBeNull();

    expect(onUpdateClient).toHaveBeenCalledWith(
      "client-1",
      expect.objectContaining({ description: "Important recurring client" }),
    );
  });
});
