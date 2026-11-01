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
const enterText = (text: string) => fireEvent.change(screen.getByRole("textbox", { name: "Message text" }), { target: { value: text } });
const composer = (onSend: (text: string, key: string) => Promise<boolean>, workspaceId = "workspace-a", conversationId = "conversation-a", sending = false) => (
  <CrmMessageComposer workspaceId={workspaceId} conversationId={conversationId} sending={sending} onSend={onSend} />
);

beforeEach(() => localStorage.clear());

describe("CRM message composer drafts", () => {
  it("keeps the same draft while editing in the expanded editor", async () => {
    const send = vi.fn().mockResolvedValue(true);
    render(composer(send));
    enterText("Hello");
    await userEvent.click(screen.getByRole("button", { name: "Expand editor" }));
    const editors = screen.getAllByRole("textbox", { name: "Message text" });
    expect(editors[editors.length - 1]).toHaveValue("Hello");
    fireEvent.change(editors[editors.length - 1], { target: { value: "Hello again" } });
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("textbox", { name: "Message text" })).toHaveValue("Hello again");
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
    expect(screen.getByRole("textbox")).toHaveValue("");
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
    expect(screen.getByRole("textbox")).toHaveValue("Keep the newly selected customer's draft");
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
    expect(screen.getByRole("textbox")).toHaveValue("A different draft being prepared");
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
    expect(screen.getByRole("textbox")).toHaveValue("New draft for the same customer");
  });

  it("isolates drafts by both workspace and conversation and restores through Continue", async () => {
    const send = vi.fn().mockResolvedValue(false);
    const view = render(composer(send));
    enterText("Workspace A customer draft");
    await waitFor(() => expect(localStorage.getItem(storageKey())).toContain("Workspace A customer draft"));
    view.rerender(composer(send, "workspace-b"));
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(localStorage.getItem(storageKey("workspace-b"))).toBeNull();
    view.rerender(composer(send, "workspace-a", "conversation-b"));
    expect(screen.getByRole("textbox")).toHaveValue("");
    enterText("Another conversation draft");
    await waitFor(() => expect(localStorage.getItem(storageKey("workspace-a", "conversation-b"))).toContain("Another conversation draft"));
    view.rerender(composer(send));
    expect(await screen.findByText("Saved drafts")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue draft Message draft" }));
    expect(screen.getByRole("textbox")).toHaveValue("Workspace A customer draft");
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
    expect(await screen.findByRole("textbox")).toHaveValue("");
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
    expect(screen.getByRole("textbox")).toHaveValue("Retryable customer message");
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
    expect(screen.getByRole("textbox")).toHaveValue("Wait for the server response");
    expect(localStorage.getItem(storageKey())).toContain("Wait for the server response");
    await act(async () => { resolve(true); });
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(localStorage.getItem(storageKey())).toBeNull();
    view.unmount();
    render(composer(send));
    expect(screen.queryByText("Saved drafts")).not.toBeInTheDocument();
  });

  it("ignores malformed persisted data instead of restoring an unusable draft", () => {
    localStorage.setItem(storageKey(), JSON.stringify({ version: 3, drafts: [{ id: "bad-draft", schemaVersion: 1, form: { text: 12, key: null } }] }));
    render(composer(vi.fn().mockResolvedValue(false)));
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.queryByText("Saved drafts")).not.toBeInTheDocument();
  });
});

describe("CRM message composer send constraints", () => {
  it("blocks empty, over-limit and pending sends", async () => {
    const send = vi.fn().mockResolvedValue(false);
    const view = render(composer(send));
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    enterText("x".repeat(4097));
    expect(screen.getByRole("alert")).toHaveTextContent("at most 4096 characters");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", ctrlKey: true });
    expect(send).not.toHaveBeenCalled();
    enterText("Within the limit");
    view.rerender(composer(send, "workspace-a", "conversation-a", true));
    expect(screen.getByRole("textbox")).toBeDisabled();
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
