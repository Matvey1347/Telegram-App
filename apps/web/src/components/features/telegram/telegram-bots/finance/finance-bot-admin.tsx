"use client";
import { useState } from "react";
import { BarChart3, CreditCard, UsersRound, Waypoints } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button, PageHeader } from "@/components/ui/primitives";
import { FinanceIntegrationsSection } from "./finance-integrations-section";
import { FinanceMonetizationSection } from "./finance-monetization-section";
import { FinanceOverviewSection } from "./finance-overview-section";
import { FinanceSubscribersSection } from "./finance-subscribers-section";
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
  { id: "subscribers", label: "Subscribers", icon: UsersRound },
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
      {section === "overview" ? <FinanceOverviewSection botId={botId} /> : null}
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
