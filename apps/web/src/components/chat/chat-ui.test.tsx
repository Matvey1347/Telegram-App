import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatThread } from "./chat-thread";
import { ConversationList } from "./conversation-list";
import { MessageComposer } from "./message-composer";
import { AttachmentPreview } from "./attachment-preview";
import { ChatDetailsPanel } from "./chat-details-panel";
import { ActionMenu, ActionMenuItem } from "@/components/ui/action-menu";
import type { ChatCapabilities, ChatConversation, ChatMessage } from "./types";

const crmCapabilities: ChatCapabilities = {
  canSend: true, canReply: false, canEdit: false, canDelete: false,
  canReact: false, canForward: false, canUpload: false,
  canSendVoice: false, canFormatText: true,
};

/** Test adapter only: no Bot API, runtime, persistence or product implementation. */
const mockBotSupportAdapter = {
  capabilities: { ...crmCapabilities, canReply: true, canFormatText: false },
  conversation: { id: "support-ticket", title: "Support request", subtitle: "Bot Support", unreadCount: 1 } satisfies ChatConversation,
  message: { id: "support-message", text: "I need help with my account", direction: "incoming", sentAt: "2026-10-30T11:30:00Z", status: "unknown" } satisfies ChatMessage,
};

afterEach(() => vi.restoreAllMocks());

