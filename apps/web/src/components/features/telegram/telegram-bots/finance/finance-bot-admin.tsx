"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { BarChart3, CreditCard, UsersRound, Waypoints } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button, PageHeader } from "@/components/ui/primitives";
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
type FinanceAdminSection =
  | "overview"
  | "monetization"
  | "subscribers"
  | "integrations";
const sections: Array<{
  id: FinanceAdminSection;
  label: string;
  icon: typeof BarChart3;
}> = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "monetization", label: "Monetization", icon: CreditCard },
  { id: "subscribers", label: "Users", icon: UsersRound },
  { id: "integrations", label: "Integrations", icon: Waypoints },
];
export function FinanceBotAdmin({ botId }: { botId: string }) {
  const [section, setSection] = useState<FinanceAdminSection>("overview");
  return (
    <AppShell>
      <PageHeader
        title="Finance Bot"
        subtitle="Billing, subscribers, and integrations for this bot."
      />
      <nav
        className="mb-5 flex flex-wrap gap-2"
        aria-label="Finance administration sections"
      >
        {sections.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant={section === id ? "primary" : "secondary"}
            onClick={() => setSection(id)}
          >
            <Icon size={16} aria-hidden />
            {label}
          </Button>
        ))}
      </nav>
      {section === "overview" ? (
        <FinanceOverviewSection botId={botId} />
      ) : null}
      {section === "monetization" ? (
        <FinanceMonetizationSection botId={botId} />
      ) : null}
      {section === "subscribers" ? (
        <FinanceSubscribersSection botId={botId} />
      ) : null}
      {section === "integrations" ? (
        <FinanceIntegrationsSection botId={botId} />
      ) : null}
    </AppShell>
  );
}
