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
  type MouseEvent,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Eye, MessageCircle } from "lucide-react";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { editorHtmlToTelegramMarkup } from "./telegram-text-editor-format";
import { TelegramInlineKeyboardPreview } from "./telegram-inline-keyboard-preview";
import type { TelegramPostButtonRows } from "@telegram-system/shared";
import type { TelegramCustomEmojiPackSummary } from "@telegram-system/shared";
import { parseTelegramTableCellMarkup } from "@telegram-system/shared/telegram-table-markup";
import { useTelegramTableCellEditor } from "./telegram-table-cell-editor";

type TelegramPostPreviewProps = {
  channelTitle: string;
  channelPhotoUrl?: string | null;
  text: string;
  formattedHtml?: string | null;
  imageUrls: string[];
  onTextChange?: ((value: string) => void) | null;
  onUndo?: (() => void) | null;
  onRedo?: (() => void) | null;
  longTextMode?: "IMAGES_THEN_TEXT" | "CAPTION_THEN_TEXT";
  captionLengthMax?: number;
  messageLengthMax?: number;
  buttonRows?: TelegramPostButtonRows;
  customEmojiPacks?: TelegramCustomEmojiPackSummary[];
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function renderFencedCodeBlock(info: string, lineBreak: string, code: string) {
  const normalizedInfo = info.replace(/\r/g, "");
  const normalizedLineBreak = lineBreak.replace(/\r/g, "\n");
  const normalizedCode = code.replace(/\r/g, "");
  const hasLabel = normalizedInfo.trim().length > 0;
  const label = hasLabel ? normalizedInfo : "copy";
  const content = hasLabel
    ? normalizedCode
    : normalizedInfo
      ? `${normalizedInfo}${normalizedLineBreak}${normalizedCode}`
      : normalizedCode;
  return `<pre class="tg-code-block" data-code-label="${escapeHtml(label)}" data-has-code-label="${hasLabel ? "true" : "false"}"><span class="tg-code-header" contenteditable="false"><span>${escapeHtml(label)}</span><button type="button" data-copy-code aria-label="Copy code" contenteditable="false"><svg class="tg-copy-icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="6.5" y="2.5" width="10" height="12" rx="1.8"></rect><rect x="3.5" y="5.5" width="10" height="12" rx="1.8"></rect></svg></button></span><code>${escapeHtml(content)}</code></pre>`;
}

function renderRichBlocks(
  raw: string,
  token: (html: string, display?: "inline" | "block") => string,
) {
  let value = raw.replace(
    /^:::(quote|pullquote|table)(?:[ \t]+([^\n]*))?\n([\s\S]*?)\n:::/gm,
    (_match, kind: string, options: string, body: string) => {
      if (kind === "table") {
        const hasHeader = /\bheader\b/.test(options || "");
        const rows = body
          .split("\n")
          .filter(Boolean)
          .map((line, rowIndex) =>
            line
              .replace(/^\||\|$/g, "")
              .split("|")
              .map((source) => {
                const cell = parseTelegramTableCellMarkup(source.trim());
                const highlighted =
                  cell.highlight ?? (hasHeader && rowIndex === 0);
                const tag = highlighted ? "th" : "td";
                const classes = highlighted
                  ? ' class="tg-rich-table-cell-highlight"'
                  : "";
                const align = cell.align || "left";
                return `<${tag}${classes} data-highlight="${highlighted}" data-align="${align}" style="text-align:${align}">${escapeHtml(cell.text)}</${tag}>`;
              })
              .join(""),
          );
        return token(
          `<table class="tg-rich-table"><tbody>${rows.map((row) => `<tr>${row}</tr>`).join("")}</tbody></table>`,
          "block",
        );
      }
      const credit = options?.match(/credit="([^"]+)"/)?.[1];
      const attribution = credit ? `<cite>${escapeHtml(credit)}</cite>` : "";
      return token(
        kind === "pullquote"
          ? `<aside class="tg-pull-quote">${escapeHtml(body).replace(/\n/g, "<br>")}${attribution}</aside>`
          : `<blockquote class="tg-rich-quote">${escapeHtml(body).replace(/\n/g, "<br>")}${attribution}</blockquote>`,
        "block",
      );
    },
  );
  value = value.replace(
    /^(#{1,6})\s+(.+)$/gm,
    (_match, marks: string, text: string) =>
      token(
        `<h${marks.length} class="tg-rich-heading">${escapeHtml(text)}</h${marks.length}>`,
        "block",
      ),
  );
  value = value.replace(
    /(?:^|\n)((?:[-*]\s+.+(?:\n|$))+)/g,
    (_match, items: string) =>
      token(
        `<ul class="tg-rich-list" style="list-style-type:disc">${items
          .trim()
          .split("\n")
          .map((item) => `<li>${escapeHtml(item.replace(/^[-*]\s+/, ""))}</li>`)
          .join("")}</ul>`,
        "block",
      ),
  );
  value = value.replace(
    /(?:^|\n)((?:\d+\.\s+.+(?:\n|$))+)/g,
    (_match, items: string) =>
      token(
        `<ol class="tg-rich-list" style="list-style-type:decimal">${items
          .trim()
          .split("\n")
          .map(
            (item) => `<li>${escapeHtml(item.replace(/^\d+\.\s+/, ""))}</li>`,
          )
          .join("")}</ol>`,
        "block",
      ),
  );
  return value;
}

function previewHtml(
  raw: string,
  customEmojiPacks: TelegramCustomEmojiPackSummary[] = [],
) {
  const tokens: Array<{ html: string; display: "inline" | "block" }> = [];
  const token = (html: string, display: "inline" | "block" = "inline") => {
    const index = tokens.push({ html, display }) - 1;
    return `\u0000${index}\u0000`;
  };
  const customEmojiById = new Map(
    customEmojiPacks.flatMap((pack) =>
      pack.emojis.map((emoji) => [emoji.documentId, emoji] as const),
    ),
  );
  const customEmojiInlineStyle =
    "display:inline-block;width:1em;height:1em;max-width:1em;max-height:1em;vertical-align:-0.1em;object-fit:contain";
  let value = renderRichBlocks(raw, token).replace(
    /!\[([^\]\n]*)\]\(tg:\/\/emoji\?id=([0-9]+)\)/g,
    (_match, alt: string, documentId: string) => {
      const emoji = customEmojiById.get(documentId);
      const label = escapeHtml(alt);
      const media = emoji?.assetUrl
        ? emoji.kind === "VIDEO"
          ? `<video src="${escapeHtml(emoji.assetUrl)}" style="${customEmojiInlineStyle}" autoplay loop muted playsinline aria-label="${label}"></video>`
          : emoji.kind === "STATIC"
            ? `<img src="${escapeHtml(emoji.assetUrl)}" style="${customEmojiInlineStyle}" alt="${label}">`
            : emoji.renderAssetUrl
              ? `<span class="tg-custom-emoji-lottie" style="${customEmojiInlineStyle}" data-lottie-url="${escapeHtml(emoji.renderAssetUrl)}" aria-label="${label}">${label}</span>`
              : label
        : label;
      return token(
        `<span class="tg-custom-emoji" data-telegram-custom-emoji-id="${escapeHtml(documentId)}" data-alt="${label}" contenteditable="false">${media}</span>`,
      );
    },
  );
  value = value.replace(
    /```([^\n\r\u2028\u2029`]*)((?:\r\n|[\n\r\u2028\u2029])?)([\s\S]*?)```/g,
    (_match, info: string, lineBreak: string, code: string) => {
      return token(renderFencedCodeBlock(info, lineBreak, code), "block");
    },
  );
  value = value.replace(/`([^`\n]+)`/g, (_match, code: string) =>
    token(`<code>${escapeHtml(code)}</code>`),
  );
  value = value.replace(
    /\[([^\]\n]+)\]\(tg-post:([a-zA-Z0-9_-]+)\)/g,
    (_match, label: string, postId: string) =>
      token(
        `<a href="tg-post:${escapeHtml(postId)}" data-internal-post-link="${escapeHtml(postId)}" data-internal-post-id="${escapeHtml(postId)}" title="Internal post link">${escapeHtml(label)}</a>`,
      ),
  );
  value = value.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s<>()]+)\)/gi,
    (_match, label: string, href: string) => {
      try {
        const url = new URL(href);
        if (!url.hostname.includes(".")) return _match;
        return token(
          `<a href="${escapeHtml(url.toString())}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`,
        );
      } catch {
        return _match;
      }
    },
  );
  value = value.replace(/https?:\/\/[^\s<>()\u0000]+/gi, (href: string) => {
    try {
      const url = new URL(href);
      if (!url.hostname.includes(".")) return href;
      return token(
        `<a href="${escapeHtml(url.toString())}" target="_blank" rel="noreferrer">${escapeHtml(href)}</a>`,
      );
    } catch {
      return href;
    }
  });
  value = escapeHtml(value)
    .replace(/\*\*([^\n]+?)\*\*/g, "<b>$1</b>")
    .replace(/__([^\n]+?)__/g, "<i>$1</i>")
    .replace(/\+\+([^\n]+?)\+\+/g, "<u>$1</u>")
    .replace(/~~([^\n]+?)~~/g, "<s>$1</s>")
    .replace(/\|\|([^\n]+?)\|\|/g, '<span class="tg-spoiler">$1</span>');

  const lines = value.split("\n");
  const rendered: string[] = [];
  let textLines: string[] = [];
  let pendingGapBeforeBlock = 0;
  let quoteType: "regular" | "expandable" | null = null;
  let quoteLines: string[] = [];
  const blockTokenPattern = /^\u0000(\d+)\u0000$/;
  const gaps = (count: number) =>
    '<span class="tg-quote-gap" aria-hidden="true"></span>'.repeat(count);
  const flushText = () => {
    if (!textLines.length) return;
    const linesToRender = [...textLines];
    let leadingEmptyLines = 0;
    while (linesToRender.length && linesToRender[0]?.trim() === "") {
      linesToRender.shift();
      leadingEmptyLines += 1;
    }
    let trailingEmptyLines = 0;
    while (
      linesToRender.length &&
      linesToRender[linesToRender.length - 1]?.trim() === ""
    ) {
      linesToRender.pop();
      trailingEmptyLines += 1;
    }
    if (linesToRender.length) {
      rendered.push(
        `${leadingEmptyLines > 0 && rendered.length ? gaps(leadingEmptyLines) : ""}${linesToRender.join("<br>")}`,
      );
    }
    // A blank-only segment occurs between two rich block tokens (for example,
    // a table followed by a pull quote). It has no text to render, but still
    // represents the intentional visual gap before the next block.
    pendingGapBeforeBlock = linesToRender.length
      ? trailingEmptyLines
      : rendered.length > 0
        ? leadingEmptyLines + trailingEmptyLines
        : 0;
    textLines = [];
  };
  const flush = () => {
    if (!quoteType) return;
    flushText();
    rendered.push(
      `${gaps(pendingGapBeforeBlock)}<blockquote${quoteType === "expandable" ? ' class="expandable"' : ""}>${quoteLines.join("<br>")}</blockquote>`,
    );
    pendingGapBeforeBlock = 0;
    quoteType = null;
    quoteLines = [];
  };
  for (const line of lines) {
    const blockTokenMatch = line.match(blockTokenPattern);
    if (blockTokenMatch) {
      const tokenEntry = tokens[Number(blockTokenMatch[1])];
      if (tokenEntry?.display === "block") {
        flush();
        flushText();
        rendered.push(`${gaps(pendingGapBeforeBlock)}${tokenEntry.html}`);
        pendingGapBeforeBlock = 0;
        continue;
      }
    }
    const expandable = line.match(/^&gt;&gt;\s?(.*)$/);
    const regular = line.match(/^&gt;\s?(.*)$/);
    const nextType = expandable ? "expandable" : regular ? "regular" : null;
    if (!nextType) {
      flush();
      textLines.push(line);
      continue;
    }
    if (quoteType && quoteType !== nextType) flush();
    quoteType = nextType;
    quoteLines.push((expandable || regular)?.[1] || "");
  }
  flush();
  flushText();
  return rendered
    .join("")
    .replace(
      /\u0000(\d+)\u0000/g,
      (_match, index: string) => tokens[Number(index)]?.html || "",
    );
}

