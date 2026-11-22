"use client";

import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useAdsFilterVisibility } from "@/components/features/growth/ad-campaigns/use-ads-filter-visibility";
import { AdsFilterButton, useAdsFilterPresentation } from "@/components/features/growth/ad-campaigns/ads-filter-presentation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/primitives";
import { AdsSectionTabs, resolveAdsSection, type AdsSection } from "@/components/features/growth/ad-campaigns/ads-section-tabs";
import { adsSectionHeader } from "@/components/features/growth/ad-campaigns/ads-section-header";
import { AdCampaignsPage } from "@/components/features/growth/ad-campaigns/ads-workspace";

function AdCampaignSectionSkeleton() {
  const searchParams = useSearchParams();
  const section = resolveAdsSection(
    searchParams.get("section"),
    searchParams.get("view"),
  );
  const header = adsSectionHeader(section);

  return (
    <AppShell>
      <PageHeader title={header.title} subtitle={header.subtitle} />
      <AdsSectionTabs value={section} />
      <div
        role="status"
        aria-label="Loading promotion section"
        aria-busy="true"
        className="space-y-4"
      >
        <div className="h-10 w-full animate-pulse rounded-lg bg-neutral-900" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="h-48 animate-pulse rounded-xl border border-neutral-800 bg-neutral-900/70"
            />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

const LazyCrossPromotionPlansPage = dynamic(
  () =>
    import("@/components/features/growth/ad-campaigns/cross-promotion-plans-page").then(
      (module) => module.CrossPromotionPlansPage,
    ),
  { loading: () => <AdCampaignSectionSkeleton /> },
);

export default function AdsPage() {
  const searchParams = useSearchParams();
  const requestedSection = searchParams.get("section");
  const legacyView = searchParams.get("view");
  const section: AdsSection = resolveAdsSection(requestedSection, legacyView);
  const [filtersOpen, toggleFilters] = useAdsFilterVisibility();
  const filterPresentation = useAdsFilterPresentation();
  const showFilterToggle = ["campaigns", "hypotheses", "promo"].includes(section);
  const sectionTabs = (
    <AdsSectionTabs
      value={section}
      trailing={showFilterToggle ? <AdsFilterButton presentation={filterPresentation} desktopOpen={filtersOpen} toggleDesktop={toggleFilters} /> : undefined}
    />
  );
  return section === "mutual-promotion" || section === "own-promotion" ? (
    <LazyCrossPromotionPlansPage
      kind="DIRECT_MUTUAL"
      sectionTabs={sectionTabs}
    />
  ) : (
    <AdCampaignsPage sectionTabs={sectionTabs} topSection={section} filtersOpen={filtersOpen} filterPresentation={filterPresentation} />
  );
}
