import type { EditorCommandId, EditorShortcutPreferences } from "@telegram-system/shared";

const editorCommandIds = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "spoiler",
  "inlineCode",
  "codeBlock",
  "quote",
  "pullQuote",
  "heading",
  "bulletedList",
  "numberedList",
  "table",
  "formula",
  "link",
  "emoji",
  "buttons",
] as const satisfies readonly EditorCommandId[];

export const editorCommandDetails: Array<{ id: EditorCommandId }> =
  editorCommandIds.map((id) => ({ id }));

export const defaultEditorShortcuts: EditorShortcutPreferences = {
  bold: "Mod+B",
  italic: "Mod+I",
  underline: "Mod+U",
  strikethrough: "Mod+Shift+S",
  spoiler: "Mod+Shift+X",
  inlineCode: "Mod+Shift+C",
  codeBlock: "Mod+Shift+D",
  quote: "Mod+Shift+Q",
  pullQuote: "Mod+Shift+P",
  heading: "Mod+Shift+H",
  bulletedList: "Mod+Shift+8",
  numberedList: "Mod+Shift+7",
  table: "Mod+Shift+T",
  formula: "Mod+Shift+F",
  link: "Mod+K",
  emoji: "Mod+Shift+E",
  buttons: "Mod+Shift+B",
};

export function effectiveEditorShortcuts(preferences?: EditorShortcutPreferences) {
  return { ...defaultEditorShortcuts, ...preferences };
}

export function shortcutFromEvent(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.length === 1 ? event.key.toUpperCase() : "";
  if (!/^[A-Z0-9]$/.test(key)) return null;
  return `Mod${event.shiftKey ? "+Shift" : ""}+${key}`;
}

export function shortcutLabel(shortcut: string) {
  return shortcut
    .replace("Mod", typeof navigator !== "undefined" && /Mac|iPhone|iPad/u.test(navigator.platform) ? "⌘" : "Ctrl")
    .replaceAll("+", " + ");
}
