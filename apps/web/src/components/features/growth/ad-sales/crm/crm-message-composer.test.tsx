import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CrmMessageComposer, type CrmMessageComposerHandle } from "./crm-message-composer";

vi.mock("@/components/features/telegram/telegram/telegram-text-editor", () => ({
  TelegramTextEditor: ({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) => (
    <textarea aria-label="Message text" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
  ),
}));

const storageKey = (workspace = "workspace-a", conversation = "conversation-a") => `crm-message:${conversation}:${workspace}`;
const enterText = (text: string) => {
  const editor = screen.getByRole("textbox", { name: "Message text" });
  editor.textContent = text;
  fireEvent.input(editor);
};
const composer = (onSend: (text: string, key: string) => Promise<boolean>, workspaceId = "workspace-a", conversationId = "conversation-a", sending = false) => (
  <CrmMessageComposer workspaceId={workspaceId} conversationId={conversationId} sending={sending} onSend={onSend} />
);

beforeEach(() => localStorage.clear());

describe("CRM message composer drafts", () => {
  it("formats selected multiline text as a code block in the compact editor", async () => {
    const send = vi.fn().mockResolvedValue(true);
    render(composer(send));
    enterText("first\nsecond");
    const editor = screen.getByRole("textbox", { name: "Message text" });
    const range = document.createRange();
    range.selectNodeContents(editor);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    fireEvent.mouseUp(editor);
    fireEvent.click(screen.getByRole("button", { name: "Formatting" }));
    fireEvent.click(screen.getByRole("button", { name: "Code block" }));
    expect(editor.querySelector("[data-code-block]")).toHaveTextContent("first second");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(send).toHaveBeenCalledWith("```\nfirst\nsecond```", expect.any(String));
  });
  it("keeps the same draft while editing in the expanded editor", async () => {
    const send = vi.fn().mockResolvedValue(true);
    render(composer(send));
    enterText("Hello");
    await userEvent.click(screen.getByRole("button", { name: "Formatting" }));
    await userEvent.click(screen.getByRole("button", { name: "More formatting" }));
    const editors = screen.getAllByRole("textbox", { name: "Message text" });
    expect(editors[editors.length - 1]).toHaveValue("Hello");
    fireEvent.change(editors[editors.length - 1], { target: { value: "Hello again" } });
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("textbox", { name: "Message text" })).toHaveTextContent("Hello again");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(send).toHaveBeenCalledWith("Hello again", expect.any(String));
  });

  it("clears a matching draft after an external bubble retry succeeds", async () => {
    const ref = createRef<CrmMessageComposerHandle>();
    const send = vi.fn().mockResolvedValue(false);
    const view = render(<CrmMessageComposer ref={ref} workspaceId="workspace-a" conversationId="conversation-a" sending={false} onSend={send} />);
    enterText("Failed message retried from its bubble");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    const key = send.mock.calls[0][1];
    expect(localStorage.getItem(storageKey())).toContain("Failed message retried from its bubble");
    act(() => ref.current?.clearSent(key));
    expect(screen.getByRole("textbox")).toHaveTextContent("");
    expect(localStorage.getItem(storageKey())).toBeNull();
    view.unmount();
    render(composer(send));
    expect(screen.queryByText("Saved drafts")).not.toBeInTheDocument();
  });

  it("clears the captured old draft after unmount without deleting another conversation's draft", async () => {
    const ref = createRef<CrmMessageComposerHandle>();
    const send = vi.fn().mockResolvedValue(false);
    const first = render(<CrmMessageComposer ref={ref} workspaceId="workspace-a" conversationId="conversation-a" sending={false} onSend={send} />);
    enterText("Old conversation message");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    const key = send.mock.calls[0][1];
    const pendingRetrySession = ref.current;
    first.unmount();
    const second = render(composer(send, "workspace-b", "conversation-b"));
    enterText("Keep the newly selected customer's draft");
    await waitFor(() => expect(localStorage.getItem(storageKey("workspace-b", "conversation-b"))).toContain("Keep the newly selected customer's draft"));
    act(() => pendingRetrySession?.clearSent(key));
    expect(localStorage.getItem(storageKey())).toBeNull();
    expect(localStorage.getItem(storageKey("workspace-b", "conversation-b"))).toContain("Keep the newly selected customer's draft");
    expect(screen.getByRole("textbox")).toHaveTextContent("Keep the newly selected customer's draft");
    second.unmount();
    render(composer(send));
    expect(screen.queryByText("Saved drafts")).not.toBeInTheDocument();
  });

  it("preserves a changed draft when a different message key succeeds", async () => {
    const ref = createRef<CrmMessageComposerHandle>();
    const send = vi.fn().mockResolvedValue(false);
    render(<CrmMessageComposer ref={ref} workspaceId="workspace-a" conversationId="conversation-a" sending={false} onSend={send} />);
    enterText("First failed message");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    const oldKey = send.mock.calls[0][1];
    enterText("A different draft being prepared");
    act(() => ref.current?.clearSent(oldKey));
    expect(screen.getByRole("textbox")).toHaveTextContent("A different draft being prepared");
    expect(localStorage.getItem(storageKey())).toContain("A different draft being prepared");
  });

  it("removes only the sent draft when a newer draft exists in the same conversation", async () => {
    const ref = createRef<CrmMessageComposerHandle>();
    const send = vi.fn().mockResolvedValue(false);
    const first = render(<CrmMessageComposer ref={ref} workspaceId="workspace-a" conversationId="conversation-a" sending={false} onSend={send} />);
    enterText("Original failed message");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    const key = send.mock.calls[0][1];
    const retrySession = ref.current;
    first.unmount();
    render(composer(send));
    await userEvent.click(await screen.findByRole("button", { name: "Create new" }));
    enterText("New draft for the same customer");
    await waitFor(() => expect(localStorage.getItem(storageKey())).toContain("New draft for the same customer"));
    act(() => retrySession?.clearSent(key));
    expect(localStorage.getItem(storageKey())).not.toContain("Original failed message");
    expect(localStorage.getItem(storageKey())).toContain("New draft for the same customer");
    expect(screen.getByRole("textbox")).toHaveTextContent("New draft for the same customer");
  });

  it("isolates drafts by both workspace and conversation and restores through Continue", async () => {
    const send = vi.fn().mockResolvedValue(false);
    const view = render(composer(send));
    enterText("Workspace A customer draft");
    await waitFor(() => expect(localStorage.getItem(storageKey())).toContain("Workspace A customer draft"));
    view.rerender(composer(send, "workspace-b"));
    expect(screen.getByRole("textbox")).toHaveTextContent("");
    expect(localStorage.getItem(storageKey("workspace-b"))).toBeNull();
    view.rerender(composer(send, "workspace-a", "conversation-b"));
    expect(screen.getByRole("textbox")).toHaveTextContent("");
    enterText("Another conversation draft");
    await waitFor(() => expect(localStorage.getItem(storageKey("workspace-a", "conversation-b"))).toContain("Another conversation draft"));
    view.rerender(composer(send));
    expect(await screen.findByText("Saved drafts")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue draft Message draft" }));
    expect(screen.getByRole("textbox")).toHaveTextContent("Workspace A customer draft");
    expect(send).not.toHaveBeenCalled();
  });

  it("deletes a saved draft and starts a clean editor", async () => {
    const send = vi.fn().mockResolvedValue(false);
    const first = render(composer(send));
    enterText("Discard this saved text");
    await waitFor(() => expect(localStorage.getItem(storageKey())).toContain("Discard this saved text"));
    first.unmount();
    render(composer(send));
    await userEvent.click(await screen.findByRole("button", { name: "Delete draft Message draft" }));
    expect(await screen.findByRole("textbox")).toHaveTextContent("");
    expect(localStorage.getItem(storageKey())).toBeNull();
  });

  it("keeps the text and the same idempotency key after failure, including reopening", async () => {
    const send = vi.fn().mockResolvedValue(false);
    const first = render(composer(send));
    enterText("Retryable customer message");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(send).toHaveBeenCalledOnce();
    const firstKey = send.mock.calls[0][1];
    expect(firstKey).toBeTruthy();
    expect(screen.getByRole("textbox")).toHaveTextContent("Retryable customer message");
    first.unmount();
    render(composer(send));
    await userEvent.click(await screen.findByRole("button", { name: "Continue draft Message draft" }));
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(send).toHaveBeenLastCalledWith("Retryable customer message", firstKey);
  });

  it("clears the draft only after confirmed success", async () => {
    let resolve!: (value: boolean) => void;
    const send = vi.fn(() => new Promise<boolean>((done) => { resolve = done; }));
    const view = render(composer(send));
    enterText("Wait for the server response");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.getByRole("textbox")).toHaveTextContent("Wait for the server response");
    expect(localStorage.getItem(storageKey())).toContain("Wait for the server response");
    await act(async () => { resolve(true); });
    expect(screen.getByRole("textbox")).toHaveTextContent("");
    expect(localStorage.getItem(storageKey())).toBeNull();
    view.unmount();
    render(composer(send));
    expect(screen.queryByText("Saved drafts")).not.toBeInTheDocument();
  });

  it("ignores malformed persisted data instead of restoring an unusable draft", () => {
    localStorage.setItem(storageKey(), JSON.stringify({ version: 3, drafts: [{ id: "bad-draft", schemaVersion: 1, form: { text: 12, key: null } }] }));
    render(composer(vi.fn().mockResolvedValue(false)));
    expect(screen.getByRole("textbox")).toHaveTextContent("");
    expect(screen.queryByText("Saved drafts")).not.toBeInTheDocument();
  });
});

