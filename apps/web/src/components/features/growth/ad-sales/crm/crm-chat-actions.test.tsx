import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";
import type { CrmMessageListItem, CrmChatCapabilities } from "@telegram-system/shared";
import { crmChatActionsApi } from "@/lib/features/growth/crm-chat-actions-api";
import { listCrmInboxConversations } from "@/lib/features/growth/crm-inbox-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { useCrmChatActions } from "./use-crm-chat-actions";
import { toChatMessage } from "./crm-chat-adapter";
import { messageEditorMarkup, renderChatEntities } from "./crm-chat-entities";
import { CrmMessageActionDialog } from "./crm-message-action-dialog";
import { AttachmentPreview } from "@/components/chat/attachment-preview";
import { CrmChatMediaControls } from "./crm-chat-media-controls";

vi.mock("@/lib/features/growth/crm-inbox-api", () => ({ listCrmInboxConversations: vi.fn() }));
vi.mock("@/components/features/telegram/telegram/telegram-text-editor", () => ({ TelegramTextEditor: ({ value, onChange }: { value: string; onChange: (text: string) => void }) => <textarea aria-label="Edit text" value={value} onChange={(e) => onChange(e.target.value)} /> }));
const caps: CrmChatCapabilities = { canReply: true, canEdit: true, canDelete: true, canDeleteForEveryone: true, canReact: true, canForward: true, canUpload: true, canSendVoice: true, maxUploadBytes: 10 * 1024 * 1024, voiceMimeTypes: ["audio/ogg;codecs=opus"], reactionEmoji: ["👍", "❤️"] };
const message = { id: "m-1", conversationId: "c-1", workspaceId: "w-1", telegramMessageId: "123", telegramMessageIdNumeric: 123, mtprotoAccountId: "a-1", direction: "OUTBOUND", origin: "TELEGRAM_SYNC", text: "😀 hello", contentMetadata: { entities: [{ type: "bold", offset: 3, length: 5 }] }, deliveryState: "SENT", sentAt: "2026-11-01T10:00:00Z", readState: "UNKNOWN", clientIdempotencyKey: null, editedAt: null, createdAt: "2026-11-01T10:00:00Z", sentByMemberId: null, sentByMember: null } as CrmMessageListItem;
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => { vi.restoreAllMocks(); vi.spyOn(crmChatActionsApi, "capabilities").mockResolvedValue(caps); });

