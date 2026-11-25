"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  CreditCard,
  Megaphone,
  UsersRound,
  Waypoints,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingState, PageHeader } from "@/components/ui/primitives";
import {
  financeBotAdminHref,
  type FinanceBotSection,
} from "./finance-bot-admin-routes";
import { FinanceOverviewSection } from "./finance-overview-section";

const FinanceIntegrationsSection = dynamic(
  () =>
    import("./finance-integrations-section").then(
      (module) => module.FinanceIntegrationsSection,
    ),
  { loading: () => null },
);
const FinanceMonetizationSection = dynamic(
  () =>
    import("./finance-monetization-section").then(
      (module) => module.FinanceMonetizationSection,
    ),
  { loading: () => null },
);
const FinanceSubscribersSection = dynamic(
  () =>
    import("./finance-subscribers-section").then(
      (module) => module.FinanceSubscribersSection,
    ),
  { loading: () => null },
);
const BotAdsSection = dynamic(
  () => import("../ads/bot-ads-section").then((module) => module.BotAdsSection),
  { loading: () => <LoadingState /> },
);
const sections: Array<{
  id: FinanceBotSection;
  label: string;
  icon: typeof BarChart3;
}> = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "ads", label: "Ads", icon: Megaphone },
  { id: "monetization", label: "Monetization", icon: CreditCard },
  { id: "users", label: "Users", icon: UsersRound },
  { id: "integrations", label: "Integrations", icon: Waypoints },
];
export function FinanceBotAdmin({
  botId,
  environment = "PRODUCTION",
  section = "overview",
}: {
  botId: string;
  environment?: "LOCAL" | "PRODUCTION";
  section?: FinanceBotSection;
}) {
  return (
    <AppShell>
      <Link
        href="/telegram-bots"
        className="mb-3 inline-flex items-center gap-2 text-sm text-neutral-300 hover:text-white"
      >
        <ArrowLeft size={16} aria-hidden /> Back to bots
      </Link>
      <PageHeader
        title="Finance Bot"
        subtitle="Subscriptions, users, integrations, and advertising for this bot."
      />
      <nav
        className="mb-5 inline-flex max-w-full overflow-x-auto rounded-lg border border-neutral-700 bg-neutral-900 p-1"
        aria-label="Finance administration sections"
      >
        {sections.map(({ id, label, icon: Icon }) => (
          <Link
            key={id}
            href={financeBotAdminHref(botId, id, environment)}
            aria-current={section === id ? "page" : undefined}
            className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium ${section === id ? "bg-blue-600 text-white hover:bg-blue-500" : "text-neutral-300 hover:bg-neutral-800"}`}
          >
            <Icon size={16} aria-hidden />
            {label}
          </Link>
        ))}
      </nav>
      {section === "overview" ? (
        <FinanceOverviewSection botId={botId} environment={environment} />
      ) : null}
      {section === "monetization" ? (
        <FinanceMonetizationSection botId={botId} />
      ) : null}
      {section === "users" ? (
        <FinanceSubscribersSection
          key={environment}
          botId={botId}
          environment={environment}
        />
      ) : null}
      {section === "integrations" ? (
        <FinanceIntegrationsSection botId={botId} />
      ) : null}
      {section === "ads" ? (
        <BotAdsSection
          key={`${botId}:${environment}`}
          botId={botId}
          environment={environment}
        />
      ) : null}
    </AppShell>
  );
}
