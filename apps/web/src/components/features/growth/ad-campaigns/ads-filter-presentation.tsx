"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Filter } from "lucide-react";
import { Button, Modal } from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";

const MOBILE_QUERY = "(max-width: 639px)";
function subscribeMobile(callback: () => void) {
  const media = window.matchMedia?.(MOBILE_QUERY);
  media?.addEventListener("change", callback);
  return () => media?.removeEventListener("change", callback);
}
function mobileSnapshot() {
  return window.matchMedia?.(MOBILE_QUERY).matches ?? false;
}

export function useAdsFilterPresentation() {
  const isMobile = useSyncExternalStore(subscribeMobile, mobileSnapshot, () => false);
  const [open, setOpen] = useState(false);
  return { isMobile, open, setOpen };
}

type Presentation = ReturnType<typeof useAdsFilterPresentation>;

export function AdsFilterButton({ presentation, desktopOpen, toggleDesktop }: {
  presentation: Presentation;
  desktopOpen: boolean;
  toggleDesktop: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="w-full sm:w-auto">
      <Button type="button" variant="secondary" className="w-full sm:w-auto"
        aria-expanded={presentation.isMobile ? presentation.open : desktopOpen}
        aria-controls={presentation.isMobile ? undefined : "ads-filter-panel"}
        aria-haspopup={presentation.isMobile ? "dialog" : undefined}
        onClick={() => presentation.isMobile ? presentation.setOpen(true) : toggleDesktop()}>
        <Filter size={16} /> {presentation.isMobile || !desktopOpen ? t("ads.filters") : t("ads.hide_filters")}
      </Button>
    </div>
  );
}

export function AdsFilterSurface({ presentation, desktopOpen, children }: {
  presentation: Presentation;
  desktopOpen: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  if (presentation.isMobile) {
    return (
      <Modal open={presentation.open} onClose={() => presentation.setOpen(false)} title={t("ads.filters")}>
        {children}
        <Button className="w-full" onClick={() => presentation.setOpen(false)}>{t("common.close")}</Button>
      </Modal>
    );
  }
  return desktopOpen ? <div id="ads-filter-panel">{children}</div> : null;
}