describe("chat action transport adapter", () => {
  it("keeps timeout unknown and checks the same identity without executing twice", async () => {
    const execute = vi.spyOn(crmChatActionsApi, "execute").mockRejectedValue(new Error("lost response"));
    const check = vi.spyOn(crmChatActionsApi, "check").mockResolvedValue({ operationId: "receipt", conversationId: "c-1", status: "CONFIRMED", message });
    const { wrapper } = setup(); const { result } = renderHook(() => useCrmChatActions("c-1", true), { wrapper });
    await act(async () => { await result.current.execute({ kind: "FORWARD", messageId: message.id, destinationConversationId: "c-2" }); });
    const id = execute.mock.calls[0][1].operationId;
    expect(id).toMatch(/^\d{4}-\d{2}-\d{2}:[\da-f-]+$/);
    expect(result.current.receipt?.status).toBe("UNKNOWN");
    await act(async () => { await result.current.execute({ kind: "DELETE", messageId: message.id }); });
    expect(execute).toHaveBeenCalledOnce();
    await act(async () => { await result.current.check(); });
    expect(check).toHaveBeenCalledWith("c-1", id); expect(result.current.blocked).toBe(false);
  });
  it.each([403, 413])("leaves definitive HTTP %i rejection retryable rather than stuck unknown", async (status) => {
    const execute = vi.spyOn(crmChatActionsApi, "execute").mockRejectedValueOnce({ response: { status, data: { message: status === 403 ? "DO_NOT_CONTACT" : "UPLOAD_TOO_LARGE" } } }).mockResolvedValueOnce({ operationId: "next", conversationId: "c-1", status: "CONFIRMED" });
    const { wrapper } = setup(); const { result } = renderHook(() => useCrmChatActions("c-1", true), { wrapper });
    await act(async () => { await result.current.execute({ kind: "FORWARD", messageId: message.id, destinationConversationId: "c-2" }); });
    expect(result.current.receipt?.status).toBe("FAILED"); expect(result.current.blocked).toBe(false);
    await act(async () => { await result.current.execute({ kind: "REACTION", messageId: message.id, emoji: "👍" }); });
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it("serializes double clicks and reconciles authoritative edited payload without refetch", async () => {
    let resolve!: (value: { operationId: string; conversationId: string; status: "CONFIRMED"; message: CrmMessageListItem }) => void;
    const execute = vi.spyOn(crmChatActionsApi, "execute").mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { wrapper, client } = setup(); client.setQueryData(telegramCrmKeys.messagesInfinite("c-1"), { pages: [{ items: [message], hasMore: false, nextCursor: null }], pageParams: [null] });
    const invalidation = vi.spyOn(client, "invalidateQueries"); const { result } = renderHook(() => useCrmChatActions("c-1", true), { wrapper });
    let first!: Promise<boolean>;
    act(() => { first = result.current.execute({ kind: "EDIT", messageId: message.id, text: "Edited" }); });
    await act(async () => { await result.current.execute({ kind: "EDIT", messageId: message.id, text: "Edited" }); });
    expect(execute).toHaveBeenCalledOnce();
    await act(async () => { resolve({ operationId: "receipt", conversationId: "c-1", status: "CONFIRMED", message: { ...message, text: "Edited" } }); await first; });
    expect(client.getQueryData<{ pages: { items: CrmMessageListItem[] }[] }>(telegramCrmKeys.messagesInfinite("c-1"))?.pages[0].items[0].text).toBe("Edited"); expect(invalidation).not.toHaveBeenCalled();
  });
  it("tombstones a confirmed deletion and marks derived active lists stale without a history refetch", async () => {
    vi.spyOn(crmChatActionsApi, "execute").mockResolvedValue({ operationId: "delete", conversationId: "c-1", status: "CONFIRMED", deletedMessageIds: [message.id] });
    const { wrapper, client } = setup(); client.setQueryData(telegramCrmKeys.messagesInfinite("c-1"), { pages: [{ items: [message], hasMore: true, nextCursor: "older" }], pageParams: [null] });
    const invalidate = vi.spyOn(client, "invalidateQueries"); const { result } = renderHook(() => useCrmChatActions("c-1", true), { wrapper });
    await act(async () => { await result.current.execute({ kind: "DELETE", messageId: message.id, revoke: false }); });
    const current = client.getQueryData<{ pages: { items: CrmMessageListItem[]; nextCursor: string }[] }>(telegramCrmKeys.messagesInfinite("c-1"));
    expect(current?.pages[0].items[0].deletedAt).toBeTruthy(); expect(current?.pages[0].nextCursor).toBe("older");
    expect(invalidate.mock.calls.some(([filter]) => filter?.queryKey?.includes("messages"))).toBe(false);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: telegramCrmKeys.inboxConversations(), refetchType: "none" });
    expect(listCrmInboxConversations).not.toHaveBeenCalled();
  });
  it("does not execute actions without manual permission", async () => {
    const execute = vi.spyOn(crmChatActionsApi, "execute"); const { wrapper } = setup(); const { result } = renderHook(() => useCrmChatActions("c-1", false), { wrapper });
    await act(async () => { expect(await result.current.execute({ kind: "DELETE", messageId: message.id })).toBe(false); }); expect(execute).not.toHaveBeenCalled();
  });
});
describe("entities, reply and action presentation", () => {
  it("renders UTF16 entities, overlapping formatting and unsafe URLs without HTML execution", () => {
    render(<div>{renderChatEntities("😀 hello<script>", [{ type: "bold", offset: 3, length: 5 }, { type: "italic", offset: 3, length: 2 }, { type: "textUrl", offset: 3, length: 5, url: "javascript:alert(1)" }])}</div>);
    expect(screen.getByText("he").closest("strong")).toBeTruthy(); expect(screen.getByText("he").closest("em")).toBeTruthy(); expect(document.querySelector("script")).toBeNull(); expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(messageEditorMarkup("😀 hello", [{ type: "bold", offset: 3, length: 5 }])).toBe("😀 **hello**");
  });
  it("keeps plain-text manual snapshots literal even without entities", () => {
    const model = toChatMessage({ ...message, origin: "MANUAL", text: "**literal** <script>", contentMetadata: { telegramText: true } });
    expect(model.content).toBeUndefined(); expect(model.text).toBe("**literal** <script>");
  });
  it("resolves a real reply and marks deleted/protected messages unavailable", () => {
    const model = toChatMessage({ ...message, contentMetadata: { replyToTelegramMessageId: 123, protectedContent: true } }, [message]);
    expect(model.replyTo).toEqual({ id: message.id, text: "😀 hello" }); expect(model.actionCapabilities?.canForward).toBe(false);
    const deleted = toChatMessage({ ...message, deletedAt: "2026-11-01T11:00:00Z" }); expect(deleted.deleted).toBe(true); expect(deleted.actionCapabilities?.canReply).toBe(false);
  });
  it("requires explicit delete confirmation and selected revoke mode", async () => {
    const run = vi.fn().mockResolvedValue(true); const { wrapper } = setup(); render(<CrmMessageActionDialog selection={{ kind: "DELETE", message }} accountId="a-1" capabilities={caps} pending={false} blocked={false} onExecute={run} onClose={vi.fn()} />, { wrapper });
    expect(run).not.toHaveBeenCalled(); await userEvent.click(screen.getByLabelText("Delete for everyone")); await userEvent.click(screen.getByRole("button", { name: "Confirm deletion" })); expect(run).toHaveBeenCalledWith({ kind: "DELETE", messageId: message.id, revoke: true });
  });
  it("loads edit into separate existing editor and sends formatted markup on Save", async () => {
    const run = vi.fn().mockResolvedValue(true); const { wrapper } = setup(); render(<CrmMessageActionDialog selection={{ kind: "EDIT", message }} accountId="a-1" capabilities={caps} pending={false} blocked={false} onExecute={run} onClose={vi.fn()} />, { wrapper });
    expect(screen.getByLabelText("Edit text")).toHaveValue("😀 **hello**"); fireEvent.change(screen.getByLabelText("Edit text"), { target: { value: "**Updated**" } }); await userEvent.click(screen.getByRole("button", { name: "Save changes" })); expect(run).toHaveBeenCalledWith({ kind: "EDIT", messageId: message.id, text: "**Updated**" });
  });
});
describe("lazy media and voice fallback", () => {
  it("loads authorized bytes only on demand and reports unavailable media", async () => {
    const load = vi.fn().mockRejectedValue(new Error("deleted")); render(<AttachmentPreview attachment={{ id: "media", name: "private.png", kind: "image", load }} />);
    expect(load).not.toHaveBeenCalled(); expect(screen.queryByRole("img")).not.toBeInTheDocument(); await userEvent.click(screen.getByRole("button", { name: /private.png/ })); expect(load).toHaveBeenCalledOnce(); expect(await screen.findByRole("alert")).toHaveTextContent("Media unavailable");
  });
  it("handles denied microphone permission without recording or uploading", async () => {
    const microphone = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    vi.stubGlobal("MediaRecorder", class { static isTypeSupported() { return true; } });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: microphone } });
    const upload = vi.fn(); render(<CrmChatMediaControls capabilities={caps} disabled={false} onUpload={upload} />);
    await userEvent.click(screen.getByRole("button", { name: "Record audio" }));
    await userEvent.click(screen.getByRole("button", { name: "Start recording" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Microphone permission was denied"); expect(microphone).toHaveBeenCalledOnce(); expect(upload).not.toHaveBeenCalled();
  });
  it("stops a late microphone stream after the user cancels permission", async () => {
    let resolve!: (stream: { getTracks: () => { stop: () => void }[] }) => void;
    const stop = vi.fn(); const microphone = vi.fn(() => new Promise((done) => { resolve = done; }));
    vi.stubGlobal("MediaRecorder", class { static isTypeSupported() { return true; } });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: microphone } });
    const upload = vi.fn(); render(<CrmChatMediaControls capabilities={caps} disabled={false} onUpload={upload} />);
    await userEvent.click(screen.getByRole("button", { name: "Record audio" })); await userEvent.click(screen.getByRole("button", { name: "Start recording" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel recording" }));
    await act(async () => { resolve({ getTracks: () => [{ stop }] }); });
    expect(stop).toHaveBeenCalledOnce(); expect(upload).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("checks size before upload and requires explicit audio-file fallback", async () => {
    const upload = vi.fn(); render(<CrmChatMediaControls capabilities={{ ...caps, maxUploadBytes: 3 }} disabled={false} onUpload={upload} />);
    fireEvent.change(screen.getByLabelText("Choose attachment"), { target: { files: [new File(["large"], "report.pdf", { type: "application/pdf" })] } }); expect(screen.getByRole("alert")).toHaveTextContent("upload size limit"); expect(upload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Record audio" })); expect(screen.getByRole("button", { name: "Start recording" })).toBeDisabled(); await userEvent.click(screen.getByRole("checkbox")); expect(screen.getByRole("button", { name: "Start recording" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Start recording" })); await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Recording is unavailable")); expect(upload).not.toHaveBeenCalled();
  });
  it("shows recipient read status only when Telegram confirms it", () => {
    const outbound = { ...message, direction: "OUTBOUND" as const, deliveryState: "SENT" as const, readState: "UNKNOWN" as const, telegramMessageIdNumeric: 125 };
    expect(toChatMessage(outbound, [], 125).status).toBe("read");
    expect(toChatMessage({ ...outbound, deliveryState: "UNKNOWN" }, [], 125).status).toBe("read");
    expect(toChatMessage({ ...outbound, deliveryState: "UNKNOWN" }, [], 124).status).toBe("sent");
    expect(toChatMessage(outbound, [], 124).status).toBe("sent");
    expect(toChatMessage({ ...outbound, readState: "READ" }).status).toBe("read");
  });

});
