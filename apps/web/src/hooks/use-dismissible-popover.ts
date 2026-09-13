"use client";

import { useEffect, useRef, type RefObject } from "react";

type DismissibleElement = HTMLElement | null;

export function useDismissiblePopover({
  open,
  onDismiss,
  triggerRef,
  contentRef,
}: {
  open: boolean;
  onDismiss: () => void;
  triggerRef: RefObject<DismissibleElement>;
  contentRef?: RefObject<DismissibleElement>;
}) {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return;

    const dismissOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target)) return;
      if (contentRef?.current?.contains(target)) return;
      onDismissRef.current();
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismissRef.current();
    };

    document.addEventListener("pointerdown", dismissOnOutsidePress);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOnOutsidePress);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [contentRef, open, triggerRef]);
}
