"use client";

import { useLayoutEffect, useRef } from "react";

/** Responds to the mobile visual viewport, including the on-screen keyboard. */
export function useInboxViewport(selected: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const viewport = window.visualViewport;
    const previousOverflow = document.body.style.overflow;
    const update = () => {
      const fullscreen = selected && window.innerWidth <= 768;
      const top = fullscreen ? viewport?.offsetTop ?? 0 : element.getBoundingClientRect().top;
      const bottom = fullscreen ? 0 : 16;
      const available = fullscreen ? viewport?.height ?? window.innerHeight : window.innerHeight - top - bottom;
      element.style.setProperty("--inbox-height", `${Math.max(180, available)}px`);
      element.style.setProperty("--inbox-top", `${top}px`);
      document.body.style.overflow = fullscreen ? "hidden" : previousOverflow;
    };
    update();
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      document.body.style.overflow = previousOverflow;
    };
  }, [selected]);
  return ref;
}
