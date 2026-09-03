import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CrmContactListItem } from "@telegram-system/shared";
import { CrmContactCard } from "./crm-contact-list";

const contact: CrmContactListItem = {
  id: "contact-1",
  workspaceId: "workspace-1",
  displayName: "Ada Client",
  companyName: "Analytical Engines",
  telegramUsername: "ada",
  phone: null,
  email: null,
  website: null,
  description: "Returning customer",
  source: null,
  stage: "CUSTOMER",
  ownerMemberId: "member-1",
  lastContactAt: "2026-08-31T12:00:00.000Z",
  lastInboundAt: "2026-08-31T12:00:00.000Z",
  lastOutboundAt: null,
  lastPurchaseAt: "2026-08-20T12:00:00.000Z",
  nextContactAt: null,
  archivedAt: null,
  activeDealCount: 1,
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-08-31T12:00:00.000Z",
  ownerMember: {
    id: "member-1",
    name: "Matthew",
    email: null,
    avatarPresentation: {
      type: "image",
      id: "owner-avatar",
      url: "https://example.com/matthew.jpg",
    },
  },
  peer: {
    id: "peer-1",
    telegramUserId: "42",
    username: "ada",
    firstName: "Ada",
    lastName: null,
    photoUrl: null,
  },
  unreadCount: 2,
  conversationCount: 1,
  conversationAccounts: [
    { id: "account-1", label: "Sales", username: "sales", photoUrl: null },
  ],
  lastMessage: {
    id: "message-1",
    conversationId: "conversation-1",
    direction: "INBOUND",
    origin: "TELEGRAM_SYNC",
    text: "Can we book the next placement?",
    sentAt: "2026-08-31T12:00:00.000Z",
    readState: "UNREAD",
  },
  nextOpenTask: null,
  activeDeal: {
    id: "deal-1",
    title: "September placement",
    status: "CONFIRMED",
    placementCount: 2,
    settlementCurrency: "UAH",
    agreedAmount: "300",
    paidAmount: "100",
    paymentStatus: "PARTIALLY_PAID",
    scheduledAt: "2026-09-01T12:00:00.000Z",
  },
  salesSummary: {
    totalSalesCount: 4,
    paidSalesCount: 3,
    completedSalesCount: 3,
    totalPlacementsCount: 6,
    revenueByCurrency: [{ currency: "UAH", amount: "735" }],
    lastDealAt: "2026-08-31T12:00:00.000Z",
  },
};

describe("CrmContactCard", () => {
  it("keeps legacy client metrics and layers conversation state onto the card", () => {
    const onAction = vi.fn();
    render(
      <CrmContactCard
        contact={contact}
        canViewSales
        canCreateSales
        onAction={onAction}
      />,
    );

    expect(screen.getByText("Revenue")).toBeTruthy();
    expect(screen.getByText("735 UAH")).toBeTruthy();
    expect(screen.getByText("Orders")).toBeTruthy();
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(screen.getByText("Can we book the next placement?")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Ada Client" })).toHaveAttribute(
      "src",
      "https://t.me/i/userpic/320/ada.jpg",
    );
    fireEvent.click(screen.getByText("Can we book the next placement?"));
    expect(onAction).toHaveBeenCalledWith("conversations");
    expect(screen.getByText("via @sales")).toBeTruthy();
  });

  it("opens focused client actions from the shared three-dot menu", () => {
    const onAction = vi.fn();
    render(
      <CrmContactCard
        contact={contact}
        canViewSales
        canCreateSales
        onAction={onAction}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Ada Client" }),
    );
    expect(screen.queryByRole("menuitem", { name: "Payments" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Tags" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Automation" })).toBeNull();
    expect(screen.queryByText(/Automated messages/i)).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Deals" }));
    expect(onAction).toHaveBeenCalledWith("deals");
  });

  it("deduplicates a username, highlights the stage, and omits empty timeline rows", () => {
    render(
      <CrmContactCard
        contact={{
          ...contact,
          displayName: "@Artur_Pikhulia",
          telegramUsername: "artur_pikhulia",
          companyName: null,
          stage: "NEW",
          lastContactAt: null,
          nextContactAt: null,
          nextOpenTask: null,
          activeDeal: null,
          activeDealCount: 0,
          salesSummary: { ...contact.salesSummary, lastDealAt: null },
        }}
        canViewSales
        canCreateSales
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Artur_Pikhulia")).toBeInTheDocument();
    expect(screen.queryByText("@Artur_Pikhulia")).toBeNull();
    expect(screen.queryByText("artur_pikhulia")).toBeNull();
    expect(screen.getByText("NEW").className).toContain("text-blue-200");
    expect(screen.queryByText("Last contact")).toBeNull();
    expect(screen.queryByText("Next contact")).toBeNull();
    expect(screen.queryByText("Active deal")).toBeNull();
  });

  it("hides an empty conversation block and renders the owner avatar", () => {
    render(
      <CrmContactCard
        contact={{ ...contact, lastMessage: null, conversationCount: 0 }}
        canViewSales
        canCreateSales
        onAction={vi.fn()}
      />,
    );

    expect(screen.queryByText("No messages yet")).toBeNull();
    expect(screen.queryByText("0 conversations")).toBeNull();
    expect(screen.getByRole("img", { name: "Matthew" })).toHaveAttribute(
      "src",
      "https://example.com/matthew.jpg",
    );
  });
});
