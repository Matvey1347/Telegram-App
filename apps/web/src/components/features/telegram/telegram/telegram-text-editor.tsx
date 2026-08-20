"use client";

import { X } from "lucide-react";
import {
  forwardRef,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  authApi,
  telegramChannelsApi,
  type TelegramManagedPost,
  type TelegramManagedPostLinkTarget,
} from "@/lib/api";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { TelegramInlineKeyboardEditor, TelegramInlineKeyboardSummary } from "./telegram-inline-keyboard-editor";
import { TelegramCustomEmojiPickerModal } from "./telegram-custom-emoji-picker-modal";
import { telegramChannelKeys } from "@/lib/query-keys";
import { authKeys } from "@/lib/query-keys";
import { customEmojiToken } from "./telegram-custom-emoji";
import type { TelegramCustomEmojiPackSummary } from "@telegram-system/shared";
import type { TelegramPostButtonRows } from "@telegram-system/shared";
import { TelegramTextEditorShortcutsModal } from "./telegram-text-editor-shortcuts-modal";
import { editorCommandDetails, effectiveEditorShortcuts, shortcutFromEvent } from "./telegram-text-editor-shortcuts";
import type { EditorCommandId } from "@telegram-system/shared";
import { editorWrapActions } from "./telegram-text-editor-commands";
import { TelegramTextEditorToolbar } from "./telegram-text-editor-toolbar";

type TelegramTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  rows?: number;
  channelId?: string;
  currentPostId?: string | null;
  enableInternalPostLinks?: boolean;
  internalLinkUsage?: "edit" | "publishNow" | "schedule";
  internalLinkScheduledAt?: string;
  highlightInternalLinkTargetId?: string | null;
  highlightRequestKey?: number;
  availableInternalPosts?: TelegramManagedPost[];
  buttonRows?: TelegramPostButtonRows;
  onButtonRowsChange?: (rows: TelegramPostButtonRows) => void;
  canPublishInlineButtons?: boolean;
  onCheckInlineButtonPublishingAccess?: () => Promise<boolean>;
  /** Enables channel-scoped custom emoji loading only after the picker opens. */
  enableCustomEmoji?: boolean;
  customEmojiPacks?: TelegramCustomEmojiPackSummary[];
  onManageCustomEmojiPacks?: () => void;
};

export type TelegramTextEditorHandle = {
  undo: () => void;
  redo: () => void;
  commitExternalChange: (nextValue: string) => void;
};

type EditorSnapshot = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

