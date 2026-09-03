import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TelegramUserAccount } from "@/lib/api";
import { TelegramMtprotoAccountCard } from "./telegram-mtproto-account-card";

vi.mock("./telegram-crm-account-capabilities", () => ({
  TelegramCrmAccountCapabilitiesModal: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Capability settings</div> : null,
}));

const account: TelegramUserAccount = {
  id: "account-1",
  label: "Publishing account",
  apiId: "1",
  username: "publisher",
  isPremium: false,
  captionLengthMax: 1024,
  messageLengthMax: 4096,
  crmSyncEnabled: true,
  crmSendEnabled: false,
  mtprotoPublishingEnabled: true,
  status: "connected",
  isActive: true,
};

describe("TelegramMtprotoAccountCard capabilities", () => {
  it("shows active account roles and opens their settings from the card menu", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TelegramMtprotoAccountCard
          account={account}
          isStartingLogin={false}
          onStartLogin={vi.fn()}
          onRefreshQr={vi.fn()}
          onEnterCode={vi.fn()}
          onPassword={vi.fn()}
          onCheck={vi.fn()}
          onSync={vi.fn()}
          onDelete={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("CRM sync")).toBeInTheDocument();
    expect(screen.getByText("Publishing")).toBeInTheDocument();
    expect(screen.queryByText("CRM sender")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for @publisher" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "CRM & publishing" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("Capability settings");
  });
});
