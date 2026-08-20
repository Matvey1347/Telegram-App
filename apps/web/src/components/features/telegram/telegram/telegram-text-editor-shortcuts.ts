import type { EditorCommandId, EditorShortcutPreferences } from "@telegram-system/shared";

export const editorCommandDetails: Array<{
  id: EditorCommandId;
  label: string;
  description: string;
}> = [
  { id: "bold", label: "Bold", description: "Emphasize selected text" },
  { id: "italic", label: "Italic", description: "Add italic formatting" },
  { id: "underline", label: "Underline", description: "Underline selected text" },
  { id: "strikethrough", label: "Strikethrough", description: "Strike through selected text" },
  { id: "spoiler", label: "Spoiler", description: "Hide text behind a spoiler" },
  { id: "inlineCode", label: "Inline code", description: "Format a code fragment" },
  { id: "codeBlock", label: "Code block", description: "Insert a multiline code block" },
  { id: "quote", label: "Quote", description: "Turn selected lines into a quote" },
  { id: "pullQuote", label: "Pull quote", description: "Insert an emphasized quote block" },
  { id: "heading", label: "Heading", description: "Turn selected lines into a heading" },
  { id: "bulletedList", label: "Bulleted list", description: "Start a bulleted list" },
  { id: "numberedList", label: "Numbered list", description: "Start a numbered list" },
  { id: "table", label: "Table", description: "Insert a table" },
  { id: "formula", label: "Formula", description: "Insert a formula block" },
  { id: "link", label: "Insert link", description: "Add a link to selected text" },
  { id: "emoji", label: "Insert emoji", description: "Open the emoji picker" },
  { id: "buttons", label: "Buttons", description: "Edit the post buttons" },
];

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
