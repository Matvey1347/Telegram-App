import { Bold, Code, EyeOff, Italic, Strikethrough, Underline, type LucideIcon } from "lucide-react";
import type { EditorCommandId } from "@telegram-system/shared";

export type EditorWrapAction = {
  id: EditorCommandId;
  icon: LucideIcon;
  before: string;
  after: string;
};

export const editorWrapActions: EditorWrapAction[] = [
  { id: "bold", icon: Bold, before: "**", after: "**" },
  { id: "italic", icon: Italic, before: "__", after: "__" },
  { id: "underline", icon: Underline, before: "++", after: "++" },
  { id: "strikethrough", icon: Strikethrough, before: "~~", after: "~~" },
  { id: "spoiler", icon: EyeOff, before: "||", after: "||" },
  { id: "inlineCode", icon: Code, before: "`", after: "`" },
];
