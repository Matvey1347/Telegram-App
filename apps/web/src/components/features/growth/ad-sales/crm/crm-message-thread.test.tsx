import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  CrmConversationListItem,
  CrmMessageListItem,
} from "@telegram-system/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramChannelsApi } from "@/lib/api";
import { TestI18nProvider } from "@/test/render-with-i18n";
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

const onlyMessage = {
  id: "message-1",
  workspaceId: "workspace-1",
  conversationId: conversation.id,
  telegramMessageId: "1",
  telegramMessageIdNumeric: 1,
  clientIdempotencyKey: null,
  mtprotoAccountId: conversation.mtprotoAccountId,
  direction: "INBOUND",
  origin: "TELEGRAM_SYNC",
  sentByMemberId: null,
  text: "Only saved message",
  contentMetadata: null,
  sentAt: "2026-09-06T12:00:00.000Z",
  editedAt: null,
  readState: "READ",
  deliveryState: "DELIVERED",
  createdAt: "2026-09-06T12:00:00.000Z",
  account: conversation.account,
  sentByMember: null,
} as CrmMessageListItem;

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
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <CrmMessageThread conversation={conversation} canSendManual={false} />
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

  it("reserves the message viewport while the conversation is loading", () => {
    vi.spyOn(telegramCrmApi, "listMessages").mockReturnValue(
      new Promise(() => undefined),
    );
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <TestI18nProvider>
          <CrmMessageThread conversation={conversation} canSendManual />
        </TestI18nProvider>
      </QueryClientProvider>,
    );

    const loading = screen.getByText(/Loading conversation/u);
    expect(loading.parentElement?.parentElement).toHaveClass("flex-1");
    expect(screen.getByPlaceholderText("Write a message…")).toBeInTheDocument();
  });

  it("does not import Telegram history automatically and imports only after Load older at the DB boundary", async () => {
    vi.mocked(telegramCrmApi.listMessages).mockResolvedValue({
      items: [
        { ...onlyMessage, id: "message-2", telegramMessageId: "2" },
        onlyMessage,
      ],
      nextCursor: null,
      hasMore: false,
    });
    const importHistory = vi
      .spyOn(telegramCrmApi, "importHistory")
      .mockResolvedValue({
        conversationId: conversation.id,
        imported: 0,
        scanned: 1,
        nextBeforeTelegramMessageId: null,
        exhausted: true,
      });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <CrmMessageThread
          conversation={{ ...conversation, historyExhausted: false }}
          canSendManual={false}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findAllByText("Only saved message")).toHaveLength(2);
    expect(importHistory).not.toHaveBeenCalled();
    const loadOlder = await screen.findByRole("button", { name: "Load older" });
    fireEvent.click(loadOlder);
    await waitFor(() =>
      expect(importHistory).toHaveBeenCalledWith(conversation.id, {
        limit: 51,
      }),
    );
  });

  it("loads workspace Premium emoji only after the CRM picker switches tabs", async () => {
    const customEmojiPacks = vi
      .spyOn(telegramChannelsApi, "customEmojiPacks")
      .mockResolvedValue({ packs: [] });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <TestI18nProvider>
          <CrmMessageThread conversation={conversation} canSendManual />
        </TestI18nProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Emoji" }));
    expect(customEmojiPacks).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Premium" }));
    await waitFor(() => expect(customEmojiPacks).toHaveBeenCalledOnce());
  });
});
