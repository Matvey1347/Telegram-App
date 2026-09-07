import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CrmContactListItem } from "@telegram-system/shared";
import {
  CrmContactsSkeleton,
  CrmMinimizedChatLauncher,
} from "./crm-contact-card-support";
import {
  CrmContactCard,
  CrmContactStageFilters,
  crmContactStageFromSearchParams,
  crmContactStageSearchParams,
} from "./crm-contact-list";

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
    expect(screen.queryByText("Orders")).not.toBeInTheDocument();
    expect(screen.queryByText("Members")).not.toBeInTheDocument();
    expect(screen.queryByText("Last contact")).not.toBeInTheDocument();
  });

  it("exposes compact status filters including all contacts", () => {
    const onChange = vi.fn();
    render(<CrmContactStageFilters value="ALL" onChange={onChange} />);

    expect(screen.getByRole("button", { name: "ALL" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("group", { name: "Filter contacts by status" }),
    ).toHaveClass("p-1");
    fireEvent.click(screen.getByRole("button", { name: "FOLLOW-UP" }));
    expect(onChange).toHaveBeenCalledWith("FOLLOW_UP");
    fireEvent.click(screen.getByRole("button", { name: "ARCHIVED" }));
    expect(onChange).toHaveBeenCalledWith("ARCHIVED");
  });

  it("stores the selected status in the URL and restores it", () => {
    const current = new URLSearchParams("crmContact=contact-1");
    const selected = crmContactStageSearchParams(current, "CUSTOMER");

    expect(selected.get("stage")).toBe("CUSTOMER");
    expect(selected.get("crmContact")).toBe("contact-1");
    expect(crmContactStageFromSearchParams(selected)).toBe("CUSTOMER");

    const all = crmContactStageSearchParams(selected, "ALL");
    expect(all.has("stage")).toBe(false);
    expect(crmContactStageFromSearchParams(all)).toBe("ALL");
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

  it.each([
    ["FIRST_INBOUND_READ", "First message · read"],
    ["FIRST_INBOUND_UNREAD", "First message · unread"],
    ["CONVERSATION_UNANSWERED_READ", "Awaiting reply · read"],
    ["CONVERSATION_UNANSWERED_UNREAD", "Awaiting reply · unread"],
  ] as const)(
    "renders %s reply state with directional totals",
    (status, label) => {
      const onMute = vi.fn();
      const { container } = render(
        <CrmContactCard
          contact={{
            ...contact,
            replySummary: {
              status,
              inboundMessageCount: 7,
              outboundMessageCount: 3,
              countsComplete: false,
              unreadCount: status.endsWith("UNREAD") ? 1 : 0,
              muted: false,
            },
          }}
          canViewSales
          canCreateSales
          canEdit
          onReplyMuteChange={onMute}
          onAction={vi.fn()}
        />,
      );

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText("In 7+ · Out 3+")).toBeInTheDocument();
      expect(container.querySelector("article")).toHaveClass(
        "border-rose-800/80",
      );
      if (status.startsWith("CONVERSATION_")) {
        fireEvent.click(
          screen.getByRole("button", { name: /Mute reply alert/u }),
        );
        expect(onMute).toHaveBeenCalledWith(true);
      } else {
        expect(
          screen.queryByRole("button", { name: /Mute reply alert/u }),
        ).toBeNull();
      }
    },
  );

  it("renders the loading state as the same three-column card grid", () => {
    render(<CrmContactsSkeleton count={3} />);

    expect(screen.getByLabelText("Loading contacts")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Loading contact card")).toHaveLength(3);
  });

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
    expect(screen.queryByText("Can we book the next placement?")).toBeNull();
    expect(screen.queryByText(/via @sales/u)).toBeNull();
    expect(screen.getByRole("img", { name: "Ada Client" })).toHaveAttribute(
      "src",
      "https://t.me/i/userpic/320/ada.jpg",
    );
    expect(screen.queryByText("Open conversations")).toBeNull();
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
    const onStageChange = vi.fn();
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
        canEdit
        onStageChange={onStageChange}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Artur_Pikhulia")).toBeInTheDocument();
    expect(screen.queryByText("@Artur_Pikhulia")).toBeNull();
    expect(screen.queryByText("artur_pikhulia")).toBeNull();
    const stage = screen.getByLabelText("Stage for @Artur_Pikhulia");
    expect(stage.className).toContain("button]:text-blue-200");
    fireEvent.click(stage.querySelector("button")!);
    const followUp = screen.getByRole("button", { name: "FOLLOW-UP" });
    expect(followUp).toHaveTextContent("FOLLOW-UP");
    expect(followUp.querySelector("span > span")).toHaveClass(
      "rounded-full",
      "whitespace-nowrap",
    );
    fireEvent.click(screen.getByRole("button", { name: "QUALIFIED" }));
    expect(onStageChange).toHaveBeenCalledWith("QUALIFIED");
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
  });
});
