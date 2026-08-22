"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Archive, MoreVertical, RotateCcw, Trash2 } from "lucide-react";

const itemClassName =
  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800 hover:text-white";

export function ChannelMenuAction({
  label,
  icon,
  onClick,
  danger = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: MouseEventHandler<HTMLButtonElement>;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${itemClassName} ${danger ? "text-rose-300 hover:bg-rose-950/40" : ""}`}
    >
      {icon}
      {label}
    </button>
  );
}

export function ChannelMenuLink({
  label,
  href,
  icon,
}: {
  label: string;
  href: string;
  icon: ReactNode;
}) {
  return (
    <Link href={href} className={itemClassName}>
      {icon}
      {label}
    </Link>
  );
}

export function ChannelActionsMenu({
  channelTitle,
  archived,
  canArchive,
  onArchive,
  onRestore,
  onDelete,
  children,
}: {
  channelTitle: string;
  archived: boolean;
  canArchive: boolean;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const triggerRect = trigger.current?.getBoundingClientRect();
      if (!triggerRect) return;
      const menuWidth = menu.current?.offsetWidth || 224;
      const menuHeight = menu.current?.offsetHeight || 320;
      const gap = 4;
      const left = Math.min(
        Math.max(8, triggerRect.right - menuWidth),
        window.innerWidth - menuWidth - 8,
      );
      const fitsBelow =
        triggerRect.bottom + gap + menuHeight <= window.innerHeight - 8;
      setPosition({
        left,
        top: fitsBelow
          ? triggerRect.bottom + gap
          : Math.max(8, triggerRect.top - menuHeight - gap),
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

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !menu.current?.contains(target)) {
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label={`Actions for ${channelTitle}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white"
      >
        <MoreVertical size={20} />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menu}
              role="menu"
              style={{ top: position.top, left: position.left }}
              className="fixed z-[100] w-56 rounded-lg border border-neutral-700 bg-neutral-950 p-1.5 shadow-2xl"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button,a"))
                  setOpen(false);
              }}
            >
              {children}
              <div className="my-1 border-t border-neutral-800" />
              {archived ? (
                <ChannelMenuAction
                  label="Restore channel"
                  icon={<RotateCcw size={17} />}
                  onClick={onRestore}
                />
              ) : canArchive ? (
                <ChannelMenuAction
                  label="Archive channel"
                  icon={<Archive size={17} />}
                  onClick={onArchive}
                />
              ) : null}
              <ChannelMenuAction
                label="Delete channel"
                icon={<Trash2 size={17} />}
                onClick={onDelete}
                danger
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