describe("CRM message composer send constraints", () => {
  it("formats selected text and sends the formatted draft", async () => {
    const send = vi.fn().mockResolvedValue(false);
    render(composer(send));
    enterText("Hello there");
    const input = screen.getByRole("textbox", { name: "Message text" }) as HTMLDivElement;
    input.focus();
    const range = document.createRange();
    range.setStart(input.firstChild!, 0);
    range.setEnd(input.firstChild!, 5);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent.mouseUp(input);
    await userEvent.click(screen.getByRole("button", { name: "Formatting" }));
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(input).toHaveTextContent("Hello there");
    expect(input.querySelector("strong")).toHaveTextContent("Hello");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(send).toHaveBeenCalledWith("**Hello** there", expect.any(String));
  });

  it("formats a selection as a separate quote and sends Telegram quote syntax", async () => {
    const send = vi.fn().mockResolvedValue(false);
    render(composer(send));
    enterText("Before quoted after");
    const input = screen.getByRole("textbox", { name: "Message text" });
    const range = document.createRange();
    range.setStart(input.firstChild!, 7); range.setEnd(input.firstChild!, 13);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    fireEvent.mouseUp(input);
    await userEvent.click(screen.getByRole("button", { name: "Formatting" }));
    await userEvent.click(screen.getByRole("button", { name: "Quote" }));
    expect(input.querySelector("[data-quote]")).toHaveTextContent("quoted");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(send).toHaveBeenCalledWith("Before \n> quoted\n after", expect.any(String));
  });

  it("pastes text safely and retains composition until the IME finishes", async () => {
    const send = vi.fn().mockResolvedValue(false);
    render(composer(send));
    const input = screen.getByRole("textbox", { name: "Message text" });
    fireEvent.paste(input, { clipboardData: { getData: () => "<img src=x onerror=alert(1)>" } });
    expect(input.querySelector("img")).toBeNull();
    expect(input).toHaveTextContent("<img src=x onerror=alert(1)>");
    fireEvent.compositionStart(input);
    input.textContent = "日本語";
    fireEvent.input(input);
    fireEvent.compositionEnd(input);
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(send).toHaveBeenCalledWith("日本語", expect.any(String));
  });

  it("does not insert formatting when there is no selection", async () => {
    render(composer(vi.fn().mockResolvedValue(false)));
    enterText("Hello");
    await userEvent.click(screen.getByRole("button", { name: "Formatting" }));
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(screen.getByRole("textbox", { name: "Message text" })).toHaveTextContent("Hello");
  });

  it("switches between voice recording and sending as the draft changes", () => {
    render(<CrmMessageComposer workspaceId="workspace-a" conversationId="conversation-a" sending={false} onSend={vi.fn()} extraControls={(hasText) => hasText ? null : <button type="button">Record audio</button>} />);
    expect(screen.getByRole("button", { name: "Record audio" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send message" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quick replies" })).not.toBeInTheDocument();
    enterText("A");
    expect(screen.queryByRole("button", { name: "Record audio" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
    enterText("");
    expect(screen.getByRole("button", { name: "Record audio" })).toBeInTheDocument();
  });

  it("blocks empty, over-limit and pending sends", async () => {
    const send = vi.fn().mockResolvedValue(false);
    const view = render(composer(send));
    expect(screen.queryByRole("button", { name: "Send message" })).not.toBeInTheDocument();
    enterText("x".repeat(4097));
    expect(screen.getByRole("alert")).toHaveTextContent("at most 4096 characters");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", ctrlKey: true });
    expect(send).not.toHaveBeenCalled();
    enterText("Within the limit");
    view.rerender(composer(send, "workspace-a", "conversation-a", true));
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", ctrlKey: true });
    expect(send).not.toHaveBeenCalled();
  });

  it("accepts the Telegram text boundary and the send shortcut, while respecting IME composition", async () => {
    const send = vi.fn().mockResolvedValue(false);
    render(composer(send));
    enterText("x".repeat(4096));
    expect(screen.getByRole("button", { name: "Send message" })).not.toBeDisabled();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", ctrlKey: true, isComposing: true });
    expect(send).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send.mock.calls[0][0]).toHaveLength(4096);
  });
});
