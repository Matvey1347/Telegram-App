"use client";

import { useEffect, useRef } from "react";
import type { TelegramCustomEmoji } from "@telegram-system/shared";

export const CUSTOM_EMOJI_TOKEN_PATTERN = /!\[([^\]\n]*)\]\(tg:\/\/emoji\?id=([0-9]+)\)/g;

export function customEmojiToken(emoji: Pick<TelegramCustomEmoji, "alt" | "documentId">) {
  return `![${emoji.alt}](tg://emoji?id=${emoji.documentId})`;
}

/** A repo-owned renderer for the browser Lottie JSON derived during import. */
export function TelegramCustomEmojiLottie({ src, className = "h-5 w-5" }: { src: string; className?: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    // lottie-web probes Canvas during module initialization; skip it in
    // non-browser renderers/test DOMs while preserving the semantic label.
    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) return;
    let animation: { destroy: () => void } | undefined;
    let cancelled = false;
    void (async () => {
      const data = await fetch(src).then((response) => response.ok ? response.json() : Promise.reject(new Error("Lottie asset unavailable")));
      const lottie = await import("lottie-web");
      if (cancelled || !containerRef.current) return;
      animation = lottie.default.loadAnimation({ container: containerRef.current, renderer: "svg", loop: true, autoplay: true, animationData: data });
    })().catch(() => undefined);
    return () => { cancelled = true; animation?.destroy(); };
  }, [src]);
  return <span aria-hidden="true" ref={containerRef} className={`${className} inline-block overflow-hidden align-middle`} />;
}

export function TelegramCustomEmojiRenderer({ emoji, className = "h-5 w-5" }: { emoji: TelegramCustomEmoji; className?: string }) {
  const label = emoji.alt || "Custom emoji";
  if (emoji.kind === "VIDEO" && emoji.assetUrl) return <video aria-label={label} className={`${className} inline-block object-contain`} src={emoji.assetUrl} autoPlay loop muted playsInline />;
  if (emoji.kind === "ANIMATED" && emoji.renderAssetUrl) return <span aria-label={label}><TelegramCustomEmojiLottie src={emoji.renderAssetUrl} className={className} /></span>;
  if (emoji.kind === "STATIC" && emoji.assetUrl) return <img src={emoji.assetUrl} alt={label} className={`${className} inline-block object-contain`} />;
  return <span aria-label={label}>{emoji.alt || "◇"}</span>;
}
