import Link from "next/link";
import {
  FlaskConical,
  Images,
  Megaphone,
  Network,
  Repeat2,
} from "lucide-react";

export type AdsSection =
  | "campaigns"
  | "hypotheses"
  | "promo"
  | "mutual-promotion"
  | "own-promotion";

const ADS_SECTIONS: ReadonlyArray<{
  value: AdsSection;
  label: string;
  href: string;
  icon: typeof Megaphone;
}> = [
  {
    value: "campaigns",
    label: "Ad campaigns",
    href: "/ad-campaigns?section=campaigns",
    icon: Megaphone,
  },
  {
    value: "hypotheses",
    label: "Hypotheses",
    href: "/ad-campaigns?section=hypotheses",
    icon: FlaskConical,
  },
  {
    value: "promo",
    label: "Promo",
    href: "/ad-campaigns?section=promo",
    icon: Images,
  },
  {
    value: "mutual-promotion",
    label: "Mutual promotion",
    href: "/ad-campaigns?section=mutual-promotion",
    icon: Repeat2,
  },
  {
    value: "own-promotion",
    label: "Own channels",
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

export function AdsSectionTabs({ value }: { value: AdsSection }) {
  return (
    <div
      role="tablist"
      aria-label="Ads sections"
      className="mb-5 inline-flex rounded-lg border border-neutral-700 bg-neutral-900 p-1"
    >
      {ADS_SECTIONS.map((section) => {
        const Icon = section.icon;
        return (
          <Link
            key={section.value}
            href={section.href}
            role="tab"
            aria-selected={value === section.value}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm transition ${
              value === section.value
                ? "bg-blue-600 text-white"
                : "text-neutral-300 hover:bg-neutral-800"
            }`}
          >
            <Icon size={16} aria-hidden="true" />
            {section.label}
          </Link>
        );
      })}
    </div>
  );
}