export const TelegramTextEditor = forwardRef<TelegramTextEditorHandle, TelegramTextEditorProps>(function TelegramTextEditor({
  value,
  onChange,
  disabled,
  rows = 12,
  channelId,
  currentPostId,
  enableInternalPostLinks = false,
  internalLinkUsage = "publishNow",
  internalLinkScheduledAt,
  highlightInternalLinkTargetId,
  highlightRequestKey = 0,
  availableInternalPosts,
  buttonRows = [],
  onButtonRowsChange,
  canPublishInlineButtons = true,
  onCheckInlineButtonPublishingAccess,
  enableCustomEmoji = false,
  customEmojiPacks,
  onManageCustomEmojiPacks,
}, ref) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightedSelectionRef = useRef<{
    start: number;
    end: number;
    requestKey: number;
  } | null>(null);
  const handledHighlightRequestKeyRef = useRef(0);
  const linkSelectionRef = useRef({ start: 0, end: 0 });
  const undoStackRef = useRef<EditorSnapshot[]>([]);
  const redoStackRef = useRef<EditorSnapshot[]>([]);
  const lastKnownValueRef = useRef(value);
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [buttonsEditorOpen, setButtonsEditorOpen] = useState(false);
  const [customEmojiPickerOpen, setCustomEmojiPickerOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pullQuoteAuthorOpen, setPullQuoteAuthorOpen] = useState(false);
  const [pullQuoteAuthor, setPullQuoteAuthor] = useState("");
  const [linkUrl, setLinkUrl] = useState("https://");
  const [linkError, setLinkError] = useState("");
  const [linkMode, setLinkMode] = useState<"external" | "internal">(
    enableInternalPostLinks && channelId ? "internal" : "external",
  );
  const [internalSearch, setInternalSearch] = useState("");
  const internalLinksEnabled = enableInternalPostLinks && Boolean(channelId);
  const customEmojiEnabled = enableCustomEmoji && Boolean(channelId);
  const meQuery = useQuery({ queryKey: authKeys.me(), queryFn: authApi.me });
  const shortcuts = effectiveEditorShortcuts(meQuery.data?.user.editorShortcuts);
  const customEmojiPacksQuery = useQuery({
    queryKey: telegramChannelKeys.customEmojiPacks(channelId!),
    queryFn: () => telegramChannelsApi.customEmojiPacks(channelId!),
    enabled: customEmojiEnabled && customEmojiPickerOpen && !customEmojiPacks,
  });
  const effectiveCustomEmojiPacks = customEmojiPacks ?? customEmojiPacksQuery.data?.packs ?? [];
  const localLinkTargets = useCallback((): TelegramManagedPostLinkTarget[] => {
    if (!availableInternalPosts?.length || !channelId) return [];
    const normalizedSearch = internalSearch.trim().toLowerCase();
    return availableInternalPosts
      .filter((post) => post.telegramChannelId === channelId)
      .filter((post) => post.id !== currentPostId)
      .filter((post) =>
        normalizedSearch
          ? post.title.toLowerCase().includes(normalizedSearch)
          : true,
      )
      .sort((left, right) => {
        const updated = right.updatedAt.localeCompare(left.updatedAt);
        return updated || left.title.localeCompare(right.title);
      })
      .slice(0, 30)
      .map((post) => ({
        id: post.id,
        title: post.title,
        icon: post.icon ?? null,
        status: post.status,
        telegramRemoteStatus: post.telegramRemoteStatus,
        groupId: post.groupId ?? null,
        groupTitle: post.group?.title ?? null,
        telegramChannelId: post.telegramChannelId,
        telegramChannelTitle: "",
        publishedAt: post.publishedAt ?? null,
        primaryTelegramMessageUrl: post.telegramMessageUrls[0] ?? null,
      }));
  }, [availableInternalPosts, channelId, currentPostId, internalSearch]);
  const linkTargets = useQuery({
    queryKey: [
      "telegram-managed-post-link-targets",
      channelId,
      internalSearch,
      currentPostId,
      internalLinkUsage,
      internalLinkScheduledAt,
    ],
    queryFn: () =>
      telegramChannelsApi.managedPostLinkTargets(channelId!, {
        search: internalSearch.trim() || undefined,
        excludePostId: currentPostId || undefined,
        usage: internalLinkUsage,
        scheduledAt: internalLinkScheduledAt,
        limit: 30,
      }),
    enabled:
      !availableInternalPosts &&
      linkEditorOpen &&
      linkMode === "internal" &&
      internalLinksEnabled,
  });
  const effectiveLinkTargets = availableInternalPosts
    ? localLinkTargets()
    : (linkTargets.data || []);
  const scrollTextareaToSelection = useCallback(
    (textarea: HTMLTextAreaElement, start: number, selectionText: string) => {
      const style = window.getComputedStyle(textarea);
      const mirror = document.createElement("div");
      const marker = document.createElement("span");
      mirror.setAttribute("aria-hidden", "true");
      mirror.style.position = "absolute";
      mirror.style.visibility = "hidden";
      mirror.style.pointerEvents = "none";
      mirror.style.whiteSpace = "pre-wrap";
      mirror.style.wordBreak = "break-word";
      mirror.style.overflowWrap = "anywhere";
      mirror.style.boxSizing = style.boxSizing;
      mirror.style.width = `${textarea.clientWidth}px`;
      mirror.style.padding = style.padding;
      mirror.style.border = style.border;
      mirror.style.font = style.font;
      mirror.style.fontFamily = style.fontFamily;
      mirror.style.fontSize = style.fontSize;
      mirror.style.fontWeight = style.fontWeight;
      mirror.style.fontStyle = style.fontStyle;
      mirror.style.letterSpacing = style.letterSpacing;
      mirror.style.lineHeight = style.lineHeight;
      mirror.style.textTransform = style.textTransform;
      mirror.style.textIndent = style.textIndent;
      mirror.style.tabSize = style.tabSize;
      mirror.style.textRendering = style.textRendering;
      mirror.style.webkitTextSizeAdjust = style.webkitTextSizeAdjust;
      mirror.textContent = value.slice(0, start);
      marker.textContent = selectionText || "\u200b";
      mirror.appendChild(marker);
      document.body.appendChild(mirror);
      const selectionTop = marker.offsetTop;
      const lineHeight = Number.parseFloat(style.lineHeight) || 24;
      textarea.scrollTop = Math.max(
        selectionTop - textarea.clientHeight / 2 + lineHeight * 1.5,
        0,
      );
      document.body.removeChild(mirror);
    },
    [value],
  );

  const focusInternalLinkInText = useCallback((targetId: string, requestKey: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const escapedTargetId = targetId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      String.raw`\[[^\]\n]+\]\(tg-post:${escapedTargetId}\)`,
      "g",
    );
    const match = pattern.exec(value);
    if (!match || match.index == null) return;
    const start = match.index;
    const end = start + match[0].length;
    highlightedSelectionRef.current = { start, end, requestKey };
    scrollTextareaToSelection(textarea, start, match[0]);
    textarea.focus();
    textarea.setSelectionRange(start, end);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start, end);
    });
  }, [scrollTextareaToSelection, value]);

  /* eslint-disable react-hooks/refs -- reset editor history when a parent hydrates a different value */
  if (lastKnownValueRef.current !== value) {
    lastKnownValueRef.current = value;
    undoStackRef.current = [];
    redoStackRef.current = [];
  }
  /* eslint-enable react-hooks/refs */

  useEffect(() => {
    if (!highlightInternalLinkTargetId || !highlightRequestKey) return;
    if (handledHighlightRequestKeyRef.current === highlightRequestKey) return;
    handledHighlightRequestKeyRef.current = highlightRequestKey;
    focusInternalLinkInText(
      highlightInternalLinkTargetId,
      highlightRequestKey,
    );
  }, [focusInternalLinkInText, highlightInternalLinkTargetId, highlightRequestKey]);

  const currentSnapshot = (): EditorSnapshot => {
    const textarea = textareaRef.current;
    return {
      value,
      selectionStart: textarea?.selectionStart ?? value.length,
      selectionEnd: textarea?.selectionEnd ?? value.length,
    };
  };

  const restoreSelection = (start: number, end = start) => {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(start, end);
    });
  };

  const commitValue = (
    nextValue: string,
    nextSelectionStart?: number,
    nextSelectionEnd = nextSelectionStart,
  ) => {
    if (nextValue === value) return;
    undoStackRef.current.push(currentSnapshot());
    redoStackRef.current = [];
    lastKnownValueRef.current = nextValue;
    onChange(nextValue);
    if (nextSelectionStart !== undefined) {
      restoreSelection(nextSelectionStart, nextSelectionEnd);
    }
  };

  const undo = () => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current.push(currentSnapshot());
    lastKnownValueRef.current = previous.value;
    onChange(previous.value);
    restoreSelection(previous.selectionStart, previous.selectionEnd);
  };

  const redo = () => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(currentSnapshot());
    lastKnownValueRef.current = next.value;
    onChange(next.value);
    restoreSelection(next.selectionStart, next.selectionEnd);
  };

  const commitExternalChange = useCallback(
    (nextValue: string) => {
      if (nextValue === value) return;
      undoStackRef.current.push(currentSnapshot());
      redoStackRef.current = [];
      lastKnownValueRef.current = nextValue;
      onChange(nextValue);
    },
    [onChange, value],
  );

  useImperativeHandle(
    ref,
    () => ({
      undo,
      redo,
      commitExternalChange,
    }),
    [commitExternalChange, redo, undo],
  );

  const replaceSelection = (
    before: string,
    after: string,
    placeholder: string,
  ) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = value.slice(start, end);
    const content = selection || placeholder;
    const selectionIsWrapped =
      selection.startsWith(before) && selection.endsWith(after) && selection.length >= before.length + after.length;
    if (selectionIsWrapped) {
      const unwrapped = selection.slice(before.length, selection.length - after.length);
      commitValue(`${value.slice(0, start)}${unwrapped}${value.slice(end)}`, start, start + unwrapped.length);
      return;
    }
    const isWrapped =
      start >= before.length &&
      value.slice(start - before.length, start) === before &&
      value.slice(end, end + after.length) === after;
    if (isWrapped) {
      const nextValue = `${value.slice(0, start - before.length)}${content}${value.slice(end + after.length)}`;
      const selectionStart = start - before.length;
      commitValue(nextValue, selectionStart, selectionStart + content.length);
      return;
    }
    const nextValue = `${value.slice(0, start)}${before}${content}${after}${value.slice(end)}`;
    const selectionStart = start + before.length;
    commitValue(nextValue, selectionStart, selectionStart + content.length);
  };

  const prefixLines = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const nextLine = value.indexOf("\n", end);
    const lineEnd = nextLine === -1 ? value.length : nextLine;
    const selectedLines = value.slice(lineStart, lineEnd) || "Quote";
    const lines = selectedLines.split("\n");
    const allPrefixed = lines.every((line) => line.startsWith(prefix));
    const replacement = lines
      .map((line) => (allPrefixed ? line.slice(prefix.length) : `${prefix}${line}`))
      .join("\n");
    commitValue(
      `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`,
      lineStart,
      lineStart + replacement.length,
    );
  };

  const insertRichBlock = (before: string, placeholder: string, after = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
    if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
      const unwrapped = selected.slice(before.length, selected.length - after.length);
      commitValue(`${value.slice(0, start)}${unwrapped}${value.slice(end)}`, start, start + unwrapped.length);
      return;
    }
    const block = `${before}${selected}${after}`;
    const needsLeadingBreak = start > 0 && !value.slice(0, start).endsWith("\n\n");
    const needsTrailingBreak = end < value.length && !value.slice(end).startsWith("\n\n");
    const insertion = `${needsLeadingBreak ? "\n\n" : ""}${block}${needsTrailingBreak ? "\n\n" : ""}`;
    commitValue(`${value.slice(0, start)}${insertion}${value.slice(end)}`, start + (needsLeadingBreak ? 2 : 0), start + (needsLeadingBreak ? 2 : 0) + block.length);
  };

  const insertLink = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    linkSelectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
    setLinkUrl("https://");
    setLinkMode(internalLinksEnabled ? "internal" : "external");
    setInternalSearch("");
    setLinkError("");
    setLinkEditorOpen(true);
  };

  const insertCustomEmoji = (emoji: TelegramCustomEmojiPackSummary["emojis"][number]) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const token = customEmojiToken(emoji);
    commitValue(`${value.slice(0, start)}${token}${value.slice(end)}`, start + token.length);
    setCustomEmojiPickerOpen(false);
  };

  const applyInternalLink = (target: TelegramManagedPostLinkTarget) => {
    const { start, end } = linkSelectionRef.current;
    const selected = value.slice(start, end) || target.title;
    const markup = `[${selected}](tg-post:${target.id})`;
    commitValue(
      `${value.slice(0, start)}${markup}${value.slice(end)}`,
      start,
      start + markup.length,
    );
    setLinkEditorOpen(false);
    setLinkError("");
  };

  const applyLink = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { start, end } = linkSelectionRef.current;
    const selected = value.slice(start, end) || "link text";
    let normalizedHref: string;
    try {
      const url = new URL(linkUrl.trim());
      if (
        !["http:", "https:"].includes(url.protocol) ||
        !url.hostname.includes(".")
      ) {
        throw new Error("Invalid URL");
      }
      normalizedHref = url.toString();
    } catch {
      setLinkError("Enter a full URL, for example: https://example.com");
      return;
    }
    const markup = `[${selected}](${normalizedHref})`;
    commitValue(
      `${value.slice(0, start)}${markup}${value.slice(end)}`,
      start,
      start + markup.length,
    );
    setLinkEditorOpen(false);
    setLinkError("");
  };

  const executeCommand = (command: EditorCommandId) => {
    const action = editorWrapActions.find((candidate) => candidate.id === command);
    if (action) {
      replaceSelection(action.before, action.after, action.placeholder);
      return;
    }
    if (command === "codeBlock") replaceSelection("```\n", "\n```", "code block");
    else if (command === "quote") prefixLines("> ");
    else if (command === "pullQuote") insertRichBlock(":::pullquote\n", "Pull quote", "\n:::");
    else if (command === "heading") prefixLines("# ");
    else if (command === "bulletedList") prefixLines("- ");
    else if (command === "numberedList") prefixLines("1. ");
    else if (command === "table") insertRichBlock(":::table header\n| ", "Header 1 | Header 2", " |\n| Cell 1 | Cell 2 |\n:::");
    else if (command === "formula") replaceSelection("$$", "$$", "formula");
    else if (command === "link") insertLink();
    else if (command === "emoji") setCustomEmojiPickerOpen(true);
    else if (command === "buttons") setButtonsEditorOpen(true);
  };

  const applyHeading = (level: number) => prefixLines(`${"#".repeat(level)} `);

  const applyPullQuoteWithAuthor = () => {
    const author = pullQuoteAuthor.trim().replaceAll('"', "'");
    insertRichBlock(
      `:::pullquote${author ? ` credit="${author}"` : ""}\n`,
      "Pull quote",
      "\n:::",
    );
    setPullQuoteAuthorOpen(false);
    setPullQuoteAuthor("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (key === "y") {
      event.preventDefault();
      redo();
    } else {
      const shortcut = shortcutFromEvent(event.nativeEvent);
      const command = editorCommandDetails.find((candidate) => shortcuts[candidate.id] === shortcut);
      if (command) {
        event.preventDefault();
        executeCommand(command.id);
      }
    }
  };

  return (
    <div className="relative overflow-visible rounded-lg border border-neutral-700 bg-neutral-900 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
      <TelegramTextEditorToolbar disabled={disabled} hasButtons={Boolean(onButtonRowsChange)} onCommand={executeCommand} onHeading={applyHeading} onPullQuoteWithAuthor={() => { setPullQuoteAuthor(""); setPullQuoteAuthorOpen(true); }} onConfigure={() => setShortcutsOpen(true)} />
      {onButtonRowsChange ? <TelegramInlineKeyboardEditor buttonRows={buttonRows} onChange={onButtonRowsChange} disabled={disabled} open={buttonsEditorOpen} onOpenChange={setButtonsEditorOpen} canPublishInlineButtons={canPublishInlineButtons} onCheckPublishingAccess={onCheckInlineButtonPublishingAccess} /> : null}
      <TelegramCustomEmojiPickerModal
        open={customEmojiPickerOpen}
        onClose={() => setCustomEmojiPickerOpen(false)}
        packs={effectiveCustomEmojiPacks}
        onSelect={insertCustomEmoji}
        onSelectStandard={(emoji) => {
          const textarea = textareaRef.current;
          if (!textarea) return;
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          commitValue(`${value.slice(0, start)}${emoji}${value.slice(end)}`, start + emoji.length);
          setCustomEmojiPickerOpen(false);
        }}
        onManage={onManageCustomEmojiPacks}
      />
      <TelegramTextEditorShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      {pullQuoteAuthorOpen ? <div className="absolute left-2 right-2 top-12 z-30 rounded-lg border border-neutral-700 bg-neutral-950 p-3 shadow-2xl"><p className="text-sm font-medium text-white">Pull quote with author</p><p className="mt-1 text-xs text-neutral-400">Telegram publishes the author as the pull quote credit.</p><div className="mt-3 flex gap-2"><input autoFocus value={pullQuoteAuthor} onChange={(event) => setPullQuoteAuthor(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyPullQuoteWithAuthor(); if (event.key === "Escape") setPullQuoteAuthorOpen(false); }} placeholder="Author name" className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-500" /><button type="button" onClick={applyPullQuoteWithAuthor} className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500">Insert</button></div></div> : null}
      {linkEditorOpen ? (
        <div className="absolute left-2 right-2 top-12 z-30 rounded-lg border border-neutral-700 bg-neutral-950 p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-white">Insert link</p>
            <button
              type="button"
              onClick={() => setLinkEditorOpen(false)}
              className="rounded-md p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              aria-label="Close link editor"
            >
              <X size={15} />
            </button>
          </div>
          {internalLinksEnabled ? (
            <div className="mb-3 flex rounded-md bg-neutral-900 p-1 text-xs">
              <button
                type="button"
                onClick={() => setLinkMode("external")}
                className={`flex-1 rounded px-3 py-1.5 ${
                  linkMode === "external"
                    ? "bg-blue-600 text-white"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                External URL
              </button>
              <button
                type="button"
                onClick={() => setLinkMode("internal")}
                className={`flex-1 rounded px-3 py-1.5 ${
                  linkMode === "internal"
                    ? "bg-blue-600 text-white"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Internal post
              </button>
            </div>
          ) : null}
          {linkMode === "external" ? (
            <>
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="url"
                  value={linkUrl}
                  onChange={(event) => {
                    setLinkUrl(event.target.value);
                    setLinkError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      applyLink();
                    }
                    if (event.key === "Escape") setLinkEditorOpen(false);
                  }}
                  placeholder="https://example.com"
                  className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={applyLink}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                >
                  Add
                </button>
              </div>
              {linkError ? (
                <p className="mt-2 text-xs text-red-400">{linkError}</p>
              ) : null}
            </>
          ) : (
            <div>
              <input
                autoFocus
                type="search"
                value={internalSearch}
                onChange={(event) => setInternalSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setLinkEditorOpen(false);
                }}
                placeholder="Search managed posts by title…"
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              />
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                {!availableInternalPosts && linkTargets.isLoading ? (
                  <p className="px-2 py-3 text-xs text-neutral-400">
                    Loading posts…
                  </p>
                ) : null}
                {!availableInternalPosts && linkTargets.isError ? (
                  <p className="px-2 py-3 text-xs text-red-400">
                    Could not load managed posts.
                  </p>
                ) : null}
                {effectiveLinkTargets.map((target) => (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => applyInternalLink(target)}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-neutral-800"
                  >
                    {target.iconPresentation ? (
                      <IconAvatar
                        icon={target.iconPresentation}
                        label={target.title}
                        size="xs"
                        bordered={false}
                        className="!bg-transparent"
                      />
                    ) : (
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs"
                        aria-hidden="true"
                      >
                        {target.status === "PUBLISHED"
                          ? "✅"
                          : target.status === "SCHEDULED"
                            ? "🕒"
                            : target.status === "FAILED"
                              ? "⚠️"
                              : "📝"}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm text-white">
                      {target.title}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                        target.status === "PUBLISHED"
                          ? "bg-emerald-950 text-emerald-300"
                          : "bg-amber-950 text-amber-300"
                      }`}
                      title={
                        target.status === "PUBLISHED"
                          ? "Ready to link"
                          : "Publishing this post will fail until the target is published"
                      }
                    >
                      {target.status}
                    </span>
                  </button>
                ))}
                {(!availableInternalPosts && !linkTargets.isLoading && !effectiveLinkTargets.length) ||
                (availableInternalPosts && !effectiveLinkTargets.length) ? (
                  <p className="px-2 py-3 text-xs text-neutral-500">
                    No matching posts.
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}
      <textarea
        ref={textareaRef}
        rows={rows}
        value={value}
        disabled={disabled}
        onMouseDown={() => {
          highlightedSelectionRef.current = null;
        }}
        onChange={(event) => commitValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Write your Telegram post…"
        className="block w-full resize-y bg-transparent px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-neutral-500 disabled:opacity-50"
      />
      {onButtonRowsChange ? <TelegramInlineKeyboardSummary rows={buttonRows} disabled={disabled} onEdit={() => setButtonsEditorOpen(true)} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-800 px-3 py-1.5 text-[11px] text-neutral-500">
        <span>{value.length} characters</span>
      </div>
    </div>
  );
});
