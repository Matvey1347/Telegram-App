import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { telegramSupportApi } from "@/lib/features/telegram/telegram-support-api";
import { TelegramSupportInbox } from "./telegram-support-inbox";

afterEach(() => vi.restoreAllMocks());

it("closes a Groshly conversation and shows it in the closed inbox", async () => {
  const user = userEvent.setup();
  const now = new Date().toISOString();
  const ticket = {
    id: crypto.randomUUID(),
    product: "GROSHLY" as const,
    senderName: "Finance user",
    username: null,
    preview: "My account is missing",
    needsReply: true,
    closedAt: null,
    updatedAt: now,
  };
  let closed = false;
  vi.spyOn(telegramSupportApi, "list").mockImplementation(async (showClosed) => ({
    items: showClosed === closed
      ? [{ ...ticket, closedAt: closed ? now : null, needsReply: !closed }]
      : [],
    nextCursor: null,
  }));
  vi.spyOn(telegramSupportApi, "thread").mockResolvedValue({
    items: [{
      id: crypto.randomUUID(),
      text: ticket.preview,
      status: "INBOUND",
      createdAt: now,
    }],
    nextCursor: null,
  });
  vi.spyOn(telegramSupportApi, "close").mockImplementation(async () => {
    closed = true;
  });
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <TelegramSupportInbox onProduct={vi.fn()} bots={[]} />
    </QueryClientProvider>,
  );

  await user.click(await screen.findByRole("button", { name: /Groshly.*Needs reply/ }));
  expect(await within(screen.getByRole("log")).findByText(ticket.preview)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Close ticket" }));
  expect(await screen.findByText("No open tickets.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Closed" }));
  await user.click(await screen.findByRole("button", { name: /Groshly.*Finance user/ }));
  expect(screen.queryByRole("textbox", { name: "Reply" })).toBeNull();
});
