import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMemo, useState } from "react";
import type { ResolvedEmoji } from "@telegram-system/shared";
import { useWorkspaceModalDrafts } from "./use-workspace-modal-drafts";

type Form = { title: string };

function useHarness(open = true) {
  const [value, setValue] = useState<Form>({ title: "" });
  const session = useWorkspaceModalDrafts<Form>({
    namespace: "test-modal:draft",
    workspaceId: "workspace-1",
    schemaVersion: 1,
    open,
    enabled: true,
    value,
    createInitialValue: () => ({ title: "" }),
    onRestore: setValue,
    isMeaningful: (draft) => Boolean(draft.title.trim()),
  });
  return { value, setValue, session };
}

function usePreviewHarness() {
  const [value, setValue] = useState<Form>({ title: "" });
  const [icon, setIcon] = useState<ResolvedEmoji | null>(null);
  const preview = useMemo(() => ({ icon }), [icon]);
  const session = useWorkspaceModalDrafts<Form>({
    namespace: "test-preview:draft",
    workspaceId: "workspace-1",
    schemaVersion: 1,
    open: true,
    enabled: true,
    value,
    preview,
    createInitialValue: () => ({ title: "" }),
    onRestore: (nextValue, draft) => {
      setValue(nextValue);
      setIcon(draft?.preview?.icon ?? null);
    },
    isMeaningful: (draft) => Boolean(draft.title.trim()),
  });
  return { value, icon, setValue, setIcon, session };
}

function useSeedHarness() {
  const seed = "Channel default";
  const [value, setValue] = useState<Form>({ title: "stale" });
  const session = useWorkspaceModalDrafts<Form>({
    namespace: "test-seed:draft",
    workspaceId: "workspace-1",
    schemaVersion: 1,
    open: true,
    enabled: true,
    value,
    createInitialValue: () => ({ title: seed }),
    onRestore: setValue,
    isMeaningful: (draft) => draft.title !== seed,
  });
  return { value, setValue, session };
}

function useChangingSeedHarness(open: boolean, seed: string) {
  const [value, setValue] = useState<Form>({ title: "closed" });
  const session = useWorkspaceModalDrafts<Form>({
    namespace: "test-changing-seed:draft",
    workspaceId: "workspace-1",
    schemaVersion: 1,
    open,
    enabled: true,
    value,
    createInitialValue: () => ({ title: seed }),
    onRestore: setValue,
    isMeaningful: (draft) => draft.title !== seed,
  });
  return { value, session };
}

function useWorkspaceSwitchHarness(workspaceId: string) {
  const [value, setValue] = useState<Form>({ title: "" });
  const session = useWorkspaceModalDrafts<Form>({
    namespace: "test-workspace-switch:draft",
    workspaceId,
    schemaVersion: 1,
    open: true,
    enabled: true,
    value,
    createInitialValue: () => ({ title: "" }),
    onRestore: setValue,
    isMeaningful: (draft) => Boolean(draft.title),
  });
  return { value, setValue, session };
}

function useEnabledHarness(enabled: boolean) {
  const [value, setValue] = useState<Form>({ title: "Existing entity" });
  const session = useWorkspaceModalDrafts<Form>({
    namespace: "test-enabled:draft",
    workspaceId: "workspace-1",
    schemaVersion: 1,
    open: true,
    enabled,
    value,
    createInitialValue: () => ({ title: "" }),
    onRestore: setValue,
    isMeaningful: (draft) => Boolean(draft.title),
  });
  return { value, setValue, session };
}

