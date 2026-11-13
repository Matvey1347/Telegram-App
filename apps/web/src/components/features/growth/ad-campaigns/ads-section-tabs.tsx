"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import {
  FlaskConical,
  Images,
  Megaphone,
  Network,
  Repeat2,
} from "lucide-react";
import { useI18n } from "@/providers/i18n-provider";
import type { TranslationKey } from "@/i18n/catalog";

export type AdsSection =
  | "campaigns"
  | "hypotheses"
  | "promo"
  | "mutual-promotion"
  | "own-promotion";

const ADS_SECTIONS: ReadonlyArray<{
  value: AdsSection;
  labelKey: TranslationKey;
  href: string;
  icon: typeof Megaphone;
}> = [
  {
    value: "campaigns",
    labelKey: "ads.section_campaigns",
    href: "/ad-campaigns?section=campaigns",
    icon: Megaphone,
  },
  {
    value: "hypotheses",
    labelKey: "ads.section_hypotheses",
    href: "/ad-campaigns?section=hypotheses",
    icon: FlaskConical,
  },
  {
    value: "promo",
    labelKey: "ads.section_promo",
    href: "/ad-campaigns?section=promo",
    icon: Images,
  },
  {
    value: "mutual-promotion",
    labelKey: "ads.section_mutual",
    href: "/ad-campaigns?section=mutual-promotion",
    icon: Repeat2,
  },
  {
    value: "own-promotion",
    labelKey: "ads.section_own",
    href: "/ad-campaigns?section=own-promotion",
    icon: Network,
  },
];

export function resolveAdsSection(
  requestedSection: string | null,
  legacyView: string | null,
): AdsSection {
  if (requestedSection === "mutual-promotion") return "mutual-promotion";
  if (requestedSection === "own-promotion") return "own-promotion";
  if (requestedSection === "promo") return "promo";
  if (requestedSection === "hypotheses") return "hypotheses";
  if (legacyView === "promos") return "promo";
  if (legacyView === "hypotheses") return "hypotheses";
  return "campaigns";
}

export function AdsSectionTabs({ value, trailing }: { value: AdsSection; trailing?: ReactNode }) {
  const { t } = useI18n();
  const activeTabRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    activeTabRef.current?.scrollIntoView?.({
      block: "nearest",
      inline: "center",
    });
  }, [value]);

  return (
    <div className="mb-5 flex min-w-0 flex-wrap items-center justify-between gap-2">
      <div
        data-testid="ads-section-tabs-scroll"
        className="min-w-0 max-w-full flex-1 overflow-x-auto overscroll-x-contain"
      >
      <div
        role="tablist"
        aria-label="Ads sections"
        className="inline-flex min-w-max rounded-lg border border-neutral-700 bg-neutral-900 p-1"
      >
        {ADS_SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.value}
              ref={value === section.value ? activeTabRef : undefined}
              href={section.href}
              role="tab"
              aria-selected={value === section.value}
              className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm transition ${
                value === section.value
                  ? "bg-blue-600 text-white"
                  : "text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              <Icon size={16} aria-hidden="true" />
              {t(section.labelKey)}
            </Link>
          );
        })}
      </div>
      </div>
      {trailing}
    </div>
  );
}