describe("shared Chat UI adapters", () => {
  it("reports whether the viewer is at the bottom of message history", () => {
    const onNearBottomChange = vi.fn();
    render(<ChatThread messages={[mockBotSupportAdapter.message]} capabilities={crmCapabilities} onNearBottomChange={onNearBottomChange} />);
    expect(onNearBottomChange).toHaveBeenLastCalledWith(true, []);
    const history = screen.getByRole("region", { name: "Message history" });
    Object.defineProperties(history, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 }, scrollTop: { value: 200, writable: true } });
    fireEvent.scroll(history);
    expect(onNearBottomChange).toHaveBeenLastCalledWith(false, []);
    history.scrollTop = 700;
    fireEvent.scroll(history);
    expect(onNearBottomChange).toHaveBeenLastCalledWith(true, []);
  });

  it("reports only message rows actually visible in a near-bottom viewport", () => {
    const onNearBottomChange = vi.fn();
    render(<ChatThread messages={[mockBotSupportAdapter.message, { ...mockBotSupportAdapter.message, id: "below-viewport" }]} capabilities={crmCapabilities} onNearBottomChange={onNearBottomChange} />);
    const history = screen.getByRole("region", { name: "Message history" });
    const rows = history.querySelectorAll<HTMLElement>("[data-message-id]");
    const rect = (top: number, bottom: number) => ({ top, bottom, height: bottom - top, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    vi.spyOn(history, "getBoundingClientRect").mockReturnValue(rect(0, 300));
    vi.spyOn(rows[0].querySelector("article")!, "getBoundingClientRect").mockReturnValue(rect(100, 150));
    vi.spyOn(rows[1].querySelector("article")!, "getBoundingClientRect").mockReturnValue(rect(310, 350));
    Object.defineProperties(history, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 }, scrollTop: { value: 650, writable: true } });
    fireEvent.scroll(history);
    expect(onNearBottomChange).toHaveBeenLastCalledWith(true, ["support-message"]);
  });

  it("checks the actual short bubble against occlusion and clips geometry to the browser viewport", () => {
    const onNearBottomChange = vi.fn();
    render(<ChatThread messages={[mockBotSupportAdapter.message]} capabilities={crmCapabilities} onNearBottomChange={onNearBottomChange} />);
    const history = screen.getByRole("region", { name: "Message history" });
    const row = history.querySelector<HTMLElement>("[data-message-id]")!;
    const bubble = row.querySelector<HTMLElement>("article")!;
    const rect = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    vi.spyOn(history, "getBoundingClientRect").mockReturnValue(rect(0, 0, 400, 300));
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue(rect(0, 100, 400, 150));
    vi.spyOn(bubble, "getBoundingClientRect").mockReturnValue(rect(10, 100, 90, 150));
    Object.defineProperties(history, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 }, scrollTop: { value: 700, writable: true } });
    const previous = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
    const hitTest = vi.fn(() => bubble);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: hitTest });
    try {
      fireEvent.scroll(history);
      expect(hitTest).toHaveBeenCalledWith(50, 125);
      expect(onNearBottomChange).toHaveBeenLastCalledWith(true, ["support-message"]);
      hitTest.mockReturnValue(document.body);
      fireEvent.scroll(history);
      expect(onNearBottomChange).toHaveBeenLastCalledWith(true, []);
      vi.spyOn(bubble, "getBoundingClientRect").mockReturnValue(rect(-200, -150, -100, -50));
      fireEvent.scroll(history);
      expect(onNearBottomChange).toHaveBeenLastCalledWith(true, []);
    } finally {
      if (previous) Object.defineProperty(document, "elementFromPoint", previous);
      else Reflect.deleteProperty(document, "elementFromPoint");
    }
  });

  it("reports a newly rendered visible message even when the viewer remains at the bottom", () => {
    const bounds = { top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(bounds);
    const onNearBottomChange = vi.fn();
    const view = render(<ChatThread messages={[mockBotSupportAdapter.message]} capabilities={crmCapabilities} onNearBottomChange={onNearBottomChange} />);
    expect(onNearBottomChange).toHaveBeenLastCalledWith(true, ["support-message"]);
    view.rerender(<ChatThread messages={[mockBotSupportAdapter.message, { ...mockBotSupportAdapter.message, id: "new-message" }]} capabilities={crmCapabilities} onNearBottomChange={onNearBottomChange} />);
    expect(onNearBottomChange).toHaveBeenLastCalledWith(true, ["new-message", "support-message"]);
  });

  it("uses the same thread for Support with reply but no edit or CRM formatting", async () => {
    const reply = vi.fn();
    render(<ChatThread header={mockBotSupportAdapter.conversation.title} messages={[mockBotSupportAdapter.message]} capabilities={mockBotSupportAdapter.capabilities} actions={{ onReply: reply, onEdit: vi.fn(), onDelete: vi.fn(), onReact: vi.fn() }} />);
    await userEvent.click(screen.getByRole("button", { name: "Message actions" }));
    expect(screen.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "React" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Reply" }));
    expect(reply).toHaveBeenCalledWith(mockBotSupportAdapter.message);
  });

  it("hides unsupported CRM actions even if a caller supplies callbacks", async () => {
    render(<ChatThread messages={[{ ...mockBotSupportAdapter.message, direction: "outgoing", status: "sent" }]} capabilities={crmCapabilities} actions={{ onReply: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onReact: vi.fn(), onForward: vi.fn() }} />);
    await userEvent.click(screen.getByRole("button", { name: "Message actions" }));
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    expect(screen.getByRole("menuitem", { name: "Copy text" })).toBeInTheDocument();
    expect(screen.getByLabelText("sent")).toBeInTheDocument();
    expect(screen.queryByLabelText("delivered")).not.toBeInTheDocument();
  });

  it("keeps the action button out of the message text flow", () => {
    render(<ChatThread messages={[{ ...mockBotSupportAdapter.message, text: "Навзаєм 🤗" }]} capabilities={crmCapabilities} />);
    const bubble = screen.getByRole("article", { name: "Incoming message" });
    expect(bubble).toHaveClass("min-w-[9rem]");
    expect(screen.getByRole("button", { name: "Message actions" }).parentElement?.parentElement?.parentElement).not.toHaveClass("float-right");
    expect(screen.getByText("Навзаєм 🤗")).toBeInTheDocument();
  });

  it("separates messages from different calendar days", () => {
    render(<ChatThread messages={[mockBotSupportAdapter.message, { ...mockBotSupportAdapter.message, id: "next-day", sentAt: "2026-11-01T11:30:00Z" }]} capabilities={crmCapabilities} />);
    const dates = screen.getByRole("list", { name: "Messages" }).querySelectorAll("li > time");
    expect(dates).toHaveLength(2);
  });

  it("requires a callback as well as a capability before exposing a transport operation", async () => {
    render(<ChatThread messages={[mockBotSupportAdapter.message]} capabilities={mockBotSupportAdapter.capabilities} />);
    await userEvent.click(screen.getByRole("button", { name: "Message actions" }));
    expect(screen.queryByRole("menuitem", { name: "Reply" })).not.toBeInTheDocument();
  });

  it("keeps only one message menu open when navigating with the keyboard", async () => {
    render(<ChatThread messages={[mockBotSupportAdapter.message, { ...mockBotSupportAdapter.message, id: "another-message" }]} capabilities={crmCapabilities} />);
    const triggers = screen.getAllByRole("button", { name: "Message actions" });
    triggers[0].focus();
    await userEvent.keyboard("{Enter}");
    expect(triggers[0]).toHaveAttribute("aria-expanded", "true");
    triggers[1].focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(triggers[0]).toHaveAttribute("aria-expanded", "false");
    expect(triggers[1]).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("preserves existing uncontrolled ActionMenu consumers", async () => {
    const choose = vi.fn();
    render(<ActionMenu label="Existing menu"><ActionMenuItem icon={null} onClick={choose}>Choose</ActionMenuItem></ActionMenu>);
    await userEvent.click(screen.getByRole("button", { name: "Existing menu" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Choose" }));
    expect(choose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("never offers edit or delete for incoming messages even with those capabilities", async () => {
    render(<ChatThread messages={[mockBotSupportAdapter.message]} capabilities={{ ...crmCapabilities, canEdit: true, canDelete: true }} actions={{ onEdit: vi.fn(), onDelete: vi.fn() }} />);
    await userEvent.click(screen.getByRole("button", { name: "Message actions" }));
    expect(screen.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("lets per-message capabilities restrict but never enable unsupported adapter actions", async () => {
    render(<ChatThread messages={[{ ...mockBotSupportAdapter.message, actionCapabilities: { canReply: true, canForward: true } }]} capabilities={crmCapabilities} actions={{ onReply: vi.fn(), onForward: vi.fn() }} />);
    await userEvent.click(screen.getByRole("button", { name: "Message actions" }));
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
  });
  it("renders a tombstone without media, receipts or transport actions", () => {
    render(<ChatThread messages={[{ ...mockBotSupportAdapter.message, text: "Old private content", deleted: true, attachments: [{ id: "old-media", kind: "image", name: "private.png" }] }]} capabilities={mockBotSupportAdapter.capabilities} actions={{ onReply: vi.fn() }} />);
    expect(screen.getByText("Message deleted")).toBeInTheDocument(); expect(screen.queryByText("Old private content")).not.toBeInTheDocument(); expect(screen.queryByText("private.png")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Message actions" })).not.toBeInTheDocument();
  });
  it("keeps a failed outgoing message visible and retries its exact model", async () => {
    const retry = vi.fn();
    const failed: ChatMessage = { ...mockBotSupportAdapter.message, direction: "outgoing", status: "failed" };
    render(<ChatThread messages={[failed]} capabilities={crmCapabilities} retryMessage={retry} />);
    expect(screen.getByText("Send failed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry send" }));
    expect(retry).toHaveBeenCalledWith(failed);
  });

  it("hides retry when the adapter has lost send permission", () => {
    render(<ChatThread messages={[{ ...mockBotSupportAdapter.message, direction: "outgoing", status: "failed" }]} capabilities={{ ...crmCapabilities, canSend: false }} retryMessage={vi.fn()} />);
    expect(screen.getByText("Send failed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry send" })).not.toBeInTheDocument();
  });

  it("reports clipboard failure without losing the message", async () => {
    render(<ChatThread messages={[mockBotSupportAdapter.message]} capabilities={crmCapabilities} actions={{ onCopy: () => Promise.reject(new Error("Clipboard blocked")) }} />);
    await userEvent.click(screen.getByRole("button", { name: "Message actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Copy text" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not copy");
    expect(screen.getByText(mockBotSupportAdapter.message.text)).toBeInTheDocument();
  });

  it("renders safe adapter text entities and attachment links without eager media", () => {
    render(<ChatThread messages={[{ ...mockBotSupportAdapter.message, content: <strong>Account help</strong>, attachments: [{ id: "file-a", kind: "image", name: "receipt.png", url: "/media/receipt" }] }]} capabilities={crmCapabilities} />);
    expect(screen.getByText("Account help").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "receipt.png" })).toHaveAttribute("href", "/media/receipt");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("provides recovery for history loading errors and composer pending state", async () => {
    const retry = vi.fn();
    const send = vi.fn();
    render(<ChatThread error onRetry={retry} messages={[]} capabilities={crmCapabilities} composer={<MessageComposer sending onSubmit={send}><textarea aria-label="Message" /></MessageComposer>} />);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not invent a download URL for unavailable attachments", () => {
    render(<AttachmentPreview attachment={{ id: "file-b", kind: "file", name: "contract.pdf" }} />);
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("conversation list scale and navigation", () => {
  it("loads older conversations near the bottom and shows folder labels", () => {
    const load = vi.fn();
    const { container } = render(<ConversationList items={[{ id: "a", title: "Alex", unreadCount: 0, folders: [{ id: "folder", name: "VIP", color: "#e44995" }] }]} onSelect={vi.fn()} hasMore onLoadMore={load} />);
    expect(screen.getByText("VIP")).toHaveStyle({ color: "rgb(228, 73, 149)" });
    const scroller = container.firstElementChild as HTMLElement;
    Object.defineProperties(scroller, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 }, scrollTop: { value: 650, writable: true } });
    fireEvent.scroll(scroller);
    fireEvent.scroll(scroller);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it.each([100, 1000])("renders a bounded window for %i conversations and navigates to the last one", async (count) => {
    const items = Array.from({ length: count }, (_, index) => ({ id: `conversation-${index}`, title: `Customer ${index}`, unreadCount: index % 3 }));
    const select = vi.fn();
    render(<ConversationList items={items} selectedId={items[0].id} onSelect={select} />);
    const list = screen.getByRole("listbox", { name: "Conversation list" });
    expect(within(list).getAllByRole("option").length).toBeLessThan(25);
    list.focus();
    await userEvent.keyboard("{End}{Enter}");
    expect(select).toHaveBeenLastCalledWith(items[count - 1].id);
    expect(screen.getByRole("option", { name: new RegExp(`Customer ${count - 1}`) })).toHaveAttribute("aria-posinset", String(count));
    await userEvent.keyboard("{Home}{ArrowDown}{Enter}");
    expect(select).toHaveBeenLastCalledWith(items[1].id);
  });

  it("preserves list scroll position when selecting a different conversation", () => {
    const items = Array.from({ length: 100 }, (_, index) => ({ id: String(index), title: `Client ${index}`, unreadCount: 0 }));
    const { container, rerender } = render(<ConversationList items={items} selectedId="1" onSelect={vi.fn()} />);
    const scroll = container.firstElementChild as HTMLDivElement;
    scroll.scrollTop = 800;
    fireEvent.scroll(scroll);
    rerender(<ConversationList items={items} selectedId="12" onSelect={vi.fn()} />);
    expect(scroll.scrollTop).toBe(800);
  });

  it("keeps a smaller replacement result visible after scrolling a large list", () => {
    const items = Array.from({ length: 100 }, (_, index) => ({ id: String(index), title: `Client ${index}`, unreadCount: 0 }));
    const { container, rerender } = render(<ConversationList items={items} onSelect={vi.fn()} />);
    const scroll = container.firstElementChild as HTMLDivElement;
    scroll.scrollTop = 8000;
    fireEvent.scroll(scroll);
    rerender(<ConversationList items={[items[0]]} onSelect={vi.fn()} />);
    expect(screen.getByRole("option", { name: /Client 0/ })).toBeInTheDocument();
  });

  it("shows a truthful empty state and a load-more failure recovery", async () => {
    const retry = vi.fn();
    const { rerender } = render(<ConversationList items={[]} onSelect={vi.fn()} emptyText="No AI leads have been discovered." />);
    expect(screen.getByRole("status")).toHaveTextContent("No AI leads");
    rerender(<ConversationList items={[]} onSelect={vi.fn()} error onRetry={retry} />);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("details panel", () => {
  it("uses a full-screen mobile dialog and restores focus after close", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
    const close = vi.fn();
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: showModal });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: vi.fn() });
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<ChatDetailsPanel title="Customer details" onClose={close}><p>Actual customer data</p></ChatDetailsPanel>);
    const dialog = screen.getByRole("dialog", { name: "Customer details" });
    expect(showModal).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));
    expect(close).toHaveBeenCalledOnce();
    unmount();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
    opener.remove();
    vi.unstubAllGlobals();
  });
});
