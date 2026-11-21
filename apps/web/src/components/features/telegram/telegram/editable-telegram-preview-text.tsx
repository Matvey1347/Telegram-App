"use client";

import {
  Bold,
  Code,
  Italic,
  Quote,
  Strikethrough,
  Underline,
} from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { editorHtmlToTelegramMarkup } from "./telegram-text-editor-format";
import type { TelegramCustomEmojiPackSummary } from "@telegram-system/shared";
import { useTelegramTableCellEditor } from "./telegram-table-cell-editor";
import { normalizeTelegramFormattedHtml } from "./telegram-formatted-html";
import { useI18n } from "@/providers/i18n-provider";
import {
  handlePreviewContentClick,
  previewHtml,
  useTelegramCustomEmojiLottie,
  type PreviewLabels,
} from "./telegram-post-preview-content";

export function EditableTelegramPreviewText({
  value,
  formattedHtml,
  onChange,
  onUndo,
  onRedo,
  customEmojiPacks = [],
  ariaLabel,
}: {
  value: string;
  formattedHtml?: string | null;
  onChange: (value: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  customEmojiPacks?: TelegramCustomEmojiPackSummary[];
  ariaLabel?: string;
}) {
  const { t } = useI18n();
  const previewLabels = useMemo<PreviewLabels>(
    () => ({
      copy: t("telegram.posts.editorComponents.preview.copy"),
      copyCode: t("telegram.posts.editorComponents.preview.copyCode"),
      internalPostLink: t(
        "telegram.posts.editorComponents.preview.internalPostLink",
      ),
    }),
    [t],
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const lastMarkupRef = useRef(value);
  const hasRenderedValueRef = useRef(false);
  const pendingExternalHistorySelectionResetRef = useRef(false);
  const [toolbar, setToolbar] = useState<{ top: number; left: number } | null>(
    null,
  );
  const usesExternalHistory = Boolean(onUndo && onRedo);
  const renderedPacksRef = useRef(customEmojiPacks);

  const isSelectionInsidePreview = useCallback(() => {
    const element = contentRef.current;
    const selection = window.getSelection();
    if (!element || !selection || !selection.rangeCount) return false;
    return element.contains(selection.getRangeAt(0).commonAncestorContainer);
  }, []);

  const collapseSelectionToPreviewEnd = useCallback(() => {
    const element = contentRef.current;
    const selection = window.getSelection();
    if (!element || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    savedRangeRef.current = range.cloneRange();
    element.focus();
  }, []);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const nextHtml = formattedHtml
      ? normalizeTelegramFormattedHtml(formattedHtml, previewLabels.copyCode)
      : previewHtml(value, customEmojiPacks, previewLabels);
    if (!hasRenderedValueRef.current) {
      element.innerHTML = nextHtml;
      hasRenderedValueRef.current = true;
      lastMarkupRef.current = value;
      renderedPacksRef.current = customEmojiPacks;
      return;
    }

    // Hydrate emoji that were initially rendered before their packs arrived.
    // Replace only emoji nodes so the user's text and selection stay intact.
    if (
      renderedPacksRef.current !== customEmojiPacks &&
      lastMarkupRef.current === value
    ) {
      const rendered = document.createElement("div");
      rendered.innerHTML = nextHtml;
      const currentEmoji = element.querySelectorAll(
        "[data-telegram-custom-emoji-id]",
      );
      const nextEmoji = rendered.querySelectorAll(
        "[data-telegram-custom-emoji-id]",
      );
      if (currentEmoji.length === nextEmoji.length) {
        currentEmoji.forEach((node, index) => {
          const replacement = nextEmoji[index];
          if (
            node.getAttribute("data-telegram-custom-emoji-id") ===
            replacement.getAttribute("data-telegram-custom-emoji-id")
          ) {
            node.replaceWith(replacement);
          }
        });
      }
    }
    renderedPacksRef.current = customEmojiPacks;

    // An input updates the parent value synchronously. That echo is already
    // represented by the browser-owned contentEditable DOM, so replacing its
    // innerHTML would discard the active range and can reset scrolling.
    if (lastMarkupRef.current === value) return;

    if (element.innerHTML !== nextHtml) {
      element.innerHTML = nextHtml;
    }
    lastMarkupRef.current = value;
    if (pendingExternalHistorySelectionResetRef.current) {
      pendingExternalHistorySelectionResetRef.current = false;
      window.setTimeout(() => {
        collapseSelectionToPreviewEnd();
        setToolbar(null);
      }, 0);
    }
  }, [
    collapseSelectionToPreviewEnd,
    customEmojiPacks,
    formattedHtml,
    previewLabels,
    value,
  ]);

  useTelegramCustomEmojiLottie(contentRef, value, customEmojiPacks);

  const applyMarkup = useCallback(
    (
      nextValue: string,
      options?: { recordHistory?: boolean; clearRedo?: boolean },
    ) => {
      if (nextValue === lastMarkupRef.current) return;
      if (options?.recordHistory !== false) {
        undoStackRef.current.push(lastMarkupRef.current);
      }
      if (options?.clearRedo !== false) {
        redoStackRef.current = [];
      }
      lastMarkupRef.current = nextValue;
      onChange(nextValue);
    },
    [onChange],
  );

  const emitChange = useCallback(() => {
    const element = contentRef.current;
    if (!element) return;
    const nextValue = editorHtmlToTelegramMarkup(element.innerHTML);
    if (usesExternalHistory) {
      if (nextValue === lastMarkupRef.current) return;
      lastMarkupRef.current = nextValue;
      onChange(nextValue);
      return;
    }
    applyMarkup(nextValue);
  }, [applyMarkup, onChange, usesExternalHistory]);
  const tableEditor = useTelegramTableCellEditor(contentRef, emitChange);

  const refreshToolbar = useCallback(() => {
    const selection = window.getSelection();
    const element = contentRef.current;
    if (!selection || !selection.rangeCount || !element) {
      setToolbar(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (
      selection.isCollapsed ||
      !element.contains(range.commonAncestorContainer)
    ) {
      setToolbar(null);
      return;
    }
    savedRangeRef.current = range.cloneRange();
    const rect = range.getBoundingClientRect();
    setToolbar({
      top: Math.max(rect.top - 44, 12),
      left: rect.left + rect.width / 2,
    });
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      refreshToolbar();
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [refreshToolbar]);

  const restoreSelection = useCallback(() => {
    const selection = window.getSelection();
    const range = savedRangeRef.current;
    if (!selection || !range) return null;
    selection.removeAllRanges();
    selection.addRange(range);
    return range;
  }, []);

  const restoreMarkupInDom = useCallback(
    (nextValue: string) => {
      const element = contentRef.current;
      if (!element) return;
      element.innerHTML = previewHtml(
        nextValue,
        customEmojiPacks,
        previewLabels,
      );
      collapseSelectionToPreviewEnd();
    },
    [collapseSelectionToPreviewEnd, customEmojiPacks, previewLabels],
  );

  const undo = useCallback(() => {
    if (usesExternalHistory) {
      pendingExternalHistorySelectionResetRef.current = true;
      onUndo?.();
      setToolbar(null);
      return;
    }
    const previous = undoStackRef.current.pop();
    if (previous == null) {
      onUndo?.();
      collapseSelectionToPreviewEnd();
      setToolbar(null);
      return;
    }
    redoStackRef.current.push(lastMarkupRef.current);
    lastMarkupRef.current = previous;
    restoreMarkupInDom(previous);
    onChange(previous);
    setToolbar(null);
  }, [
    collapseSelectionToPreviewEnd,
    onChange,
    onUndo,
    restoreMarkupInDom,
    usesExternalHistory,
  ]);

  const redo = useCallback(() => {
    if (usesExternalHistory) {
      pendingExternalHistorySelectionResetRef.current = true;
      onRedo?.();
      setToolbar(null);
      return;
    }
    const next = redoStackRef.current.pop();
    if (next == null) {
      onRedo?.();
      collapseSelectionToPreviewEnd();
      setToolbar(null);
      return;
    }
    undoStackRef.current.push(lastMarkupRef.current);
    lastMarkupRef.current = next;
    restoreMarkupInDom(next);
    onChange(next);
    setToolbar(null);
  }, [
    collapseSelectionToPreviewEnd,
    onChange,
    onRedo,
    restoreMarkupInDom,
    usesExternalHistory,
  ]);

  useEffect(() => {
    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (
        !isSelectionInsidePreview() &&
        document.activeElement !== contentRef.current
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (key === "y") {
        event.preventDefault();
        redo();
      }
    };

    document.addEventListener("keydown", handleDocumentKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown, true);
    };
  }, [isSelectionInsidePreview, redo, undo]);

  const wrapSelection = useCallback(
    (tag: "strong" | "em" | "u" | "s" | "code" | "blockquote") => {
      const range = restoreSelection();
      if (!range) return;
      const selectedText = range.toString();
      if (!selectedText.trim()) return;

      const wrapper = document.createElement(tag);
      if (tag === "blockquote") {
        wrapper.textContent = selectedText;
      } else {
        wrapper.textContent = selectedText;
      }

      range.deleteContents();
      range.insertNode(wrapper);

      const selection = window.getSelection();
      if (selection) {
        const nextRange = document.createRange();
        nextRange.selectNodeContents(wrapper);
        selection.removeAllRanges();
        selection.addRange(nextRange);
        savedRangeRef.current = nextRange.cloneRange();
      }
      emitChange();
      refreshToolbar();
    },
    [emitChange, refreshToolbar, restoreSelection],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (key === "y") {
        event.preventDefault();
        redo();
      }
    },
    [redo, undo],
  );

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const handleNativeBeforeInput = (event: InputEvent) => {
      if (event.inputType === "historyUndo") {
        event.preventDefault();
        undo();
        return;
      }
      if (event.inputType === "historyRedo") {
        event.preventDefault();
        redo();
      }
    };

    element.addEventListener("beforeinput", handleNativeBeforeInput);
    return () => {
      element.removeEventListener("beforeinput", handleNativeBeforeInput);
    };
  }, [redo, undo]);

  return (
    <>
      {toolbar && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-[320] flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-[#324557] bg-[#0e1621]/95 p-1 shadow-2xl backdrop-blur"
              style={{ top: toolbar.top, left: toolbar.left }}
              onMouseDown={(event) => event.preventDefault()}
            >
              <PreviewFormatButton
                label={t("telegram.posts.editorComponents.format.bold")}
                icon={Bold}
                onClick={() => wrapSelection("strong")}
              />
              <PreviewFormatButton
                label={t("telegram.posts.editorComponents.format.italic")}
                icon={Italic}
                onClick={() => wrapSelection("em")}
              />
              <PreviewFormatButton
                label={t("telegram.posts.editorComponents.format.underline")}
                icon={Underline}
                onClick={() => wrapSelection("u")}
              />
              <PreviewFormatButton
                label={t(
                  "telegram.posts.editorComponents.format.strikethrough",
                )}
                icon={Strikethrough}
                onClick={() => wrapSelection("s")}
              />
              <PreviewFormatButton
                label={t("telegram.posts.editorComponents.format.inlineCode")}
                icon={Code}
                onClick={() => wrapSelection("code")}
              />
              <PreviewFormatButton
                label={t("telegram.posts.editorComponents.format.quote")}
                icon={Quote}
                onClick={() => wrapSelection("blockquote")}
              />
            </div>,
            document.body,
          )
        : null}
      {tableEditor.overlay}
      <div
        ref={contentRef}
        contentEditable
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        tabIndex={0}
        suppressContentEditableWarning
        className="telegram-preview-text whitespace-pre-wrap break-words text-[14px] leading-[1.3] text-[#f5f5f5] outline-none"
        onClick={(event) => {
          handlePreviewContentClick(event);
          tableEditor.handleClick(event);
        }}
        onContextMenu={tableEditor.handleContextMenu}
        onInput={emitChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          window.setTimeout(() => refreshToolbar(), 0);
        }}
        onBlur={() => {
          emitChange();
          window.setTimeout(() => refreshToolbar(), 0);
        }}
        onMouseUp={() => {
          window.setTimeout(() => refreshToolbar(), 0);
        }}
      />
    </>
  );
}

function PreviewFormatButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof Bold;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#9fb0c0] transition hover:bg-[#1d3144] hover:text-white"
    >
      <Icon size={15} />
    </button>
  );
}
