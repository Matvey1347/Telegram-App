import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CrmContactDetail } from "@telegram-system/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CrmContactActionModal,
  type CrmContactAction,
} from "./crm-contact-action-modal";

const mocks = vi.hoisted(() => ({
  getContact: vi.fn(),
  updateContact: vi.fn(),
  me: vi.fn(),
  members: vi.fn(),
  listSalesPage: vi.fn(),
  listChannels: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/features/growth/telegram-crm-api", () => ({
  telegramCrmApi: {
    getContact: mocks.getContact,
    updateContact: mocks.updateContact,
  },
}));

vi.mock("@/lib/api", () => ({
  authApi: { me: mocks.me },
  workspaceMembersApi: { select: mocks.members },
  telegramAdSalesApi: {
    listSalesPage: mocks.listSalesPage,
    deleteSale: vi.fn(),
  },
  telegramChannelsApi: { list: mocks.listChannels },
}));

vi.mock("./crm-conversations", () => ({
  CrmConversations: () => <div>Conversation content</div>,
  CrmConversationsSkeleton: () => <div>Loading conversation</div>,
}));

const contact: CrmContactDetail = {
  id: "contact-1",
  workspaceId: "workspace-1",
  displayName: "Ada Client",
  companyName: "Analytical Engines",
  telegramUsername: "ada",
  phone: "+123",
  email: "ada@example.com",
  website: null,
  description: "Returning customer",
  source: "Telegram",
  stage: "CUSTOMER",
  ownerMemberId: "member-1",
  lastContactAt: null,
  lastInboundAt: null,
  lastOutboundAt: null,
  lastPurchaseAt: null,
  nextContactAt: null,
  archivedAt: null,
  activeDealCount: 0,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
  ownerMember: {
    id: "member-1",
    name: "Owner",
    email: null,
    avatarPresentation: null,
  },
  peers: [
    {
      id: "peer-1",
      telegramUserId: "42",
      username: "ada",
      firstName: "Ada",
      lastName: null,
      photoUrl: null,
    },
  ],
  conversationAccounts: [
    {
      id: "account-1",
      label: "Telegram manager",
      username: "tgManage770",
      photoUrl: "https://cdn.example/manager.jpg",
    },
  ],
  unreadCount: 0,
  tags: [],
  paymentSummary: [],
  counts: { conversations: 0, deals: 0, openTasks: 0, activities: 0 },
};

function renderModal(action: CrmContactAction = "info") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CrmContactActionModal
        contactId="contact-1"
        action={action}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("CrmContactActionModal", () => {
  beforeEach(() => {
    mocks.getContact.mockReset().mockResolvedValue(contact);
    mocks.updateContact.mockReset().mockResolvedValue(contact);
    mocks.me.mockReset().mockResolvedValue({
      user: { id: "user-1", name: "Owner", email: "owner@example.com" },
      workspace: {
        id: "workspace-1",
        name: "Workspace",
        role: "OWNER",
        access: { isOwner: true, permissionKeys: [] },
      },
    });
    mocks.members.mockReset().mockResolvedValue([]);
    mocks.listSalesPage.mockReset().mockResolvedValue({
      items: [],
      pagination: {
        page: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
    mocks.listChannels.mockReset().mockResolvedValue([]);
  });

  it("opens one focused client function without a nested tab bar", async () => {
    renderModal();

    expect(
      await screen.findByRole("dialog", {
        name: /Ada Client\s*·\s*Contact info/,
      }),
    ).toBeTruthy();
    expect(screen.getByDisplayValue("ada@example.com")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "CUSTOMER" }));
    expect(screen.getByText("NEW").className).toContain("text-blue-300");
  });

  it("edits and saves contact information", async () => {
    renderModal();

    const phone = await screen.findByLabelText("Phone");
    fireEvent.change(phone, { target: { value: "+456" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.updateContact).toHaveBeenCalledWith(
        "contact-1",
        expect.objectContaining({ phone: "+456" }),
      ),
    );
  });

  it("uses the shared Deals table filtered to the selected contact", async () => {
    renderModal("deals");

    expect(screen.queryByText("All deals")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("columnheader", { name: "Client" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Placement" }),
    ).toBeInTheDocument();
    expect(mocks.listSalesPage).toHaveBeenCalledWith(
      expect.objectContaining({ advertiserId: "contact-1" }),
      expect.any(AbortSignal),
    );
  });

  it("keeps a recoverable error state inside the modal", async () => {
    mocks.getContact.mockRejectedValueOnce(new Error("offline"));
    renderModal();

    expect(
      await screen.findByText("Contact could not be loaded."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("shows paired client and MTProto avatars as the top chat switcher", async () => {
    const secondContact: CrmContactDetail = {
      ...contact,
      id: "contact-2",
      displayName: "Grace Client",
      telegramUsername: "grace",
      peers: [
        {
          ...contact.peers[0],
          id: "peer-2",
          username: "grace",
          photoUrl: "https://cdn.example/grace.jpg",
        },
      ],
      conversationAccounts: [
        {
          id: "account-2",
          label: "Second manager",
          username: "manager_two",
          photoUrl: "https://cdn.example/manager-two.jpg",
        },
      ],
    };
    mocks.getContact.mockImplementation((contactId: string) =>
      Promise.resolve(contactId === secondContact.id ? secondContact : contact),
    );
    const onSelectChat = vi.fn();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <CrmContactActionModal
          contactId="contact-1"
          action="conversations"
          chatContactIds={["contact-1", "contact-2"]}
          onSelectChat={onSelectChat}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const adaChat = await screen.findByRole("button", {
      name: "Open chat Ada Client via @tgManage770",
    });
    const graceChat = await screen.findByRole("button", {
      name: "Open chat Grace Client via @manager_two",
    });
    expect(adaChat.querySelectorAll("img")).toHaveLength(2);
    expect(graceChat.querySelectorAll("img")).toHaveLength(2);
    expect(screen.queryByText(/Ada Client · Chat/)).not.toBeInTheDocument();

    fireEvent.click(graceChat);
    expect(onSelectChat).toHaveBeenCalledWith("contact-2");
  });
});
