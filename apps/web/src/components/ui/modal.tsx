"use client";

import { X } from "lucide-react";
import { createPortal } from "react-dom";
import {
  type PropsWithChildren,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
} from "react";
import { useOptionalI18n } from "@/providers/i18n-provider";
import { featureModalIconForTitle } from "./feature-modal-icons";

const subscribeToClientRuntime = () => () => undefined;

export function Modal({
  open,
  onClose,
  title,
  titleIcon,
  headerAction,
  leadingHeaderAction,
  children,
  size = "md",
  allowOverflow = false,
  closeLabel,
}: PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  titleIcon?: ReactNode;
  headerAction?: ReactNode;
  leadingHeaderAction?: ReactNode;
  size?: "md" | "sm" | "xs" | "xl";
  allowOverflow?: boolean;
  loading?: boolean;
  closeLabel?: string;
}>) {
  const i18n = useOptionalI18n();
  const resolvedCloseLabel =
    closeLabel ?? i18n?.t("common.closeDialog") ?? "Close dialog";
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const isClient = useSyncExternalStore(
    subscribeToClientRuntime,
    () => true,
    () => false,
  );
  const portalTarget = isClient ? document.body : null;
  const resolvedTitleIcon = titleIcon ?? featureModalIconForTitle(title);

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
      (
        dialog?.querySelector<HTMLElement>("[autofocus]") ??
        focusable()[0] ??
        dialog
      )?.focus();
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

  if (!open || !portalTarget) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))]"
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
        className={`relative flex max-h-[calc(100dvh-1rem)] w-full flex-col rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl sm:max-h-[84vh] ${allowOverflow ? "overflow-visible" : "overflow-hidden"} ${size === "xs" ? "max-w-[400px]" : size === "sm" ? "max-w-[560px]" : size === "xl" ? "max-w-[1280px]" : "max-w-[660px]"}`}
      >
        <div className="mb-1 flex items-start justify-between gap-3 p-4 pb-3 sm:items-center sm:p-5 sm:pb-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2 sm:items-center sm:gap-3">
            {leadingHeaderAction}
            <span
              data-modal-title-icon="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-800/70 bg-blue-950/40 text-blue-300"
            >
              {resolvedTitleIcon}
            </span>
            <h3
              id={titleId}
              className="min-w-0 flex-1 text-base font-semibold leading-snug sm:text-xl"
            >
              {title}
            </h3>
            {headerAction}
          </div>
          <button
            type="button"
            aria-label={resolvedCloseLabel}
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-700 hover:bg-neutral-800"
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
    </div>,
    portalTarget,
  );
}
