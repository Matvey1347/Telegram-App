import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
              PRODUCTION: {
                registeredUsers: 12,
                paidUsers: 4,
                activeSubscriptions: 3,
                failedPayments: 2,
              },
            },
          }
        : null,
    runtimes: [
      {
        id: "runtime-1",
        environment: "PRODUCTION",
        isProcessOwner: true,
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
      onRequestDelete={vi.fn()}
      onSwitch={vi.fn()}
      onConfigureRuntime={vi.fn()}
    />,
  );
}

describe("TelegramBotCard", () => {
  beforeEach(() => window.localStorage.clear());

  it("renders the access bot capabilities inline without technical credentials", () => {
    renderCard("NONE");
    expect(screen.getByLabelText("Access bot")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Channel access capabilities"),
    ).toHaveTextContent("Channels 1");
    expect(screen.queryByText("123…abc")).toBeNull();
    expect(screen.getByText("STOPPED")).toBeInTheDocument();
  });

  it("shows a checked running status for a connected webhook", () => {
    renderCard("GREETER");
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(screen.queryByText("ACTIVE")).toBeNull();
    expect(screen.queryByText(/api\/telegram\/bots\/runtime/)).toBeNull();
    expect(screen.queryByText("Last checked")).toBeNull();
    expect(screen.queryByText("Last real update")).toBeNull();
  });

  it("renders the selected runtime avatar pulled from Telegram", () => {
    const financeBot = bot("FINANCE");
    financeBot.runtimes[0].avatarUrl =
      "https://api.example/avatar/runtime-1?v=1";
    render(
      <TelegramBotCard
        bot={financeBot}
        checkingEnvironment={null}
        onCheck={vi.fn()}
        onRequestDelete={vi.fn()}
        onSwitch={vi.fn()}
        onConfigureRuntime={vi.fn()}
      />,
    );
    expect(
      document.querySelector('img[src="https://api.example/avatar/runtime-1?v=1"]'),
    ).toBeInTheDocument();
  });

  it("shows one stopped status when the runtime and webhook are stopped", () => {
    const stoppedBot = bot("FINANCE");
    stoppedBot.runtimes[0] = {
      ...stoppedBot.runtimes[0],
      isProcessOwner: false,
      runtimeStatus: "DISABLED",
      webhookConnectionStatus: "NOT_CONNECTED",
    };

    render(
      <TelegramBotCard
        bot={stoppedBot}
        checkingEnvironment={null}
        onCheck={vi.fn()}
        onRequestDelete={vi.fn()}
        onSwitch={vi.fn()}
        onConfigureRuntime={vi.fn()}
      />,
    );

    const stoppedStatus = screen.getByText("STOPPED");
    expect(stoppedStatus).toHaveClass("text-rose-200");
    expect(screen.queryByText("NOT RUNNING", { selector: "span" })).toBeNull();
  });

  it("renders compact Finance metrics and one Finance App link", () => {
    renderCard("FINANCE");
    expect(screen.getByLabelText("Finance business metrics")).toHaveTextContent(
      "Registered12",
    );
    expect(screen.getAllByRole("link", { name: "RUNNING" })).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Configure Finance" }),
    ).toHaveAttribute("href", "/telegram-bots/bot-1/finance");
    expect(
      screen.getByRole("button", { name: "Change bot app" }),
    ).toBeInTheDocument();
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
    financeBot.applicationSummary = {
      applicationType: "FINANCE",
      finance: {
        PRODUCTION: {
          registeredUsers: 12,
          paidUsers: 4,
          activeSubscriptions: 3,
          failedPayments: 2,
        },
        LOCAL: {
          registeredUsers: 2,
          paidUsers: 1,
          activeSubscriptions: 1,
          failedPayments: 0,
        },
      },
    };
    render(
      <TelegramBotCard
        bot={financeBot}
        checkingEnvironment={null}
        onCheck={vi.fn()}
        onRequestDelete={vi.fn()}
        onSwitch={vi.fn()}
        onConfigureRuntime={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText("@admissions_prod")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Local" }));
    expect(screen.getByText("@admissions_local")).toBeInTheDocument();
    expect(screen.getByLabelText("Finance business metrics")).toHaveTextContent(
      "Registered2",
    );
    expect(
      window.localStorage.getItem("telegram-bot-runtime-environment:bot-1"),
    ).toBe("LOCAL");
  });

  it("restores the previously selected local runtime after a refresh", () => {
    window.localStorage.setItem(
      "telegram-bot-runtime-environment:bot-1",
      "LOCAL",
    );
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
        onRequestDelete={vi.fn()}
        onSwitch={vi.fn()}
        onConfigureRuntime={vi.fn()}
      />,
    );

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
        onRequestDelete={vi.fn()}
        onSwitch={vi.fn()}
        onConfigureRuntime={onConfigureRuntime}
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

    expect(
      screen.getByLabelText("Finance business metrics"),
    ).toBeInTheDocument();
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

  it("shows one direct local Finance App link before a manual check", async () => {
    const user = userEvent.setup();
    const financeBot = bot("FINANCE");
    financeBot.runtimes.push({
      ...financeBot.runtimes[0],
      id: "runtime-local",
      environment: "LOCAL",
      webhookUrl:
        "https://example.ngrok-free.app/api/telegram/bots/runtime/runtime-local/webhook",
      webApp: { status: "UNKNOWN", url: null },
      miniApp: { status: "UNKNOWN", actualUrl: null },
    });
    render(
      <TelegramBotCard
        bot={financeBot}
        checkingEnvironment={null}
        onCheck={vi.fn()}
        onRequestDelete={vi.fn()}
        onSwitch={vi.fn()}
        onConfigureRuntime={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Local" }));
    expect(screen.getAllByRole("link", { name: "RUNNING" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "RUNNING" })).toHaveAttribute(
      "href",
      "https://example.ngrok-free.app/finance/bot-1",
    );
  });
});
