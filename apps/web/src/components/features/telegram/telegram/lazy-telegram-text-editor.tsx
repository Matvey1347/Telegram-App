"use client";

import dynamic from "next/dynamic";
import type { Ref } from "react";
import type {
  TelegramTextEditorHandle,
  TelegramTextEditorProps,
} from "./telegram-text-editor";

type LazyEditorProps = TelegramTextEditorProps & {
  editorRef?: Ref<TelegramTextEditorHandle>;
};

const LazyEditor = dynamic<LazyEditorProps>(async () => {
  const { TelegramTextEditor } = await import("./telegram-text-editor");
  return function LoadedTelegramTextEditor({ editorRef, ...props }) {
    return <TelegramTextEditor {...props} ref={editorRef} />;
  };
});

export function LazyTelegramTextEditor(props: LazyEditorProps) {
  return <LazyEditor {...props} />;
}
