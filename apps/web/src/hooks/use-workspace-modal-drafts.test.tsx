import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useMemo, useState } from "react";
import type { ResolvedEmoji } from "@telegram-system/shared";
import { useWorkspaceModalDrafts } from "./use-workspace-modal-drafts";

type Form = { title: string };

function useHarness(open = true) {
  const [value, setValue] = useState<Form>({ title: "" });
  const session = useWorkspaceModalDrafts({
    namespace: "test-modal:draft",
    open,
    enabled: true,
    value,
    emptyValue: () => ({ title: "" }),
    onRestore: setValue,
    isMeaningful: (draft) => Boolean(draft.title.trim()),
  });
  return { value, setValue, session };
}

function usePreviewHarness() {
  const [value, setValue] = useState<Form>({ title: "" });
  const [icon, setIcon] = useState<ResolvedEmoji | null>(null);
  const preview = useMemo(() => ({ icon }), [icon]);
  const session = useWorkspaceModalDrafts({
    namespace: "test-preview:draft",
    open: true,
    enabled: true,
    value,
    preview,
    emptyValue: () => ({ title: "" }),
    onRestore: (nextValue, draft) => {
      setValue(nextValue);
      setIcon(draft?.preview?.icon ?? null);
    },
    isMeaningful: (draft) => Boolean(draft.title.trim()),
  });
  return { value, icon, setValue, setIcon, session };
}

describe("useWorkspaceModalDrafts", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("selected-workspace-id", "workspace-1");
  });

  it("autosaves a meaningful form and restores it on the next modal session", async () => {
    const first = renderHook(() => useHarness());
    act(() => first.result.current.setValue({ title: "Saved promo" }));
    await waitFor(() =>
      expect(localStorage.getItem("test-modal:draft:workspace-1")).toContain(
        "Saved promo",
      ),
    );
    first.unmount();

    const second = renderHook(() => useHarness());
    await waitFor(() =>
      expect(second.result.current.session.pendingDrafts).toHaveLength(1),
    );
    act(() =>
      second.result.current.session.continueDraft(
        second.result.current.session.pendingDrafts[0],
      ),
    );
    expect(second.result.current.value.title).toBe("Saved promo");
  });

  it("deletes a stored draft", async () => {
    const first = renderHook(() => useHarness());
    act(() => first.result.current.setValue({ title: "Delete me" }));
    await waitFor(() =>
      expect(localStorage.getItem("test-modal:draft:workspace-1")).toContain(
        "Delete me",
      ),
    );
    first.unmount();
    const second = renderHook(() => useHarness());
    await waitFor(() =>
      expect(second.result.current.session.pendingDrafts).toHaveLength(1),
    );
    act(() =>
      second.result.current.session.deleteDraft(
        second.result.current.session.pendingDrafts[0],
      ),
    );
    expect(localStorage.getItem("test-modal:draft:workspace-1")).toBeNull();
    expect(second.result.current.value).toEqual({ title: "" });
    expect(second.result.current.session.pendingDrafts).toEqual([]);
  });

  it("persists and restores shared draft preview metadata", async () => {
    const first = renderHook(() => usePreviewHarness());
    act(() => {
      first.result.current.setValue({ title: "Emoji draft" });
      first.result.current.setIcon({ type: "unicode", value: "✨" });
    });
    await waitFor(() =>
      expect(localStorage.getItem("test-preview:draft:workspace-1")).toContain(
        '"value":"✨"',
      ),
    );
    first.unmount();

    const second = renderHook(() => usePreviewHarness());
    await waitFor(() =>
      expect(second.result.current.session.pendingDrafts).toHaveLength(1),
    );
    act(() =>
      second.result.current.session.continueDraft(
        second.result.current.session.pendingDrafts[0],
      ),
    );
    expect(second.result.current.value.title).toBe("Emoji draft");
    expect(second.result.current.icon).toEqual({
      type: "unicode",
      value: "✨",
    });
  });
});
