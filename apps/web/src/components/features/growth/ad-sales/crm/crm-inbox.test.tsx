import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramUserAccountsApi } from "@/lib/api";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { CrmInbox } from "./crm-inbox";

vi.mock("@/lib/api", () => ({
  telegramUserAccountsApi: { list: vi.fn() },
}));
vi.mock("./crm-message-thread", () => ({
  CrmMessageThread: ({ conversation }: { conversation: { id: string } }) => (
    <div>Exact thread {conversation.id}</div>
  ),
}));

function renderInbox(peerId = "peer-1") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CrmInbox
        canManage
        canSendManual
        conversationId="conversation-exact"
        peerId={peerId}
      />
    </QueryClientProvider>,
  );
}

describe("CrmInbox exact thread", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(telegramCrmApi, "getConversation").mockResolvedValue({
      id: "conversation-exact",
      contactId: null,
      state: "ACTIVE",
      telegramCrmPeerId: "peer-1",
      mtprotoAccountId: "account-1",
      peer: {
        id: "peer-1",
        username: "customer",
        firstName: "Customer",
        lastName: null,
      },
      account: { id: "account-1", label: "CRM", username: "crm" },
    } as never);
    vi.mocked(telegramUserAccountsApi.list).mockResolvedValue([
      {
        id: "account-1",
        status: "connected",
        isActive: true,
        crmSendEnabled: true,
      },
    ] as never);
    vi.spyOn(telegramCrmApi, "listInbox").mockResolvedValue({
      items: [],
    } as never);
  });

  it("loads the exact authorized conversation without relying on inbox page one", async () => {
    renderInbox();
    expect(
      await screen.findByText("Exact thread conversation-exact"),
    ).toBeInTheDocument();
    expect(telegramCrmApi.getConversation).toHaveBeenCalledWith(
      "conversation-exact",
      expect.any(AbortSignal),
    );
    expect(telegramCrmApi.listInbox).not.toHaveBeenCalled();
  });

  it("rejects a conversation that no longer matches the unassigned peer", async () => {
    renderInbox("another-peer");
    expect(
      await screen.findByText(
        /no longer points to an active unassigned inbox conversation/u,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Exact thread/u)).not.toBeInTheDocument();
  });
});
