import { Bold, Code, EyeOff, Italic, Strikethrough, Underline, type LucideIcon } from "lucide-react";
import type { EditorCommandId } from "@telegram-system/shared";

export type EditorWrapAction = {
  id: EditorCommandId;
  label: string;
  icon: LucideIcon;
  before: string;
  after: string;
  placeholder: string;
};

export const editorWrapActions: EditorWrapAction[] = [
  { id: "bold", label: "Bold", icon: Bold, before: "**", after: "**", placeholder: "bold text" },
  { id: "italic", label: "Italic", icon: Italic, before: "__", after: "__", placeholder: "italic text" },
  { id: "underline", label: "Underline", icon: Underline, before: "++", after: "++", placeholder: "underlined text" },
  { id: "strikethrough", label: "Strikethrough", icon: Strikethrough, before: "~~", after: "~~", placeholder: "strikethrough text" },
  { id: "spoiler", label: "Spoiler", icon: EyeOff, before: "||", after: "||", placeholder: "hidden text" },
  { id: "inlineCode", label: "Inline code", icon: Code, before: "`", after: "`", placeholder: "code" },
];
