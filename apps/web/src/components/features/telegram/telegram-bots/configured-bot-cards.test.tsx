import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { configuredBotsApi } from "@/lib/features/telegram/configured-bots-api";
import { ConfiguredBotCards } from "./configured-bot-cards";
import { SupportBotIdentity } from "./support-bot-identity";

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: vi.fn() }),
}));

it("groups the system and finance cards and displays the system audience in one metric", async () => {
  const overview = vi.spyOn(configuredBotsApi, "overview").mockResolvedValue({
    systemBot: {
      analytics: { registeredUsers: 19, enabledUsers: 15, activeUsers: 7 },
      runtimes: [{
        environment: "PRODUCTION",
        username: "nexeloq_bot",
        name: "Nexeloq",
        description: null,
        avatarUrl: null,
        configured: true,
        selected: true,
      }],
    },
    financeBot: null,
  });
  const user = userEvent.setup();
  try {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ConfiguredBotCards
          support={{
            product: "NEXELOQ",
            username: "nexeloq_help_bot",
            configured: true,
            open: 0,
            needsReply: 0,
          }}
        >
          <article>Groshly</article>
        </ConfiguredBotCards>
      </QueryClientProvider>,
    );
    const section = screen.getByRole("region", { name: "Configured bots" });
    const system = (await within(section).findByRole("heading", { name: "Nexeloq" })).closest("article")!;
    expect(within(section).getAllByRole("article")).toHaveLength(2);
    expect(system.parentElement).toBe(within(section).getByText("Groshly").parentElement);
    const audience = within(system).getByLabelText("System bot audience");
    expect(audience).toHaveTextContent("Registered19");
    expect(audience).toHaveTextContent("7 active in 30 days");
    expect(within(system).queryByText("Paid")).toBeNull();
    expect(within(system).getByRole("tab", { name: "Local" })).toBeDisabled();

    await user.click(within(system).getByRole("tab", { name: "Support 0" }));
    expect(within(system).getByRole("heading", { name: "Nexeloq Support" })).toBeVisible();
    expect(within(system).getByText("@nexeloq_help_bot")).toBeVisible();
    expect(within(system).queryByText("@nexeloq_bot")).toBeNull();
    expect(within(system).getByLabelText("Support bot avatar").querySelector("img"))
      .toHaveAttribute("src", "/brand/nexeloq-support.png");
    expect(within(system).getByRole("button", { name: "System bot actions" })).toBeVisible();
    expect(within(system).getByText("ENV")).toBeVisible();
    expect(within(system).queryByRole("button", { name: "Open support inbox" })).toBeNull();
    await user.click(within(system).getByRole("tab", { name: "Production" }));
    expect(within(system).getByRole("heading", { name: "Nexeloq" })).toBeVisible();
    expect(within(system).getByText("@nexeloq_bot")).toBeVisible();
  } finally {
    overview.mockRestore();
  }
});

it("shows an unconfigured support bot without presenting an inactive handle", () => {
  render(
    <SupportBotIdentity
      product="NEXELOQ"
      bot={{
        product: "NEXELOQ",
        username: "inactive_help_bot",
        configured: false,
        open: 0,
        needsReply: 0,
      }}
    />,
  );
  expect(screen.getByText("Support bot is not configured")).toBeVisible();
  expect(screen.queryByText("@inactive_help_bot")).toBeNull();
});
