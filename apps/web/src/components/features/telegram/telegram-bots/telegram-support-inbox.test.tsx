import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import type { SupportProduct } from "@telegram-system/shared";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { telegramSupportApi } from "@/lib/features/telegram/telegram-support-api";
import { TelegramSupportInbox } from "./telegram-support-inbox";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("shows application avatars and applies the selected filter", async () => {
  const list = vi.spyOn(telegramSupportApi, "list").mockResolvedValue({ items: [], nextCursor: null });
  const user = userEvent.setup();
  function Inbox() {
    const [product, setProduct] = useState<SupportProduct>();
    return <TelegramSupportInbox product={product} onProduct={setProduct} />;
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Inbox />
    </QueryClientProvider>,
  );
  const filter = screen.getByRole("group", { name: "Application" });
  const nexeloq = screen.getByRole("button", { name: "Nexeloq" });
  const groshly = screen.getByRole("button", { name: "Groshly" });
  expect(nexeloq.querySelector("img")).toHaveAttribute("src", "/brand/nexeloq-pwa-192.png");
  expect(groshly.querySelector("img")).toHaveAttribute("src", "/brand/groshly-icon.png");
  await user.click(groshly);
  expect(within(filter).getByRole("button", { name: "Groshly", pressed: true })).toBe(groshly);
  await waitFor(() => expect(list).toHaveBeenLastCalledWith(false, "GROSHLY", undefined));
});

