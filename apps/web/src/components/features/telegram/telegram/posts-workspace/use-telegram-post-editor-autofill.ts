"use client";

import { useEffect } from "react";
import { iconsApi } from "@/lib/api";
import type { useTelegramPostEditorState } from "./use-telegram-post-editor-state";
import type { useTelegramPostEditorContext } from "./use-telegram-post-editor-context";

type Input = Pick<
  ReturnType<typeof useTelegramPostEditorState>,
  | "setPostGroupId"
  | "editing"
  | "titleManuallyEdited"
  | "title"
  | "setTitle"
  | "iconRef"
  | "iconAutofillRef"
  | "setIcon"
  | "iconAutofillRequestRef"
> &
  Pick<
    ReturnType<typeof useTelegramPostEditorContext>,
    "rememberPostGroup" | "autoPrefilledTitle"
  >;

export function useTelegramPostEditorAutofill(input: Input) {
  const {
    setPostGroupId,
    editing,
    titleManuallyEdited,
    title,
    setTitle,
    iconRef,
    iconAutofillRef,
    setIcon,
    iconAutofillRequestRef,
    rememberPostGroup,
    autoPrefilledTitle,
  } = input;

  const changePostGroup = (nextGroupId: string) => {
    const normalized = nextGroupId || null;
    setPostGroupId(normalized);
    rememberPostGroup(normalized);
  };

  useEffect(() => {
    if (editing || titleManuallyEdited) return;
    const nextAutoTitle = autoPrefilledTitle?.title ?? "";
    if (title === nextAutoTitle) return;
    setTitle(nextAutoTitle);
  }, [autoPrefilledTitle?.title, editing, title, titleManuallyEdited]);

  useEffect(() => {
    if (editing) return;
    const nextEmoji = autoPrefilledTitle?.emoji ?? null;
    const canAutofillIcon = !iconRef.current || iconAutofillRef.current.active;

    if (!canAutofillIcon) return;

    if (!nextEmoji) {
      if (iconAutofillRef.current.active) {
        iconAutofillRef.current = { active: false, emoji: null };
        iconRef.current = null;
        setIcon(null);
      }
      return;
    }

    if (
      iconAutofillRef.current.active &&
      iconAutofillRef.current.emoji === nextEmoji
    ) {
      return;
    }

    const requestId = iconAutofillRequestRef.current + 1;
    iconAutofillRequestRef.current = requestId;

    void (async () => {
      try {
        const createdIcon = await iconsApi.createEmoji({
          name: autoPrefilledTitle?.title || nextEmoji,
          emoji: nextEmoji,
        });
        if (iconAutofillRequestRef.current !== requestId) return;
        if (iconRef.current && !iconAutofillRef.current.active) return;
        iconAutofillRef.current = { active: true, emoji: nextEmoji };
        iconRef.current = createdIcon.id;
        setIcon(createdIcon.id);
      } catch {
        if (iconAutofillRequestRef.current !== requestId) return;
        iconAutofillRef.current = { active: false, emoji: null };
      }
    })();
  }, [autoPrefilledTitle?.emoji, autoPrefilledTitle?.title, editing]);

  return { changePostGroup };
}
