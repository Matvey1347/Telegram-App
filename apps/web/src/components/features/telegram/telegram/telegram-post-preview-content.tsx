"use client";

import {
  type MouseEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import type { TelegramCustomEmojiPackSummary } from "@telegram-system/shared";
import { parseTelegramTableCellMarkup } from "@telegram-system/shared/telegram-table-markup";
import {
  escapeTelegramPreviewHtml as escapeHtml,
  renderTelegramPreviewInlineMarkup,
} from "./telegram-post-preview-markup";
import { useI18n } from "@/providers/i18n-provider";

export type PreviewLabels = {
  copy: string;
  copyCode: string;
  internalPostLink: string;
};
function renderFencedCodeBlock(
  info: string,
  lineBreak: string,
  code: string,
  labels: PreviewLabels,
) {
  const normalizedInfo = info.replace(/\r/g, "");
  const normalizedLineBreak = lineBreak.replace(/\r/g, "\n");
  const normalizedCode = code.replace(/\r/g, "");
  const hasLabel = normalizedInfo.trim().length > 0;
  const label = hasLabel ? normalizedInfo : labels.copy;
  const content = hasLabel
    ? normalizedCode
    : normalizedInfo
      ? `${normalizedInfo}${normalizedLineBreak}${normalizedCode}`
      : normalizedCode;
  return `<pre class="tg-code-block" data-code-label="${escapeHtml(label)}" data-has-code-label="${hasLabel ? "true" : "false"}"><span class="tg-code-header" contenteditable="false"><span>${escapeHtml(label)}</span><button type="button" data-copy-code aria-label="${escapeHtml(labels.copyCode)}" contenteditable="false"><svg class="tg-copy-icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="6.5" y="2.5" width="10" height="12" rx="1.8"></rect><rect x="3.5" y="5.5" width="10" height="12" rx="1.8"></rect></svg></button></span><code>${escapeHtml(content)}</code></pre>`;
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
  // Telegram accepts list-looking lines as ordinary message text. Keeping the
  // source untouched avoids browser list indentation in the local preview.
  return value;
}

export function previewHtml(
  raw: string,
  customEmojiPacks: TelegramCustomEmojiPackSummary[],
  labels: PreviewLabels,
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
  const normalizedRaw = raw.replace(
    /\\`([\s\S]*?)\\`/g,
    (_match, code: string) =>
      /[\r\n]/.test(code)
        ? `\`\`\`\n${code.replace(/\r\n?/g, "\n")}\`\`\``
        : `\`${code}\``,
  );
  let value = renderRichBlocks(normalizedRaw, token)
    .replace(
      /^!\[([^\]\n]*)\]\((https?:\/\/[^\s<>()]+)\)$/gim,
      (_match, alt: string, href: string) => {
        try {
          const url = new URL(href);
          if (!url.hostname.includes(".")) return _match;
          return token(
            `<img class="tg-inline-image" src="${escapeHtml(url.toString())}" alt="${escapeHtml(alt)}">`,
            "block",
          );
        } catch {
          return _match;
        }
      },
    )
    .replace(
      /!\[([^\]\n]*)\]\(tg:\/\/emoji\?id=([0-9]+)\)/g,
      (_match, alt: string, documentId: string) => {
        const emoji = customEmojiById.get(documentId);
        const label = escapeHtml(alt);
        const media = emoji
          ? emoji.kind === "VIDEO" && emoji.assetUrl
            ? `<video src="${escapeHtml(emoji.assetUrl)}" style="${customEmojiInlineStyle}" autoplay loop muted playsinline aria-label="${label}"></video>`
            : emoji.kind === "STATIC" && emoji.assetUrl
              ? `<img src="${escapeHtml(emoji.assetUrl)}" style="${customEmojiInlineStyle}" alt="${label}">`
              : emoji.kind === "ANIMATED" && emoji.renderAssetUrl
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
      return token(
        renderFencedCodeBlock(info, lineBreak, code, labels),
        "block",
      );
    },
  );
  value = value.replace(/`([^`\n]+)`/g, (_match, code: string) =>
    token(`<code>${escapeHtml(code)}</code>`),
  );
  value = value.replace(
    /\[([^\]\n]+)\]\(tg-post:([a-zA-Z0-9_-]+)\)/g,
    (_match, label: string, postId: string) =>
      token(
        `<a href="tg-post:${escapeHtml(postId)}" data-internal-post-link="${escapeHtml(postId)}" data-internal-post-id="${escapeHtml(postId)}" title="${escapeHtml(labels.internalPostLink)}">${renderTelegramPreviewInlineMarkup(label)}</a>`,
      ),
  );
  value = value.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s<>()]+)\)/gi,
    (_match, label: string, href: string) => {
      try {
        const url = new URL(href);
        if (!url.hostname.includes(".")) return _match;
        return token(
          `<a href="${escapeHtml(url.toString())}" target="_blank" rel="noreferrer">${renderTelegramPreviewInlineMarkup(label)}</a>`,
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
  value = renderTelegramPreviewInlineMarkup(value);

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
export function useRetainedCustomEmojiPacks(
  packs: TelegramCustomEmojiPackSummary[] | undefined,
) {
  const [lastAvailable, setLastAvailable] = useState<
    TelegramCustomEmojiPackSummary[]
  >(packs ?? []);
  if (packs !== undefined && packs !== lastAvailable) setLastAvailable(packs);
  return packs ?? lastAvailable;
}
export function useTelegramCustomEmojiLottie(
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
export function RenderedPreviewText({
  text,
  customEmojiPacks,
}: {
  text: string;
  customEmojiPacks: TelegramCustomEmojiPackSummary[];
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useTelegramCustomEmojiLottie(ref, text, customEmojiPacks);
  return (
    <div
      ref={ref}
      className="telegram-preview-text whitespace-pre-wrap break-words text-[14px] leading-[1.3] text-[#f5f5f5]"
      dangerouslySetInnerHTML={{
        __html: previewHtml(text, customEmojiPacks, {
          copy: t("telegram.posts.editorComponents.preview.copy"),
          copyCode: t("telegram.posts.editorComponents.preview.copyCode"),
          internalPostLink: t(
            "telegram.posts.editorComponents.preview.internalPostLink",
          ),
        }),
      }}
      onClick={handlePreviewContentClick}
    />
  );
}
export function handlePreviewContentClick(event: MouseEvent<HTMLDivElement>) {
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
