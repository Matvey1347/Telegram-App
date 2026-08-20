"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/primitives";
import { QueryContentState } from "@/components/ui/query-content-state";
import { greeterApi } from "@/lib/api";
import { greeterKeys } from "@/lib/query-keys";
import {
  GreeterOverviewSection,
  GreeterChannelsSection,
} from "./greeter-setup-sections";
import { GreeterCaptchaSection } from "./greeter-captcha-section";
import {
  GreeterUsersSection,
  GreeterAnalyticsSection,
} from "./greeter-audience-sections";
import { GreeterAutomationsSection } from "./greeter-automations-section";
import { GreeterBroadcastsSection } from "./greeter-broadcasts-section";
import { GreeterTestModeSection } from "./greeter-test-mode-section";
import { BotBillingMetricsSection } from "../billing/bot-billing-metrics-section";

const tabs = [
  "Overview",
  "Channels",
  "Captcha",
  "Users",
  "Analytics",
  "Automations",
  "Broadcasts",
  "Billing",
  "Test Mode",
] as const;
type Tab = (typeof tabs)[number];

export function GreeterPage({ botId }: { botId: string }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const overview = useQuery({
    queryKey: greeterKeys.overview(botId),
    queryFn: () => greeterApi.overview(botId),
  });
  return (
    <AppShell>
      <PageHeader
        title={
          overview.data ? `${overview.data.bot.label} · Greeter` : "Greeter"
        }
        subtitle="Approve join requests, automate onboarding, and message your audience."
      />
      <QueryContentState
        isLoading={overview.isLoading}
        isError={overview.isError}
        isEmpty={!overview.data}
        loadingText="Loading Greeter"
        errorText="Failed to load Greeter configuration."
        emptyText="Greeter is unavailable"
        onRetry={() => void overview.refetch()}
      >
        {overview.data ? (
          <>
            <nav
              aria-label="Greeter sections"
              className="mb-5 flex gap-1 overflow-x-auto border-b border-neutral-800 pb-px"
            >
              {tabs.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === item ? "border-blue-500 text-white" : "border-transparent text-neutral-400 hover:text-neutral-200"}`}
                >
                  {item}
                </button>
              ))}
            </nav>
            {tab === "Overview" ? (
              <GreeterOverviewSection overview={overview.data} />
            ) : null}
            {tab === "Channels" ? (
              <GreeterChannelsSection
                botId={botId}
                channels={overview.data.channels}
              />
            ) : null}
            {tab === "Captcha" ? (
              <GreeterCaptchaSection
                botId={botId}
                config={overview.data.config}
                configuration={overview.data.configuration}
              />
            ) : null}
            {tab === "Users" ? (
              <GreeterUsersSection
                botId={botId}
                channels={overview.data.channels}
              />
            ) : null}
            {tab === "Analytics" ? (
              <GreeterAnalyticsSection
                botId={botId}
                channels={overview.data.channels}
              />
            ) : null}
            {tab === "Automations" ? (
              <GreeterAutomationsSection
                botId={botId}
                channels={overview.data.channels}
              />
            ) : null}
            {tab === "Broadcasts" ? (
              <GreeterBroadcastsSection
                botId={botId}
                channels={overview.data.channels}
              />
            ) : null}
            {tab === "Test Mode" ? (
              <GreeterTestModeSection
                botId={botId}
                channels={overview.data.channels}
              />
            ) : null}
            {tab === "Billing" ? (
              <BotBillingMetricsSection botId={botId} />
            ) : null}
          </>
        ) : null}
      </QueryContentState>
    </AppShell>
  );
}
