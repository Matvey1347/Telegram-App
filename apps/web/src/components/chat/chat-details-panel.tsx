"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./chat.module.css";
import { OverlayPortalContext } from "@/components/ui/overlay-portal-context";
import { acquireBodyScrollLock } from "@/lib/body-scroll-lock";
import { useChatDetailsMobile } from "./use-chat-details-mobile";

/** Desktop is an inline panel. Mobile uses the browser's modal focus boundary. */
export function ChatDetailsPanel({ title, onClose, children, hideTitle = false }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  hideTitle?: boolean;
}) {
  const isMobile = useChatDetailsMobile();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDialogElement | null>(null);
  const bindDialog = useCallback((node: HTMLDialogElement | null) => { dialogRef.current = node; setPortalContainer(node); }, []);
  useEffect(() => {
    if (!isMobile) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const unlockScroll = acquireBodyScrollLock();
    dialog?.showModal();
    return () => {
      dialog?.close();
      unlockScroll();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isMobile]);
  const content = <>
    <header className={styles.detailsHeader}>
      <h2 id={titleId} className={hideTitle ? "sr-only" : "text-sm font-semibold text-neutral-100"}>{title}</h2>
      <button type="button" onClick={onClose} aria-label="Close details" className="ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutral-300 hover:bg-neutral-800"><X size={19} aria-hidden /></button>
    </header>
    <div className={`${styles.detailsBody} app-scrollbar`}>{children}</div>
  </>;
  return isMobile ? (
    <dialog ref={bindDialog} className={styles.mobileDetails} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}><OverlayPortalContext.Provider value={portalContainer}>{content}</OverlayPortalContext.Provider></dialog>
  ) : <aside className={styles.details} aria-labelledby={titleId}>{content}</aside>;
}