describe("useWorkspaceModalDrafts", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("selected-workspace-id", "workspace-1");
  });

  it("opens without a picker and restores the feature seed for a new draft", async () => {
    const harness = renderHook(() => useSeedHarness());
    await waitFor(() =>
      expect(harness.result.current.value).toEqual({
        title: "Channel default",
      }),
    );
    expect(harness.result.current.session.pendingDrafts).toEqual([]);
    expect(localStorage.getItem("test-seed:draft:workspace-1")).toBeNull();

    act(() => harness.result.current.setValue({ title: "Changed" }));
    await waitFor(() =>
      expect(localStorage.getItem("test-seed:draft:workspace-1")).toContain(
        "Changed",
      ),
    );
    act(() => harness.result.current.session.createNewDraft());
    expect(harness.result.current.value).toEqual({ title: "Channel default" });
    expect(localStorage.getItem("test-seed:draft:workspace-1")).toContain(
      "Changed",
    );
  });

  it("uses the current prop-derived seed when a mounted modal reopens", async () => {
    const harness = renderHook(
      ({ open, seed }: { open: boolean; seed: string }) =>
        useChangingSeedHarness(open, seed),
      { initialProps: { open: false, seed: "Channel A" } },
    );

    harness.rerender({ open: true, seed: "Channel B" });
    await waitFor(() =>
      expect(harness.result.current.value).toEqual({ title: "Channel B" }),
    );
    expect(
      localStorage.getItem("test-changing-seed:draft:workspace-1"),
    ).toBeNull();
  });

  it("never writes the previous workspace snapshot under a new workspace key", async () => {
    const harness = renderHook(
      ({ workspaceId }: { workspaceId: string }) =>
        useWorkspaceSwitchHarness(workspaceId),
      { initialProps: { workspaceId: "workspace-a" } },
    );
    await waitFor(() =>
      expect(harness.result.current.session.currentDraft).toBeTruthy(),
    );
    act(() => harness.result.current.setValue({ title: "Workspace A form" }));
    await waitFor(() =>
      expect(
        localStorage.getItem("test-workspace-switch:draft:workspace-a"),
      ).toContain("Workspace A form"),
    );

    harness.rerender({ workspaceId: "workspace-b" });
    await waitFor(() =>
      expect(harness.result.current.value).toEqual({ title: "" }),
    );
    expect(
      localStorage.getItem("test-workspace-switch:draft:workspace-b"),
    ).toBeNull();
    expect(
      localStorage.getItem("test-workspace-switch:draft:workspace-a"),
    ).toContain("Workspace A form");
  });

  it("cannot create or persist a draft while draft mode is disabled", async () => {
    const harness = renderHook(() => useEnabledHarness(false));

    act(() => harness.result.current.session.createNewDraft());
    act(() =>
      harness.result.current.setValue({ title: "Edited existing entity" }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(harness.result.current.session.currentDraft).toBeNull();
    expect(localStorage.getItem("test-enabled:draft:workspace-1")).toBeNull();
  });

  it("autosaves a meaningful form and restores it on the next modal session", async () => {
    const first = renderHook(() => useHarness());
    await waitFor(() =>
      expect(first.result.current.session.currentDraft).toBeTruthy(),
    );
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

  it("does not replace the active draft snapshot after an autosave", async () => {
    const harness = renderHook(() => useHarness());
    await waitFor(() =>
      expect(harness.result.current.session.currentDraft).toBeTruthy(),
    );
    const activeSnapshot = harness.result.current.session.currentDraft;

    act(() => harness.result.current.setValue({ title: "No render loop" }));
    await waitFor(() =>
      expect(localStorage.getItem("test-modal:draft:workspace-1")).toContain(
        "No render loop",
      ),
    );

    // Persisting is intentionally side-effect-only. Replacing currentDraft
    // here would re-run the autosave effect and can cause an update-depth loop.
    expect(harness.result.current.session.currentDraft).toBe(activeSnapshot);
  });

  it("deletes a stored draft", async () => {
    const first = renderHook(() => useHarness());
    await waitFor(() =>
      expect(first.result.current.session.currentDraft).toBeTruthy(),
    );
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
    await waitFor(() =>
      expect(first.result.current.session.currentDraft).toBeTruthy(),
    );
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

  it("keeps multiple drafts and can return from an editor to the picker", async () => {
    const harness = renderHook(() => useHarness());
    await waitFor(() =>
      expect(harness.result.current.session.currentDraft).toBeTruthy(),
    );
    act(() => harness.result.current.setValue({ title: "First" }));
    await waitFor(() =>
      expect(localStorage.getItem("test-modal:draft:workspace-1")).toContain(
        "First",
      ),
    );

    act(() => harness.result.current.session.createNewDraft());
    expect(harness.result.current.value).toEqual({ title: "" });
    act(() => harness.result.current.setValue({ title: "Second" }));
    await waitFor(() =>
      expect(localStorage.getItem("test-modal:draft:workspace-1")).toContain(
        "Second",
      ),
    );

    act(() => harness.result.current.session.showDraftPicker());
    await waitFor(() =>
      expect(harness.result.current.session.pendingDrafts).toHaveLength(2),
    );
    const [first, second] = harness.result.current.session.pendingDrafts;
    act(() => harness.result.current.session.deleteDraft(first));
    expect(harness.result.current.session.pendingDrafts).toEqual([second]);
    expect(localStorage.getItem("test-modal:draft:workspace-1")).not.toContain(
      "First",
    );

    act(() => harness.result.current.session.continueDraft(second));
    expect(harness.result.current.value).toEqual({ title: "Second" });
    expect(harness.result.current.session.pendingDrafts).toEqual([]);
  });

  it("does not loop when local storage rejects autosave", async () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("full", "QuotaExceededError");
      });
    const harness = renderHook(() => useHarness());
    await waitFor(() =>
      expect(harness.result.current.session.currentDraft).toBeTruthy(),
    );
    act(() => harness.result.current.setValue({ title: "Cannot persist" }));
    await waitFor(() => expect(setItem).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(setItem.mock.calls.length).toBeLessThan(4);
    expect(harness.result.current.value.title).toBe("Cannot persist");
    setItem.mockRestore();
  });

  it("does not recreate a draft after successful-submit cleanup and rerender", async () => {
    const harness = renderHook(() => useHarness());
    await waitFor(() =>
      expect(harness.result.current.session.currentDraft).toBeTruthy(),
    );
    act(() => harness.result.current.setValue({ title: "Submitted" }));
    await waitFor(() =>
      expect(localStorage.getItem("test-modal:draft:workspace-1")).toContain(
        "Submitted",
      ),
    );

    act(() => harness.result.current.session.clearCurrentDraft());
    expect(localStorage.getItem("test-modal:draft:workspace-1")).toBeNull();
    expect(harness.result.current.session.currentDraft).toBeNull();

    act(() => harness.rerender());
    expect(localStorage.getItem("test-modal:draft:workspace-1")).toBeNull();
  });
});
