import Link from "next/link";

export type AdsSection =
  | "campaigns"
  | "hypotheses"
  | "promo"
  | "mutual-promotion";

const ADS_SECTIONS: ReadonlyArray<{
  value: AdsSection;
  label: string;
  href: string;
}> = [
  {
    value: "campaigns",
    label: "Ad campaigns",
    href: "/ad-campaigns?section=campaigns",
  },
  {
    value: "hypotheses",
    label: "Hypotheses",
    href: "/ad-campaigns?section=hypotheses",
  },
  {
    value: "promo",
    label: "Promo",
    href: "/ad-campaigns?section=promo",
  },
  {
    value: "mutual-promotion",
    label: "Mutual promotion",
    href: "/ad-campaigns?section=mutual-promotion",
  },
];

export function resolveAdsSection(
  requestedSection: string | null,
  legacyView: string | null,
): AdsSection {
  if (requestedSection === "mutual-promotion") return "mutual-promotion";
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
      {ADS_SECTIONS.map((section) => (
        <Link
          key={section.value}
          href={section.href}
          role="tab"
          aria-selected={value === section.value}
          className={`rounded-md px-4 py-2 text-sm transition ${
            value === section.value
              ? "bg-blue-600 text-white"
              : "text-neutral-300 hover:bg-neutral-800"
          }`}
        >
          {section.label}
        </Link>
      ))}
    </div>
  );
}
