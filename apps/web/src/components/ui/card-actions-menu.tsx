"use client";

import Link from "next/link";
import {
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import { useDismissiblePopover } from "@/hooks/use-dismissible-popover";

const itemClassName =
  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50";

export function CardMenuAction({
  label,
  icon,
  danger = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      {...props}
      className={`${itemClassName} ${danger ? "text-rose-300 hover:bg-rose-950/40" : ""} ${props.className ?? ""}`}
    >
      {icon}
      {label}
    </button>
  );
}

export function CardMenuLink({
  label,
  href,
  icon,
}: {
  label: string;
  href: string;
  icon: ReactNode;
}) {
  return (
    <Link href={href} role="menuitem" className={itemClassName}>
      {icon}
      {label}
    </Link>
  );
}

export function CardActionsMenu({
  label,
  children,
  keepMounted = false,
  triggerClassName = "",
}: {
  label: string;
  children: ReactNode;
  keepMounted?: boolean;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useDismissiblePopover({
    open,
    onDismiss: () => setOpen(false),
    triggerRef: root,
    contentRef: menu,
  });

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

  return (
    <>
      <div ref={root} className="relative">
        <button
          ref={trigger}
          type="button"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${triggerClassName}`}
        >
          <MoreVertical size={20} />
        </button>
      </div>
      {(open || keepMounted) && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menu}
              role="menu"
              style={{ top: position.top, left: position.left }}
              className={`${open ? "fixed" : "hidden"} z-[100] w-56 rounded-lg border border-neutral-700 bg-neutral-950 p-1.5 shadow-2xl`}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button,a")) {
                  setOpen(false);
                }
              }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
