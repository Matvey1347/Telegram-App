import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readWorkspaceModalDrafts,
  removeWorkspaceModalDraft,
  workspaceModalDraftStorageKey,
  writeWorkspaceModalDraft,
  type WorkspaceDraftStorageConfig,
  type WorkspaceFormDraft,
} from "./workspace-modal-drafts";

type Form = { title: string };

function config(
  workspaceId = "workspace-1",
  overrides: Partial<WorkspaceDraftStorageConfig<Form>> = {},
): WorkspaceDraftStorageConfig<Form> {
  return {
    namespace: "test-form:draft",
    workspaceId,
    schemaVersion: 4,
    normalize: (value) => {
      const title = (value as Partial<Form> | null)?.title;
      return typeof title === "string" ? { title: title.trim() } : null;
    },
    ...overrides,
  };
}

function envelope(title: string): WorkspaceFormDraft<Form> {
  return {
    id: "draft-1",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    schemaVersion: 4,
    form: { title },
  };
}

describe("workspace modal draft storage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it.each([
    ["v2 collection", { version: 2, drafts: [envelope("from v2")] }],
    ["legacy single", { version: 1, title: "from single" }],
  ])("migrates a %s into the canonical collection", (_, legacy) => {
    localStorage.setItem("old-form:draft:workspace-1", JSON.stringify(legacy));
    const drafts = readWorkspaceModalDrafts(
      localStorage,
      config("workspace-1", { legacyNamespaces: ["old-form:draft"] }),
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0].form.title).toMatch(/^from /);
    expect(drafts[0].schemaVersion).toBe(4);
    expect(localStorage.getItem("old-form:draft:workspace-1")).toBeNull();
    expect(localStorage.getItem("test-form:draft:workspace-1")).toContain(
      '"version":3',
    );
  });

  it("repairs corrupt and normalization-rejected storage", () => {
    const key = workspaceModalDraftStorageKey("test-form:draft", "workspace-1");
    localStorage.setItem(key, "{broken");
    expect(readWorkspaceModalDrafts(localStorage, config())).toEqual([]);
    expect(localStorage.getItem(key)).toBeNull();

    localStorage.setItem(key, JSON.stringify({ version: 2, drafts: [{ nope: 1 }] }));
    expect(readWorkspaceModalDrafts(localStorage, config())).toEqual([]);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("keeps createdAt immutable and only updates changed drafts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const first = writeWorkspaceModalDraft(localStorage, config(), envelope("one"));
    vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));
    const unchanged = writeWorkspaceModalDraft(localStorage, config(), first);
    const changed = writeWorkspaceModalDraft(localStorage, config(), {
      ...unchanged,
      form: { title: "two" },
    });

    expect(unchanged).toEqual(first);
    expect(changed.createdAt).toBe("2025-01-01T00:00:00.000Z");
    expect(changed.updatedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("deduplicates identical writes and isolates workspaces", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const first = writeWorkspaceModalDraft(localStorage, config(), envelope("one"));
    const calls = setItem.mock.calls.length;
    writeWorkspaceModalDraft(localStorage, config(), first);
    writeWorkspaceModalDraft(localStorage, config("workspace-2"), envelope("two"));

    expect(setItem.mock.calls.length).toBe(calls + 1);
    expect(readWorkspaceModalDrafts(localStorage, config())[0].form.title).toBe("one");
    expect(
      readWorkspaceModalDrafts(localStorage, config("workspace-2"))[0].form.title,
    ).toBe("two");
    setItem.mockRestore();
  });

  it("merges canonical and legacy collections before removing the legacy key", () => {
    localStorage.setItem(
      "test-form:draft:workspace-1",
      JSON.stringify({ version: 3, drafts: [envelope("canonical")] }),
    );
    localStorage.setItem(
      "old-form:draft:workspace-1",
      JSON.stringify({
        version: 2,
        drafts: [{ ...envelope("legacy"), id: "draft-2" }],
      }),
    );

    const drafts = readWorkspaceModalDrafts(
      localStorage,
      config("workspace-1", { legacyNamespaces: ["old-form:draft"] }),
    );

    expect(drafts.map((draft) => draft.form.title)).toEqual([
      "canonical",
      "legacy",
    ]);
    expect(localStorage.getItem("old-form:draft:workspace-1")).toBeNull();
    expect(localStorage.getItem("test-form:draft:workspace-1")).toContain(
      '"id":"draft-2"',
    );
  });

  it("keeps the prior envelope when quota rejects an update", () => {
    const first = writeWorkspaceModalDraft(localStorage, config(), envelope("one"));
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("full", "QuotaExceededError");
      });
    const rejected = writeWorkspaceModalDraft(localStorage, config(), {
      ...first,
      form: { title: "two" },
    });

    expect(rejected).toEqual(first);
    expect(readWorkspaceModalDrafts(localStorage, config())[0].form.title).toBe("one");
    setItem.mockRestore();
  });

  it("does not rewrite absent entries while removing", () => {
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    removeWorkspaceModalDraft(localStorage, config(), "missing");
    expect(removeItem).not.toHaveBeenCalled();
    removeItem.mockRestore();
  });
});
