"use client";

import { useEffect, useRef } from "react";
import type { ResolvedEmoji } from "@telegram-system/shared";

export function PremiumEmoji({
  icon,
  className,
}: {
  icon: Extract<ResolvedEmoji, { type: "unicode" }>;
  className: string;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const renderUrl = icon.telegramCustomEmojiRenderAssetUrl;

  useEffect(() => {
    if (!renderUrl || icon.telegramCustomEmojiKind !== "ANIMATED") return;
    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent))
      return;
    let animation: { destroy: () => void } | undefined;
    let cancelled = false;
    void (async () => {
      const response = await fetch(renderUrl);
      if (!response.ok) throw new Error("Premium emoji asset unavailable");
      const lottie = await import("lottie-web");
      if (cancelled || !containerRef.current) return;
      animation = lottie.default.loadAnimation({
        container: containerRef.current,
        renderer: "svg",
        loop: true,
        autoplay: true,
        animationData: await response.json(),
      });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      animation?.destroy();
    };
  }, [icon.telegramCustomEmojiKind, renderUrl]);

  if (icon.telegramCustomEmojiKind === "ANIMATED" && renderUrl) {
    return (
      <span
        ref={containerRef}
        className={className}
        aria-label={icon.name ?? icon.value}
      />
    );
  }
  if (
    icon.telegramCustomEmojiKind === "VIDEO" &&
    icon.telegramCustomEmojiAssetUrl
  ) {
    return (
      <video
        className={`${className} object-contain`}
        src={icon.telegramCustomEmojiAssetUrl}
        aria-label={icon.name ?? icon.value}
        autoPlay
        loop
        muted
        playsInline
      />
    );
  }
  if (
    icon.telegramCustomEmojiKind === "STATIC" &&
    icon.telegramCustomEmojiAssetUrl
  ) {
    return (
      <img
        className={`${className} object-contain`}
        src={icon.telegramCustomEmojiAssetUrl}
        alt={icon.name ?? icon.value}
      />
    );
  }
  return <span className={className}>{icon.value}</span>;
}
