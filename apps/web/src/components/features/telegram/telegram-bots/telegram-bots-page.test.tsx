import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TelegramBot } from "@/lib/api";
import { SwitchApplicationForm } from "./telegram-bots-page";

const bot: TelegramBot = {
  id: "bot-1",
  workspaceId: "workspace-1",
  label: "Admissions bot",
  isActive: true,
  applicationType: "GREETER",
  channelAccessSummary: {
    totalChannels: 1,
    canPost: 1,
    canManageInviteLinks: 0,
    canViewStats: 0,
  },
  applicationSummary: null,
  runtimes: [
    {
      id: "runtime-prod",
      environment: "PRODUCTION",
      isProcessOwner: true,
      firstName: "Admissions bot",
      botTokenMasked: "123:***",
      tokenState: "SAVED",
      runtimeStatus: "ACTIVE",
      webhookStatus: "CONFIGURED",
      webhookConnectionStatus: "CONNECTED",
      webApp: { status: "NOT_CONFIGURED", url: null },
      miniApp: { status: "NOT_CONFIGURED", actualUrl: null },
    },
  ],
  applications: [
    {
      type: "NONE",
      label: "No runtime app",
      description: "Disable the runtime.",
      availability: "GLOBAL",
      eligible: true,
    },
    {
      type: "GREETER",
      label: "Greeter",
      description: "Welcome new users.",
      availability: "GLOBAL",
      eligible: true,
    },
  ],
};

describe("SwitchApplicationForm", () => {
  it("explains the runtime change without requiring a magic phrase", () => {
    render(
      <SwitchApplicationForm
        bot={bot}
        saving={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByText(/CHANGE BOT TYPE/i)).toBeNull();
    expect(
      screen.getByText(
        /select a different runtime app to change the bot behavior/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /switch to greeter/i }),
    ).toBeDisabled();
  });
});
