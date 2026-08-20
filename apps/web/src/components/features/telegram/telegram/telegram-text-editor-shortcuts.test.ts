import { describe, expect, it } from "vitest";
import { defaultEditorShortcuts, effectiveEditorShortcuts, shortcutFromEvent } from "./telegram-text-editor-shortcuts";

describe("telegram text editor shortcuts", () => {
  it("keeps defaults for commands that a user has not customized", () => {
    expect(effectiveEditorShortcuts({ bold: "Mod+Shift+B" })).toMatchObject({
      bold: "Mod+Shift+B",
      italic: defaultEditorShortcuts.italic,
    });
  });

  it("recognizes command-modified editor key combinations", () => {
    expect(shortcutFromEvent({ key: "b", metaKey: false, ctrlKey: true, shiftKey: true, altKey: false })).toBe("Mod+Shift+B");
    expect(shortcutFromEvent({ key: "Escape", metaKey: false, ctrlKey: true, shiftKey: false, altKey: false })).toBeNull();
  });
});
