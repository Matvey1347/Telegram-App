import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CrmMessageComposer,
  type CrmMessageComposerHandle,
} from "../crm-message-composer";
import {
  approvedComposerDraft,
  composerAiChanged,
  messageAiApproval,
  normalizeComposerDraft,
} from "../crm-composer-draft";
import { copilotDraft } from "./copilot-fixtures.test-support";
vi.mock("@/components/features/telegram/telegram/telegram-text-editor", () => ({
  TelegramTextEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea
      aria-label="Message text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
beforeEach(() => localStorage.clear());
const approved = { ...copilotDraft, status: "APPROVED" as const, revision: 4 };
function mount() {
  const ref = createRef<CrmMessageComposerHandle>();
  const send = vi.fn().mockResolvedValue(false);
  const review = vi.fn();
  return {
    ...render(
      <CrmMessageComposer
        ref={ref}
        workspaceId="workspace-one"
        conversationId="chat-one"
        sending={false}
        onSend={send}
        onReviewAiEdit={review}
      />,
    ),
    ref,
    send,
    review,
  };
}
describe("AI composer provenance", () => {
  it("keeps an edited AI draft when the old approved bubble retry succeeds", () => {
    const { ref } = mount();
    act(() => ref.current?.insertApproved(approved));
    fireEvent.change(screen.getByRole("textbox", { name: "Message text" }), {
      target: { value: "Preserve the manager edit" },
    });
    act(() => ref.current?.clearSent("ai:draft-one:4"));
    expect(screen.getByRole("textbox", { name: "Message text" })).toHaveValue(
      "Preserve the manager edit",
    );
  });

  it("inserts only approved drafts with deterministic send identity", () => {
    expect(approvedComposerDraft(copilotDraft)).toBeNull();
    expect(approvedComposerDraft(approved)).toMatchObject({
      key: "ai:draft-one:4",
      ai: { aiDraftId: "draft-one", aiDraftRevision: 4 },
    });
    expect(approvedComposerDraft({ ...approved, text: "" })).toBeNull();
  });
  it("preserves proof through normalization and rejects corrupt approval metadata", () => {
    const value = approvedComposerDraft(approved)!;
    expect(normalizeComposerDraft({ ...value, key: "old-random-key" })).toEqual(
      value,
    );
    expect(
      normalizeComposerDraft({
        ...value,
        ai: { aiDraftId: "draft-one", aiDraftRevision: 0 },
      }),
    ).toBeNull();
    expect(normalizeComposerDraft({ text: "ordinary", key: "uuid" })).toEqual({
      text: "ordinary",
      key: "uuid",
    });
    expect(messageAiApproval({ aiDraftId: "a", aiDraftRevision: 2 })).toEqual({
      aiDraftId: "a",
      aiDraftRevision: 2,
    });
    expect(messageAiApproval({ aiDraftId: "a" })).toBeUndefined();
  });
  it("requires explicit manual Send after insertion and carries approval", async () => {
    const { ref, send } = mount();
    act(() => ref.current?.insertApproved(approved));
    expect(screen.getByRole("textbox", { name: "Message text" })).toHaveValue(
      approved.text,
    );
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(approved.text, "ai:draft-one:4", {
        aiDraftId: "draft-one",
        aiDraftRevision: 4,
      }),
    );
  });
  it("blocks edited approved text and opens review with actual composer text", () => {
    const { ref, send, review } = mount();
    act(() => ref.current?.insertApproved(approved));
    fireEvent.change(screen.getByRole("textbox", { name: "Message text" }), {
      target: { value: "Manager changed this text" },
    });
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Review edited AI text" }),
    );
    expect(review).toHaveBeenCalledWith(
      "draft-one",
      "Manager changed this text",
    );
    expect(send).not.toHaveBeenCalled();
    expect(
      composerAiChanged({
        ...approvedComposerDraft(approved)!,
        text: "changed",
      }),
    ).toBe(true);
  });
  it("never overwrites an existing draft without confirmation and keeps it saved", async () => {
    const { ref } = mount();
    fireEvent.change(screen.getByRole("textbox", { name: "Message text" }), {
      target: { value: "Keep my independent message" },
    });
    act(() => ref.current?.insertApproved(approved));
    expect(
      screen.getByRole("dialog", { name: "Insert approved AI text?" }),
    ).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Message text" })).toHaveValue(
      "Keep my independent message",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create AI composer draft" }),
    );
    expect(screen.getByRole("textbox", { name: "Message text" })).toHaveValue(
      approved.text,
    );
    await waitFor(() =>
      expect(
        localStorage.getItem("crm-message:chat-one:workspace-one"),
      ).toContain("Keep my independent message"),
    );
  });
  it("restores approval metadata and canonical identity through the shared draft picker", async () => {
    const first = mount();
    act(() => first.ref.current?.insertApproved(approved));
    await waitFor(() =>
      expect(
        localStorage.getItem("crm-message:chat-one:workspace-one"),
      ).toContain("aiDraftRevision"),
    );
    first.unmount();
    const next = mount();
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Continue draft Message draft/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect(next.send).toHaveBeenCalledWith(approved.text, "ai:draft-one:4", {
        aiDraftId: "draft-one",
        aiDraftRevision: 4,
      }),
    );
  });
});