it("closes a Groshly conversation and shows it in the closed inbox", async () => {
  const user = userEvent.setup();
  const now = new Date().toISOString();
  const ticket = {
    id: crypto.randomUUID(),
    workspaceId: "support-workspace",
    product: "GROSHLY" as const,
    senderName: "Finance user",
    username: null,
    preview: "My account is missing",
    needsReply: true,
    closedAt: null,
    updatedAt: now,
  };
  const createObjectURL = vi.fn(() => "blob:telegram-sender-avatar");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  });
  const senderPhoto = new Blob(["avatar"], { type: "image/jpeg" });
  const avatar = vi.spyOn(telegramSupportApi, "avatar")
    .mockImplementation(async (_, kind) => kind === "sender" ? senderPhoto : null);
  let closed = false;
  vi.spyOn(telegramSupportApi, "list").mockImplementation(async (showClosed) => ({
    items: showClosed === closed
      ? [{ ...ticket, closedAt: closed ? now : null, needsReply: !closed }]
      : [],
    nextCursor: null,
  }));
  vi.spyOn(telegramSupportApi, "thread").mockResolvedValue({
    lastInboundAt: now,
    items: [{
      id: crypto.randomUUID(),
      text: ticket.preview,
      status: "INBOUND",
      createdAt: now,
    }, {
      id: crypto.randomUUID(),
      text: "Дякуємо, що звернулися до служби підтримки Groshly!",
      automatic: true,
      legacy: true,
      status: "UNKNOWN",
      createdAt: now,
    }],
    nextCursor: null,
  });
  const send = vi.spyOn(telegramSupportApi, "reply").mockResolvedValue({
    id: crypto.randomUUID(), text: "**Вітаю!**", formatted: true, status: "SENT", createdAt: now,
  });
  vi.spyOn(telegramSupportApi, "close").mockImplementation(async () => {
    closed = true;
  });
  vi.spyOn(telegramSupportApi, "reopen").mockImplementation(async () => {
    closed = false;
    return { id: ticket.id };
  });
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <TelegramSupportInbox onProduct={vi.fn()} />
    </QueryClientProvider>,
  );

  await user.click(await screen.findByRole("button", { name: /Groshly.*Needs reply/ }));
  expect(await within(screen.getByRole("region", { name: "Message history" })).findByText(ticket.preview)).toBeVisible();
  const header = screen.getByRole("heading", { name: ticket.senderName }).closest("header");
  await waitFor(() => expect(header?.querySelector('img[src="blob:telegram-sender-avatar"]')).toBeInTheDocument());
  expect(header?.querySelector('img[src="/brand/groshly-icon.png"]')).toBeInTheDocument();
  expect(avatar).toHaveBeenCalledWith(ticket.id, "sender", expect.any(AbortSignal));
  expect(avatar).toHaveBeenCalledWith(ticket.id, "bot", expect.any(AbortSignal));
  expect(screen.getByText("Automatic reply · archived")).toBeVisible();
  expect(screen.queryByText("Delivery unconfirmed")).not.toBeInTheDocument();
  expect(screen.getByText(/Last message from user/)).toBeVisible();
  const editor = screen.getByRole("textbox", { name: "Message text" });
  expect(editor).toBeVisible();
  editor.textContent = "Вітаю!";
  fireEvent.input(editor);
  const range = document.createRange();
  range.selectNodeContents(editor);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
  fireEvent.mouseUp(editor);
  await user.click(screen.getByRole("button", { name: "Formatting" }));
  expect(screen.getByRole("toolbar", { name: "Message formatting" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Bold" }));
  fireEvent.keyDown(editor, { key: "Enter" });
  await waitFor(() => expect(send).toHaveBeenCalledWith(ticket.id, expect.any(String), "**Вітаю!**"));
  await user.click(screen.getByRole("button", { name: "Close ticket" }));
  expect(await screen.findByText("No open tickets.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Closed" }));
  await user.click(await screen.findByRole("button", { name: /Groshly.*Finance user/ }));
  expect(screen.queryByRole("textbox", { name: "Message text" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Reopen ticket" }));
  expect(await screen.findByRole("button", { name: "Close ticket" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Message text" })).toBeVisible();
});

it("shows send on an empty composer and updates native replies, edits, deletions and reactions in the thread", async () => {
  const user = userEvent.setup();
  const now = new Date().toISOString();
  const ticket = {
    id: crypto.randomUUID(), workspaceId: "support-workspace", product: "GROSHLY" as const,
    senderName: "Customer", username: null, preview: "Need help", needsReply: true,
    closedAt: null, updatedAt: now,
  };
  const incoming = { id: "incoming", telegramMessageId: 31, text: ticket.preview, status: "INBOUND", createdAt: now };
  const outgoing = {
    id: "outgoing", telegramMessageId: 32, replyToTelegramId: 31, text: "I can help",
    reactions: ["👍"], status: "SENT", formatted: true, createdAt: now,
  };
  let response: typeof outgoing | (typeof outgoing & { deletedAt: string }) | undefined;
  let confirmSend!: (message: typeof outgoing) => void;
  const confirmation = new Promise<typeof outgoing>((resolve) => {
    confirmSend = resolve;
  });
  vi.spyOn(telegramSupportApi, "avatar").mockResolvedValue(null);
  vi.spyOn(telegramSupportApi, "list").mockResolvedValue({ items: [ticket], nextCursor: null });
  vi.spyOn(telegramSupportApi, "thread").mockImplementation(async () => ({
    items: response ? [response, incoming] : [incoming],
    nextCursor: null, lastInboundAt: now,
  }));
  const send = vi.spyOn(telegramSupportApi, "reply").mockReturnValue(confirmation);
  const edit = vi.spyOn(telegramSupportApi, "editMessage").mockImplementation(async (_, _messageId, text) => {
    response = { ...outgoing, text };
    return response;
  });
  const remove = vi.spyOn(telegramSupportApi, "deleteMessage").mockImplementation(async () => {
    response = { ...outgoing, text: "", deletedAt: now };
    return response;
  });

  render(<QueryClientProvider client={new QueryClient()}><TelegramSupportInbox onProduct={vi.fn()} /></QueryClientProvider>);
  await user.click(await screen.findByRole("button", { name: /Groshly.*Customer/ }));
  expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  const received = await screen.findByRole("article", { name: "Incoming message" });
  await user.click(within(received).getByRole("button", { name: "Message actions" }));
  await user.click(within(received).getByRole("menuitem", { name: "Reply" }));
  expect(screen.getByText("Replying to Customer")).toBeVisible();
  const editor = screen.getByRole("textbox", { name: "Message text" });
  editor.textContent = outgoing.text;
  fireEvent.input(editor);
  await user.click(screen.getByRole("button", { name: "Send message" }));
  expect(await screen.findByText("Sending…")).toBeVisible();
  expect(send).toHaveBeenCalledWith(ticket.id, expect.any(String), outgoing.text, incoming.id);

  response = outgoing;
  confirmSend(outgoing);
  const sent = await screen.findByRole("button", { name: "👍: 1" });
  const bubble = sent.closest("article")!;
  expect(within(bubble).getByText("Sent")).toBeVisible();
  expect(within(bubble).getByRole("button", { name: incoming.text })).toBeVisible();

  await user.click(within(bubble).getByRole("button", { name: "Message actions" }));
  await user.click(within(bubble).getByRole("menuitem", { name: "Edit" }));
  await user.clear(screen.getByRole("textbox", { name: "Edit message text" }));
  await user.type(screen.getByRole("textbox", { name: "Edit message text" }), "Fixed");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByText("Fixed")).toBeVisible();
  expect(edit).toHaveBeenCalledWith(ticket.id, outgoing.id, "Fixed");

  await user.click(within(bubble).getByRole("button", { name: "Message actions" }));
  await user.click(within(bubble).getByRole("menuitem", { name: "Delete" }));
  await user.click(screen.getByRole("button", { name: "Delete message" }));
  expect(within(bubble).getByText("Message deleted")).toBeVisible();
  expect(remove).toHaveBeenCalledWith(ticket.id, outgoing.id);
});