/**
 * React Query may briefly expose no data while a channel query is remounted.
 * Keep previously resolved assets for the same mounted preview so editing text
 * cannot turn a Premium emoji into its ordinary ALT fallback.
 */
function useRetainedCustomEmojiPacks(
  packs: TelegramCustomEmojiPackSummary[] | undefined,
) {
  const lastAvailableRef = useRef<TelegramCustomEmojiPackSummary[]>([]);
  useEffect(() => {
    if (packs !== undefined) lastAvailableRef.current = packs;
  }, [packs]);
  return packs ?? lastAvailableRef.current;
}

function useTelegramCustomEmojiLottie(
  rootRef: RefObject<HTMLDivElement | null>,
  text: string,
  customEmojiPacks: TelegramCustomEmojiPackSummary[],
) {
  useEffect(() => {
    const root = rootRef.current;
    if (
      !root ||
      (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent))
    )
      return;

    let active = true;
    const animations: Array<{ destroy: () => void }> = [];
    const nodes = [...root.querySelectorAll<HTMLElement>("[data-lottie-url]")];
    void import("lottie-web")
      .then(({ default: lottie }) => {
        nodes.forEach(async (node) => {
          try {
            const response = await fetch(node.dataset.lottieUrl!);
            if (!response.ok) throw new Error("Lottie asset unavailable");
            const animationData = await response.json();
            if (!active) return;
            node.replaceChildren();
            const animation = lottie.loadAnimation({
              container: node,
              renderer: "svg",
              loop: true,
              autoplay: true,
              animationData,
            });
            if (active) animations.push(animation);
            else animation.destroy();
          } catch {
            // Keep the custom emoji ALT text rendered by previewHtml as fallback.
          }
        });
      })
      .catch(() => undefined);

    return () => {
      active = false;
      animations.forEach((animation) => animation.destroy());
    };
  }, [customEmojiPacks, rootRef, text]);
}

