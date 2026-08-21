"use client";

import { X } from "lucide-react";
import { type PropsWithChildren, useEffect, useId, useRef } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  allowOverflow = false,
  closeLabel = "Close dialog",
}: PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  title: string;
  size?: "md" | "sm" | "xl";
  allowOverflow?: boolean;
  loading?: boolean;
  closeLabel?: string;
}>) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const selector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>(selector) ?? []).filter(
        (element) => element.getAttribute("aria-hidden") !== "true",
      );
    const frame = window.requestAnimationFrame(() => {
      if (dialog?.contains(document.activeElement)) return;
      (dialog?.querySelector<HTMLElement>("[autofocus]") ??
        focusable()[0] ??
        dialog)?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        data-app-modal="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[calc(100dvh-1rem)] w-full flex-col rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl sm:max-h-[84vh] ${allowOverflow ? "overflow-visible" : "overflow-hidden"} ${size === "sm" ? "max-w-[560px]" : size === "xl" ? "max-w-[1280px]" : "max-w-[660px]"}`}
      >
        <div className="mb-1 flex items-center justify-between p-4 pb-3 sm:p-5 sm:pb-3">
          <h3 id={titleId} className="text-lg font-semibold sm:text-xl">
            {title}
          </h3>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-neutral-700 p-2 hover:bg-neutral-800"
          >
            <X size={16} />
          </button>
        </div>
        <div
          className={`min-h-0 px-4 pb-4 sm:px-5 sm:pb-5 ${allowOverflow ? "overflow-visible" : "overflow-y-auto"}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
