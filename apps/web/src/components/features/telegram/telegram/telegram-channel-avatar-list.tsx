"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useLayoutEffect, useRef, useState } from "react";
import { useDismissiblePopover } from "@/hooks/use-dismissible-popover";
import { TelegramEntityAvatar } from "./telegram-entity-avatar";

type ChannelSummary = {
  id: string;
  title: string;
  photoUrl?: string | null;
};

export function TelegramChannelAvatarList({
  channels,
  ariaLabel,
  getHref,
}: {
  channels: readonly ChannelSummary[];
  ariaLabel: string;
  getHref?: (channel: ChannelSummary) => string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useDismissiblePopover({
    open,
    onDismiss: () => setOpen(false),
    triggerRef,
    contentRef,
  });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      if (!triggerRect) return;
      const menuWidth = contentRef.current?.offsetWidth || 224;
      const menuHeight = contentRef.current?.offsetHeight || 240;
      const gap = 8;
      const viewportGap = 8;
      const maximumLeft = Math.max(
        viewportGap,
        window.innerWidth - menuWidth - viewportGap,
      );
      const fitsBelow =
        triggerRect.bottom + gap + menuHeight <=
        window.innerHeight - viewportGap;
      setPosition({
        left: Math.min(Math.max(viewportGap, triggerRect.left), maximumLeft),
        top: fitsBelow
          ? triggerRect.bottom + gap
          : Math.max(viewportGap, triggerRect.top - menuHeight - gap),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <div className="group w-fit" onClick={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex cursor-pointer items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex -space-x-2">
          {channels.slice(0, 3).map((channel) => (
            <span
              key={channel.id}
              className="rounded-full ring-2 ring-neutral-950"
            >
              <TelegramEntityAvatar
                imageUrl={channel.photoUrl}
                kind="channel"
                alt={channel.title}
                size="xs"
              />
            </span>
          ))}
        </span>
        <span className="text-xs font-medium text-neutral-300">
          {channels.length} {channels.length === 1 ? "channel" : "channels"}
        </span>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={contentRef}
              role="menu"
              aria-label={ariaLabel}
              style={{ top: position.top, left: position.left }}
              className="fixed z-[200] max-h-[min(20rem,calc(100dvh-1rem))] min-w-56 space-y-1 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-950 p-2 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              {channels.map((channel) => {
                const content = (
                  <>
                    <TelegramEntityAvatar
                      imageUrl={channel.photoUrl}
                      kind="channel"
                      alt=""
                      size="xs"
                    />
                    <span className="min-w-0 truncate whitespace-nowrap text-xs text-neutral-200">
                      {channel.title}
                    </span>
                  </>
                );
                const className =
                  "flex items-center gap-2 rounded-md px-1 py-1 hover:bg-white/5";
                return getHref ? (
                  <Link
                    key={channel.id}
                    href={getHref(channel)}
                    className={className}
                    onClick={() => setOpen(false)}
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={channel.id} className={className}>
                    {content}
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
