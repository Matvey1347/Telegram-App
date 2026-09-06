import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { CrmConversationListItem } from "@telegram-system/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { CrmMessageThread } from "./crm-message-thread";

const conversation = {
  id: "conversation-1",
  workspaceId: "workspace-1",
  contactId: "contact-1",
  mtprotoAccountId: "account-1",
  historyExhausted: true,
  unreadCount: 0,
  account: {
    id: "account-1",
    label: "Telegram manager",
    username: "tgManage770",
    photoUrl: "https://cdn.example/manager.jpg",
  },
} as CrmConversationListItem;

describe("CrmMessageThread header", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(telegramCrmApi, "listMessages").mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
  });

  it("does not repeat the MTProto account text above the messages", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <CrmMessageThread
          conversation={conversation}
          canSendManual={false}
        />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText("No messages in this conversation yet."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Replies stay on this Telegram account."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("via @tgManage770")).not.toBeInTheDocument();
  });
});
