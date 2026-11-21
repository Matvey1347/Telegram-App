"use client";

import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const TooltipBubble = forwardRef<
  HTMLSpanElement,
  {
    children: React.ReactNode;
    side?: "top" | "bottom";
    align?: "left" | "center" | "right";
    className?: string;
    style?: React.CSSProperties;
    arrowStyle?: React.CSSProperties;
    floating?: boolean;
  }
>(function TooltipBubble(
  {
    children,
    side = "top",
    align = "center",
    className = "",
    style,
    arrowStyle,
    floating = false,
  },
  ref,
) {
  const positionClass = floating
    ? ""
    : side === "top"
      ? "bottom-full mb-3"
      : "top-full mt-3";
  const alignClass = floating
    ? ""
    : align === "left"
      ? "left-0"
      : align === "right"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";
  const layerClass = floating ? "fixed" : "absolute";
  const arrowAnchorClass =
    align === "left"
      ? "left-4"
      : align === "right"
        ? "right-4"
        : "left-1/2 -translate-x-1/2";
  const arrowClass =
    side === "top"
      ? "top-full -translate-y-1/2 rotate-45 border-b border-r"
      : "bottom-full translate-y-1/2 rotate-45 border-t border-l";

  return (
    <span
      ref={ref}
      style={style}
      className={`pointer-events-none ${layerClass} z-[200] w-max max-w-[calc(100vw-2rem)] rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs leading-relaxed text-neutral-100 shadow-xl ${positionClass} ${alignClass} ${className}`}
    >
      {children}
      <span
        style={arrowStyle}
        className={`absolute h-3 w-3 border-neutral-700 bg-neutral-950 ${arrowStyle ? "" : arrowAnchorClass} ${arrowClass}`}
        aria-hidden="true"
      />
    </span>
  );
});

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  className = "",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom";
  align?: "left" | "center" | "right";
  className?: string;
}) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    arrowLeft: 0,
    side,
  });

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !mounted) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const bubbleWidth = bubbleRef.current?.offsetWidth ?? 0;
    const margin = 12;
    const desiredLeft =
      align === "left"
        ? rect.left
        : align === "right"
          ? rect.right
          : rect.left + rect.width / 2;
    const minLeft =
      align === "right"
        ? margin + bubbleWidth
        : align === "center"
          ? margin + bubbleWidth / 2
          : margin;
    const maxLeft =
      align === "left"
        ? window.innerWidth - margin - bubbleWidth
        : align === "center"
          ? window.innerWidth - margin - bubbleWidth / 2
          : window.innerWidth - margin;
    const bubbleHeight = bubbleRef.current?.offsetHeight ?? 0;
    const viewportMargin = 12;
    const preferredTop = side === "top" ? rect.top - 12 : rect.bottom + 12;
    const oppositeSide = side === "top" ? "bottom" : "top";
    const oppositeTop =
      oppositeSide === "top" ? rect.top - 12 : rect.bottom + 12;
    const preferredFits =
      side === "top"
        ? preferredTop - bubbleHeight >= viewportMargin
        : preferredTop + bubbleHeight <= window.innerHeight - viewportMargin;
    const resolvedSide = preferredFits ? side : oppositeSide;
    const top = oppositeSide === "top" ? rect.top - 12 : rect.bottom + 12;
    const left = Math.max(minLeft, Math.min(maxLeft, desiredLeft));
    const bubbleLeft =
      align === "right"
        ? left - bubbleWidth
        : align === "center"
          ? left - bubbleWidth / 2
          : left;
    const triggerCenter = rect.left + rect.width / 2;
    const arrowLeft = bubbleWidth
      ? Math.max(16, Math.min(bubbleWidth - 16, triggerCenter - bubbleLeft))
      : 0;
    setPosition({
      left,
      top: resolvedSide === side ? preferredTop : top,
      arrowLeft,
      side: resolvedSide,
    });
  }, [align, content, mounted, open, side]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (bubbleRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const transform =
    align === "left"
      ? "translateX(0)"
      : align === "right"
        ? "translateX(-100%)"
        : "translateX(-50%)";

  return (
    <span
      ref={triggerRef}
      className={`inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen((current) => !current)}
    >
      {children}
      {mounted && open
        ? createPortal(
            <TooltipBubble
              ref={bubbleRef}
              side={position.side}
              align={align}
              floating
              className="whitespace-normal"
              style={{
                left: position.left,
                top: position.top,
                transform:
                  position.side === "top"
                    ? `${transform} translateY(-100%)`
                    : transform,
              }}
              arrowStyle={
                position.arrowLeft
                  ? {
                      left: position.arrowLeft,
                      marginLeft: -6,
                    }
                  : undefined
              }
            >
              {content}
            </TooltipBubble>,
            document.body,
          )
        : null}
    </span>
  );
}
