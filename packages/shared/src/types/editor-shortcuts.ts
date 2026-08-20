export const editorCommandIds = [
  'bold', 'italic', 'underline', 'strikethrough', 'spoiler', 'inlineCode',
  'codeBlock', 'quote', 'pullQuote', 'heading', 'bulletedList',
  'numberedList', 'table', 'formula', 'link', 'emoji', 'buttons',
] as const;

export type EditorCommandId = (typeof editorCommandIds)[number];
export type EditorShortcutPreferences = Partial<Record<EditorCommandId, string>>;
