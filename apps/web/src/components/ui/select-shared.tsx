"use client";
import type { ResolvedEmoji } from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { useOptionalI18n } from "@/providers/i18n-provider";
export function OptionIcon({
  iconNode,
  iconPresentation,
  iconUrl,
  iconEmoji,
  premium,
  fallback,
}: {
  iconNode?: React.ReactNode;
  iconPresentation?: ResolvedEmoji;
  iconUrl?: string;
  iconEmoji?: string;
  premium?: boolean;
  fallback?: string;
}) {
  const premiumLabel =
    useOptionalI18n()?.t("common.premiumEmoji") ?? "Telegram Premium emoji";
  if (iconNode) return iconNode;
  if (iconPresentation)
    return (
      <IconAvatar
        icon={iconPresentation}
        size="xs"
        bordered={false}
        decorative
        className="!rounded-md"
      />
    );
  if (iconUrl)
    return (
      <IconAvatar
        icon={{ type: "image", id: iconUrl, url: iconUrl }}
        label={fallback}
        size="xs"
        bordered={false}
        decorative
      />
    );
  if (iconEmoji)
    return (
      <span
        className={`relative flex h-5 w-5 shrink-0 items-center justify-center text-[15px] leading-none ${premium ? "rounded-md ring-1 ring-sky-400/70" : ""}`}
        title={premium ? premiumLabel : undefined}
      >
        {iconEmoji}
        {premium ? (
          <span
            className="absolute -right-1 -top-1 text-[8px] leading-none text-sky-300"
            aria-label={premiumLabel}
          >
            ✦
          </span>
        ) : null}
      </span>
    );
  if (!fallback) return null;
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 text-[11px] font-semibold text-neutral-200">
      {fallback.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

export function floatingMenuStyle(
  rect: DOMRect,
  {
    direction = "auto",
    maxMenuHeight,
  }: { direction?: "auto" | "up"; maxMenuHeight: number },
): React.CSSProperties {
  const gap = 4;
  const padding = 8;
  const visualViewport = window.visualViewport;
  // `getBoundingClientRect` is relative to the visible viewport, whereas a
  // fixed portal is positioned in the layout viewport. On iOS those origins
  // diverge while the keyboard is open, which used to make the menu jump.
  const viewportLeft = visualViewport?.offsetLeft ?? 0;
  const viewportTop = visualViewport?.offsetTop ?? 0;
  const viewportWidth = visualViewport?.width ?? window.innerWidth;
  const viewportHeight = visualViewport?.height ?? window.innerHeight;
  const viewportRight = viewportLeft + viewportWidth;
  const viewportBottom = viewportTop + viewportHeight;
  const triggerLeft = rect.left + viewportLeft;
  const triggerTop = rect.top + viewportTop;
  const triggerBottom = rect.bottom + viewportTop;
  const width = Math.min(rect.width, viewportWidth - padding * 2);
  const left = Math.min(
    Math.max(triggerLeft, viewportLeft + padding),
    viewportRight - width - padding,
  );
  const availableBelow = viewportBottom - triggerBottom - gap - padding;
  const availableAbove = triggerTop - viewportTop - gap - padding;
  const openUp =
    direction === "up" ||
    (availableBelow < 240 && availableAbove > availableBelow);
  const maxHeight = Math.max(
    0,
    Math.min(maxMenuHeight, openUp ? availableAbove : availableBelow),
  );

  return {
    position: "fixed",
    left,
    // Anchor the menu edge to the trigger. Positioning the top using the
    // maximum height leaves short menus floating above the control.
    top: openUp ? triggerTop - gap : triggerBottom + gap,
    ...(openUp ? { transform: "translateY(-100%)" } : {}),
    width,
    maxHeight,
  };
}
