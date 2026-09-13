import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TelegramChannelsHeaderActions } from "./telegram-channels-header-actions";

describe("TelegramChannelsHeaderActions", () => {
  it("exposes message templates from the top of the channels page", () => {
    const openTemplates = vi.fn();
    render(
      <TelegramChannelsHeaderActions
        tab="channels"
        accountFilter="mtproto"
        hasChannels
        onCreateNetwork={vi.fn()}
        onConnectAccount={vi.fn()}
        onOpenTemplates={openTemplates}
        onSyncAll={vi.fn()}
        onExport={vi.fn()}
        onImport={vi.fn()}
      />,
    );
    screen.getByRole("button", { name: "Message templates" }).click();
    expect(openTemplates).toHaveBeenCalledOnce();
  });
});
