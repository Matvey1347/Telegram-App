import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TelegramBot } from "@/lib/api";
import { TelegramBotCard } from "./telegram-bot-card";

function bot(applicationType: "GREETER" | "FINANCE" | "NONE"): TelegramBot {
  return {
    id: "bot-1",
    workspaceId: "workspace-1",
    label: "Admissions bot",
    isActive: true,
    applicationType,
    channelAccessSummary: {
      totalChannels: 1,
      canPost: 1,
      canManageInviteLinks: 1,
      canViewStats: 0,
    },
    applicationSummary:
      applicationType === "FINANCE"
        ? {
            applicationType: "FINANCE",
            finance: {
              registeredUsers: 12,
              paidUsers: 4,
              activeSubscriptions: 3,
              failedPayments: 2,
            },
          }
        : null,
    runtimes: [
      {
        id: "runtime-1",
        environment: "PRODUCTION",
        firstName: "Admissions bot",
        username: "admissions_prod",
        botTokenMasked: "123…abc",
        botId: "12345",
        lastCheckedAt: "2026-08-16T10:00:00.000Z",
        tokenState: "SAVED",
        runtimeStatus: applicationType === "NONE" ? "DISABLED" : "ACTIVE",
        webhookStatus:
          applicationType === "NONE" ? "NOT_CONFIGURED" : "CONFIGURED",
        webhookConnectionStatus:
          applicationType === "NONE" ? "UNKNOWN" : "CONNECTED",
        webApp: {
          status:
            applicationType === "FINANCE" ? "AVAILABLE" : "NOT_CONFIGURED",
          url:
            applicationType === "FINANCE"
              ? "https://finance.example.com"
              : null,
        },
        miniApp: { status: "NOT_CONFIGURED", actualUrl: null },
      },
    ],
    applications: [
      {
        type: applicationType,
        label:
          applicationType === "NONE"
            ? "No runtime app"
            : applicationType === "FINANCE"
              ? "Finance"
              : "Greeter",
        description: "Manage bot behavior.",
        availability: "GLOBAL",
        eligible: true,
      },
    ],
  };
}

function renderCard(
  applicationType: "GREETER" | "FINANCE" | "NONE",
  checkingEnvironment: "LOCAL" | "PRODUCTION" | null = null,
) {
  return render(
    <TelegramBotCard
      bot={bot(applicationType)}
      checkingEnvironment={checkingEnvironment}
      onCheck={vi.fn()}
      onDelete={vi.fn()}
      onSwitch={vi.fn()}
      onConfigureRuntime={vi.fn()}
      onRemoveRuntime={vi.fn()}
    />,
  );
}

describe("TelegramBotCard", () => {
  it("renders the access bot capabilities inline without technical credentials", () => {
    renderCard("NONE");
    expect(screen.getByLabelText("Access bot")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Channel access capabilities"),
    ).toHaveTextContent("Channels 1");
    expect(screen.queryByText("123…abc")).toBeNull();
  });

  it("renders compact Finance metrics and separate Web App and Mini App facts", () => {
    renderCard("FINANCE");
    expect(screen.getByLabelText("Finance business metrics")).toHaveTextContent(
      "Registered12",
    );
    expect(
      screen.getByText("Available · https://finance.example.com"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Not configured")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "Configure Finance" }),
    ).toHaveAttribute("href", "/telegram-bots/bot-1/finance");
    expect(screen.getByRole("button", { name: "Change bot app" })).toBeInTheDocument();
    expect(screen.getByTestId("change-bot-app-icon")).toBeInTheDocument();
    expect(screen.getByTestId("configure-bot-app-icon")).toBeInTheDocument();
  });

  it("switches one logical card between production and configured local runtime", async () => {
    const user = userEvent.setup();
    const financeBot = bot("FINANCE");
    financeBot.runtimes.push({
      ...financeBot.runtimes[0],
      id: "runtime-local",
      environment: "LOCAL",
      username: "admissions_local",
    });
    render(
      <TelegramBotCard
        bot={financeBot}
        checkingEnvironment={null}
        onCheck={vi.fn()}
        onDelete={vi.fn()}
        onSwitch={vi.fn()}
        onConfigureRuntime={vi.fn()}
        onRemoveRuntime={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText("@admissions_prod")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Local" }));
    expect(screen.getByText("@admissions_local")).toBeInTheDocument();
  });

  it("shows the local setup state and uses local only for Check", async () => {
    const user = userEvent.setup();
    const onConfigureRuntime = vi.fn();
    const onCheck = vi.fn();
    render(
      <TelegramBotCard
        bot={bot("GREETER")}
        checkingEnvironment={null}
        onCheck={onCheck}
        onDelete={vi.fn()}
        onSwitch={vi.fn()}
        onConfigureRuntime={onConfigureRuntime}
        onRemoveRuntime={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Local" }));
    expect(screen.getByText("Local bot is not configured")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check bot" })).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Connect local test bot" }),
    );
    expect(onConfigureRuntime).toHaveBeenCalledWith("LOCAL");
    expect(onCheck).not.toHaveBeenCalled();
  });

  it("hides Finance metrics until the selected local runtime is connected", async () => {
    const user = userEvent.setup();
    renderCard("FINANCE");

    expect(screen.getByLabelText("Finance business metrics")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Local" }));

    expect(screen.getByText("Local bot is not configured")).toBeInTheDocument();
    expect(screen.queryByLabelText("Finance business metrics")).toBeNull();
  });

  it("shows a pending Check only for the selected runtime", async () => {
    const user = userEvent.setup();
    renderCard("GREETER", "PRODUCTION");
    expect(screen.getByRole("button", { name: "Checking bot" })).toBeDisabled();
    await user.click(screen.getByRole("tab", { name: "Local" }));
    expect(screen.getByRole("button", { name: "Check bot" })).toBeDisabled();
  });
});