function RenderedPreviewText({
  text,
  customEmojiPacks,
}: {
  text: string;
  customEmojiPacks: TelegramCustomEmojiPackSummary[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useTelegramCustomEmojiLottie(ref, text, customEmojiPacks);
  return (
    <div
      ref={ref}
      className="telegram-preview-text whitespace-pre-wrap break-words text-[14px] leading-[1.3] text-[#f5f5f5]"
      dangerouslySetInnerHTML={{ __html: previewHtml(text, customEmojiPacks) }}
      onClick={handlePreviewContentClick}
    />
  );
}

function normalizeTelegramFormattedHtml(html: string) {
  return html
    .replace(
      /<blockquote\s+expandable(?:=(['"])?.*?\1)?\s*>/gi,
      '<blockquote class="expandable">',
    )
    .replace(/<tg-spoiler>/gi, '<span class="tg-spoiler">')
    .replace(/<\/tg-spoiler>/gi, "</span>")
    .replace(/<span class="spoiler">/gi, '<span class="tg-spoiler">')
    .replace(
      /<pre([^>]*)>([\s\S]*?)<\/pre>/gi,
      (_match, attributes: string, inner: string) => {
        if (/data-copy-code/i.test(inner)) return _match;
        const languageFromAttr =
          attributes.match(/\slanguage=(['"])(.*?)\1/i)?.[2] ||
          attributes.match(/\slang=(['"])(.*?)\1/i)?.[2] ||
          "";
        const codeClassMatch = inner.match(
          /<code[^>]*class=(['"])(.*?)\1[^>]*>/i,
        );
        const languageFromCodeClass =
          codeClassMatch?.[2]
            ?.split(/\s+/)
            .find((value) => value.startsWith("language-"))
            ?.replace(/^language-/, "") || "";
        const label = languageFromAttr || languageFromCodeClass;
        const content = /<code[\s>]/i.test(inner)
          ? inner
          : `<code>${inner}</code>`;
        const copyButton = `<button type="button" data-copy-code aria-label="Copy code"><svg class="tg-copy-icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="6.5" y="2.5" width="10" height="12" rx="1.8"></rect><rect x="3.5" y="5.5" width="10" height="12" rx="1.8"></rect></svg></button>`;
        return label
          ? `<pre class="tg-native-pre"><span class="tg-native-pre-header"><span>${escapeHtml(label)}</span>${copyButton}</span>${content}</pre>`
          : `<pre class="tg-native-pre tg-native-pre-plain">${copyButton}${content}</pre>`;
      },
    );
}

export function TelegramPostPreview({
  channelTitle,
  channelPhotoUrl,
  text,
  formattedHtml,
  imageUrls,
  onTextChange,
  onUndo,
  onRedo,
  longTextMode = "IMAGES_THEN_TEXT",
  captionLengthMax = 1024,
  messageLengthMax = 4096,
  buttonRows = [],
  customEmojiPacks,
}: TelegramPostPreviewProps) {
  const resolvedCustomEmojiPacks =
    useRetainedCustomEmojiPacks(customEmojiPacks);
  const hasContent = text.trim() || imageUrls.length;
  const time = new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  const messages =
    imageUrls.length && text.length > captionLengthMax
      ? longTextMode === "CAPTION_THEN_TEXT"
        ? (() => {
            const [caption, remainderText] = splitPreviewTextOnce(
              text,
              captionLengthMax,
            );
            const remainder = splitPreviewText(remainderText, messageLengthMax);
            return [
              { text: caption, imageUrls },
              ...remainder.map((part) => ({ text: part, imageUrls: [] })),
            ];
          })()
        : [
            { text: "", imageUrls },
            ...splitPreviewText(text, messageLengthMax).map((part) => ({
              text: part,
              imageUrls: [],
            })),
          ]
      : imageUrls.length
        ? [{ text, imageUrls }]
        : splitPreviewText(text, messageLengthMax).map((part) => ({
            text: part,
            imageUrls: [],
          }));
  const previewEditable = Boolean(
    onTextChange && !formattedHtml && messages.length === 1,
  );

  return (
    <aside className="min-w-0">
      <div className="sticky top-4 overflow-hidden rounded-xl border border-[#263849] bg-[#0e1621] shadow-xl">
        <div className="flex items-center gap-3 border-b border-[#263849] bg-[#17212b] px-4 py-3">
          <TelegramEntityAvatar
            imageUrl={channelPhotoUrl}
            kind="channel"
            alt={channelTitle}
            size="sm"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {channelTitle}
            </p>
            <p className="text-xs text-[#7f91a4]">channel</p>
          </div>
        </div>

        <div className="telegram-preview-wallpaper min-h-[460px] px-3 py-5">
          {hasContent ? (
            <div className="max-w-full space-y-2">
              {messages.map((message, index) => (
                <TelegramMessageBubble
                  key={index}
                  text={message.text}
                  formattedHtml={index === 0 ? formattedHtml : null}
                  imageUrls={message.imageUrls}
                  time={time}
                  editable={previewEditable && index === 0}
                  onTextChange={
                    previewEditable && index === 0
                      ? onTextChange || undefined
                      : undefined
                  }
                  onUndo={
                    previewEditable && index === 0
                      ? onUndo || undefined
                      : undefined
                  }
                  onRedo={
                    previewEditable && index === 0
                      ? onRedo || undefined
                      : undefined
                  }
                  customEmojiPacks={resolvedCustomEmojiPacks}
                />
              ))}
              <TelegramInlineKeyboardPreview buttonRows={buttonRows} />
            </div>
          ) : (
            <div className="flex min-h-[400px] items-center justify-center px-8 text-center text-sm text-[#708499]">
              Start typing or upload images to preview your Telegram post.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function TelegramMessageBubble({
  text,
  formattedHtml,
  imageUrls,
  time,
  editable = false,
  onTextChange,
  onUndo,
  onRedo,
  customEmojiPacks = [],
}: {
  text: string;
  formattedHtml?: string | null;
  imageUrls: string[];
  time: string;
  editable?: boolean;
  onTextChange?: (value: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  customEmojiPacks?: TelegramCustomEmojiPackSummary[];
}) {
  return (
    <div className="telegram-message-bubble overflow-hidden rounded-[18px] rounded-bl-[5px] bg-[#182533] shadow-md">
      {imageUrls.length ? <TelegramMediaGrid imageUrls={imageUrls} /> : null}
      {text.trim() ? (
        <div
          className={
            imageUrls.length ? "px-4 pb-2.5 pt-2.5" : "px-3.5 pb-2.5 pt-3"
          }
        >
          {formattedHtml ? (
            <div
              className="telegram-preview-text whitespace-pre-wrap break-words text-[14px] leading-[1.3] text-[#f5f5f5]"
              dangerouslySetInnerHTML={{
                __html: normalizeTelegramFormattedHtml(formattedHtml),
              }}
              onClick={handlePreviewContentClick}
            />
          ) : editable && onTextChange ? (
            <EditableTelegramPreviewText
              value={text}
              customEmojiPacks={customEmojiPacks}
              onChange={onTextChange}
              onUndo={onUndo}
              onRedo={onRedo}
            />
          ) : (
            <RenderedPreviewText
              text={text}
              customEmojiPacks={customEmojiPacks}
            />
          )}
          <MessageMeta time={time} />
        </div>
      ) : (
        <div className="px-3 py-1.5">
          <MessageMeta time={time} />
        </div>
      )}
      <div className="flex items-center justify-between border-t border-[#324557] px-3.5 py-2.5 text-[13px] text-[#40a7e3]">
        <span className="flex items-center gap-2">
          <MessageCircle size={17} />
          Leave a Comment
        </span>
        <ChevronRight size={18} />
      </div>
    </div>
  );
}

function EditableTelegramPreviewText({
  value,
  onChange,
  onUndo,
  onRedo,
  customEmojiPacks = [],
}: {
  value: string;
  onChange: (value: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  customEmojiPacks?: TelegramCustomEmojiPackSummary[];
}) {
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
  useTelegramCustomEmojiLottie(contentRef, value, customEmojiPacks);

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
    const nextHtml = previewHtml(value, customEmojiPacks);
    if (!hasRenderedValueRef.current) {
      element.innerHTML = nextHtml;
      hasRenderedValueRef.current = true;
      lastMarkupRef.current = value;
      return;
    }

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
  }, [collapseSelectionToPreviewEnd, customEmojiPacks, value]);

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
      element.innerHTML = previewHtml(nextValue, customEmojiPacks);
      collapseSelectionToPreviewEnd();
    },
    [collapseSelectionToPreviewEnd, customEmojiPacks],
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
                label="Bold"
                icon={Bold}
                onClick={() => wrapSelection("strong")}
              />
              <PreviewFormatButton
                label="Italic"
                icon={Italic}
                onClick={() => wrapSelection("em")}
              />
              <PreviewFormatButton
                label="Underline"
                icon={Underline}
                onClick={() => wrapSelection("u")}
              />
              <PreviewFormatButton
                label="Strikethrough"
                icon={Strikethrough}
                onClick={() => wrapSelection("s")}
              />
              <PreviewFormatButton
                label="Code"
                icon={Code}
                onClick={() => wrapSelection("code")}
              />
              <PreviewFormatButton
                label="Quote"
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

function MessageMeta({ time }: { time: string }) {
  return (
    <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#9fb0c0]">
      <Eye size={12} />
      <span>1</span>
      <span>{time}</span>
    </div>
  );
}

function handlePreviewContentClick(event: MouseEvent<HTMLDivElement>) {
  const target = event.target as HTMLElement;
  const copyButton = target.closest("[data-copy-code]");
  if (copyButton) {
    event.preventDefault();
    const code = copyButton
      .closest(".tg-code-block")
      ?.querySelector("code")?.textContent;
    if (code) {
      void navigator.clipboard.writeText(code);
      copyButton.classList.add("copied");
      window.setTimeout(() => copyButton.classList.remove("copied"), 1200);
    }
    return;
  }
  const spoiler = target.closest(".tg-spoiler");
  if (spoiler) {
    event.preventDefault();
    spoiler.classList.toggle("revealed");
    return;
  }
  if (target.closest("[data-internal-post-link]")) {
    event.preventDefault();
  }
}

function splitPreviewText(rawText: string, maxLength: number): string[] {
  const parts: string[] = [];
  let remaining = rawText.trim();
  while (remaining) {
    const [current, next] = splitPreviewTextOnce(remaining, maxLength);
    parts.push(current);
    if (!next) break;
    remaining = next;
  }
  return parts.length ? parts : [rawText];
}

function splitPreviewTextOnce(
  rawText: string,
  maxLength: number,
): [string, string] {
  if (rawText.length <= maxLength) return [rawText, ""];
  const boundaries = new Set<number>();
  for (const match of rawText.matchAll(/\n\s*\n/g)) {
    boundaries.add((match.index || 0) + match[0].length);
  }
  for (const match of rawText.matchAll(/[.!?…](?:["'»”)]*)\s+/g)) {
    boundaries.add((match.index || 0) + match[0].length);
  }
  for (const match of rawText.matchAll(/\n|\s+/g)) {
    boundaries.add((match.index || 0) + match[0].length);
  }
  const splitAt = [...boundaries]
    .sort((a, b) => b - a)
    .find((position) => {
      const candidate = rawText.slice(0, position).trimEnd();
      return (
        candidate.length <= maxLength && hasBalancedPreviewMarkup(candidate)
      );
    });
  const fallbackAt = splitAt ?? findHardPreviewSplit(rawText, maxLength);
  if (!fallbackAt) return [rawText, ""];
  return [
    rawText.slice(0, fallbackAt).trimEnd(),
    rawText.slice(fallbackAt).trimStart(),
  ];
}

function findHardPreviewSplit(rawText: string, maxLength: number) {
  for (
    let position = Math.min(rawText.length, maxLength);
    position > 0;
    position -= 1
  ) {
    const candidate = rawText.slice(0, position).trimEnd();
    if (candidate && hasBalancedPreviewMarkup(candidate)) return position;
  }
  return 0;
}

function hasBalancedPreviewMarkup(value: string) {
  if ((value.match(/```/g) || []).length % 2 !== 0) return false;
  const withoutFenced = value.replace(/```[\s\S]*?```/g, "");
  if ((withoutFenced.match(/`/g) || []).length % 2 !== 0) return false;
  return ["**", "__", "++", "~~", "||"].every((marker) => {
    let count = 0;
    let cursor = 0;
    while ((cursor = withoutFenced.indexOf(marker, cursor)) !== -1) {
      count += 1;
      cursor += marker.length;
    }
    return count % 2 === 0;
  });
}

function TelegramMediaGrid({ imageUrls }: { imageUrls: string[] }) {
  const visible = imageUrls.slice(0, 4);

  if (visible.length === 1) {
    return (
      <div className="w-full bg-[#101b27]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={visible[0]}
          alt=""
          className="block h-auto w-full max-w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-0.5 bg-[#0e1621]">
      {visible.map((url, index) => (
        <div
          key={`${url}-${index}`}
          className={`relative overflow-hidden bg-[#101b27] ${
            visible.length === 3 && index === 0
              ? "row-span-2 aspect-auto min-h-56"
              : "aspect-square"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-full w-full object-cover" />
          {index === 3 && imageUrls.length > 4 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-2xl font-semibold text-white">
              +{imageUrls.length - 4}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
