import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CrmContactListItem } from "@telegram-system/shared";
import {
  CrmContactsSkeleton,
  CrmMinimizedChatLauncher,
} from "./crm-contact-card-support";
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
  isUnassignedClient: false,
  tags: [
    {
      id: "tag-network",
      name: "Network · Business",
      color: "#60a5fa",
      systemKey: "NETWORK:business",
      isSystem: true,
      assignmentMode: "AUTOMATIC",
    },
  ],
  replySummary: {
    status: "NONE",
    inboundMessageCount: 0,
    outboundMessageCount: 0,
    countsComplete: true,
    unreadCount: 0,
    muted: false,
  },
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
  contactChannels: [],
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
    dealMembers: [
      {
        id: "member-1",
        name: "Matthew",
        email: null,
        avatarPresentation: {
          type: "image",
          id: "owner-avatar",
          url: "https://example.com/matthew.jpg",
        },
      },
      {
        id: "member-2",
        name: "Sasha",
        email: null,
        avatarPresentation: {
          type: "unicode",
          value: "🌿",
        },
      },
    ],
  },
};

describe("CrmContactCard", () => {
  it("uses compact cards when the client has no deals", () => {
    render(
      <CrmContactCard
        contact={{
          ...contact,
          activeDeal: null,
          activeDealCount: 0,
          salesSummary: {
            totalSalesCount: 0,
            paidSalesCount: 0,
            completedSalesCount: 0,
            totalPlacementsCount: 0,
            revenueByCurrency: [],
            lastDealAt: null,
            dealMembers: [],
          },
        }}
        canViewSales
        canCreateSales
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Ada Client")).toBeInTheDocument();
    expect(screen.queryByText("Revenue")).not.toBeInTheDocument();
    expect(screen.queryByText("0 -")).not.toBeInTheDocument();
    expect(screen.queryByText("Members")).not.toBeInTheDocument();
    expect(screen.queryByText("Last contact")).not.toBeInTheDocument();
  });

  it("restores every preserved chat from the minimized launcher", () => {
    const onRestore = vi.fn();
    render(<CrmMinimizedChatLauncher count={3} onRestore={onRestore} />);

    const launcher = screen.getByRole("button", {
      name: "Restore 3 open chats",
    });
    expect(launcher).toHaveTextContent("3");
    expect(screen.getByTestId("minimized-chat-safe-area")).toHaveClass("h-20");
    fireEvent.click(launcher);
    expect(onRestore).toHaveBeenCalledOnce();
  });

  it("does not spend card space on reply-alert status", () => {
    render(
      <CrmContactCard
        contact={{
          ...contact,
          replySummary: {
            ...contact.replySummary,
            status: "CONVERSATION_UNANSWERED_UNREAD",
            inboundMessageCount: 7,
            outboundMessageCount: 3,
          },
        }}
        canViewSales
        onAction={vi.fn()}
      />,
    );

    expect(screen.queryByText(/Awaiting reply|In 7/u)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Mute reply alert/u }),
    ).toBeNull();
  });

  it("renders the loading state as the same three-column card grid", () => {
    render(<CrmContactsSkeleton count={3} />);

    expect(screen.getByLabelText("Loading contacts")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Loading contact card")).toHaveLength(3);
  });

  it("uses a compact metrics row with channel avatars", () => {
    const onAction = vi.fn();
    render(
      <CrmContactCard
        contact={contact}
        canViewSales
        canCreateSales
        onAction={onAction}
      />,
    );

    expect(screen.getByText("735 UAH")).toBeTruthy();
    expect(screen.getByText("4 -")).toBeTruthy();
    expect(screen.getByTitle("Card owner: Matthew")).toBeInTheDocument();
    expect(
      screen.getByTitle("Participant in a sale: Matthew"),
    ).toBeInTheDocument();
    expect(screen.getByText("Network · Business")).toBeInTheDocument();
    expect(screen.queryByText("Can we book the next placement?")).toBeNull();
    expect(screen.queryByText(/via @sales/u)).toBeNull();
    expect(screen.getByRole("img", { name: "Ada Client" })).toHaveAttribute(
      "src",
      "https://t.me/i/userpic/320/ada.jpg",
    );
    expect(screen.queryByText("Open conversations")).toBeNull();
  });

  it("keeps folder tags in the header and gives long names an ellipsis boundary", () => {
    const longName = "A client name that should not widen every CRM card";
    render(
      <CrmContactCard
        contact={{
          ...contact,
          displayName: longName,
          tags: [
            {
              id: "folder-tag",
              name: "Purchases",
              color: "#22c55e",
              systemKey: "TELEGRAM_FOLDER:purchases",
              isSystem: true,
              assignmentMode: "AUTOMATIC",
            },
          ],
        }}
        canViewSales
        onAction={vi.fn()}
      />,
    );

    const name = screen.getByRole("heading", { name: longName });
    expect(name).toHaveClass("max-w-[12rem]", "truncate");
    expect(name.parentElement).toContainElement(screen.getByText("Purchases"));
  });

  it("shows every folder tag from the compact +N control", () => {
    render(
      <CrmContactCard
        contact={{
          ...contact,
          tags: [
            "Inbox",
            "Purchased",
            "Priority",
          ].map((name, index) => ({
            id: `folder-tag-${index}`,
            name,
            color: "#22c55e",
            systemKey: `TELEGRAM_FOLDER:${name.toLowerCase()}`,
            isSystem: true,
            assignmentMode: "AUTOMATIC" as const,
          })),
        }}
        canViewSales
        onAction={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Show all 3 contact tags"));
    expect(screen.getByText("Priority")).toBeInTheDocument();
  });

  it("shows saved contact services on the card and highlights the active one", () => {
    render(
      <CrmContactCard
        contact={{
          ...contact,
          contactChannels: [
            {
              id: "telegram-channel",
              type: "TELEGRAM_USERNAME",
              value: "ada",
              label: "Telegram",
              isPrimary: true,
            },
            {
              id: "instagram-channel",
              type: "OTHER",
              value: "https://instagram.com/ada",
              label: "Instagram",
              isPrimary: false,
            },
          ],
        }}
        canViewSales
        onAction={vi.fn()}
      />,
    );

    const activeTelegram = screen.getByTitle("Active contact: Telegram");
    expect(activeTelegram).toHaveAttribute("href", "https://t.me/ada");
    expect(screen.getByTitle("Contact: Instagram")).toHaveAttribute(
      "href",
      "https://instagram.com/ada",
    );
  });

  it("opens purchased channels in the same compact popover pattern as deal members", () => {
    render(
      <CrmContactCard
        contact={{
          ...contact,
          salesSummary: {
            ...contact.salesSummary,
            purchasedChannels: [
              { id: "channel-1", title: "Channel One", photoUrl: null },
              { id: "channel-2", title: "Channel Two", photoUrl: null },
            ],
          },
        }}
        canViewSales
        onAction={vi.fn()}
      />,
    );

    const preview = screen.getByLabelText("View 2 purchased channels");
    fireEvent.click(preview);
    expect(preview.closest("details")).toHaveAttribute("open");
    expect(screen.getByText("Channel One")).toBeInTheDocument();
    expect(screen.getByText("Channel Two")).toBeInTheDocument();
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
    expect(screen.getByRole("menuitem", { name: "Tags" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Tasks" })).toBeNull();
    expect(
      screen.queryByRole("menuitem", { name: "Notes / Activities" }),
    ).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Automation" })).toBeNull();
    expect(screen.queryByText(/Automated messages/i)).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Deals" }));
    expect(onAction).toHaveBeenCalledWith("deals");
  });

  it("marks contacts without a Telegram chat and does not offer Conversations", () => {
    render(
      <CrmContactCard contact={contact} canViewSales onAction={vi.fn()} />,
    );

    expect(screen.queryByText("Not synced")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Ada Client" }),
    );
    expect(
      screen.queryByRole("menuitem", { name: "Conversations" }),
    ).toBeNull();
  });

  it("deduplicates a username and omits legacy status controls and empty timeline rows", () => {
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
          activeDeal: null,
          activeDealCount: 0,
          salesSummary: { ...contact.salesSummary, lastDealAt: null },
        }}
        canViewSales
        canCreateSales
        canEdit
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Artur_Pikhulia")).toBeInTheDocument();
    expect(screen.queryByText("@Artur_Pikhulia")).toBeNull();
    expect(screen.queryByText("artur_pikhulia")).toBeNull();
    expect(screen.queryByLabelText("Stage for @Artur_Pikhulia")).toBeNull();
    expect(screen.queryByText("Last contact")).toBeNull();
    expect(screen.queryByText("Next contact")).toBeNull();
    expect(screen.queryByText("Active deal")).toBeNull();
  });

  it("shows unique deal-member avatars and expands their compact list", async () => {
    render(
      <CrmContactCard
        contact={contact}
        canViewSales
        canCreateSales
        onAction={vi.fn()}
      />,
    );

    expect(screen.queryByText("No messages yet")).toBeNull();
    expect(screen.queryByText("0 conversations")).toBeNull();
    const preview = screen.getByLabelText("Show 2 deal members");
    expect(preview.querySelectorAll("img")).toHaveLength(1);
    expect(preview).toHaveTextContent("🌿");
    expect(preview.querySelector('img[alt="Matthew"]')).toHaveAttribute(
      "src",
      "https://example.com/matthew.jpg",
    );
    fireEvent.click(preview);
    expect(preview.closest("details")).toHaveAttribute("open");
    expect(screen.getAllByText("Matthew")).toHaveLength(1);
    expect(screen.getAllByText("Sasha")).toHaveLength(1);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(preview.closest("details")).not.toHaveAttribute("open"),
    );
    fireEvent.click(preview);
    expect(preview.closest("details")).toHaveAttribute("open");
    fireEvent.pointerDown(document.body);
    await waitFor(() =>
      expect(preview.closest("details")).not.toHaveAttribute("open"),
    );
  });

  it("renders sales without a selected client as an unassigned aggregate", () => {
    render(
      <CrmContactCard
        contact={{
          ...contact,
          displayName: "Advertiser",
          companyName: null,
          telegramUsername: null,
          peer: null,
          isUnassignedClient: true,
        }}
        canViewSales
        canCreateSales
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Client not specified")).toBeInTheDocument();
    expect(screen.queryByText("UNASSIGNED")).toBeNull();
    expect(
      screen.getByText("Deals created without selecting a client"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Unassigned client icon")).toHaveClass(
      "items-center",
      "justify-center",
    );
    expect(screen.queryByText("CUSTOMER")).toBeNull();
    expect(screen.queryByText("No username")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Actions for Advertiser" }),
    ).toBeNull();
  });
});
